"""Deterministic compatibility gates and evidence-based heuristic scoring."""
from sqlalchemy import select

from .ai.understanding import normalized
from .ai.embeddings import EmbeddingResult, cosine_similarity
from .errors import APIError
from .models import Post
from .posts import get_post
from .rides import MAX_DISTANCE_KM, attach_availability, route_distances, seats_remaining

STOPWORDS = set('a an the i you my your can need help with to from for and of at in on have looking someone synthetic demo'.split())


def tokens(value):
    return set(normalized(value).split()) - STOPWORDS


def overlap(left, right):
    a, b = tokens(left), tokens(right)
    return len(a & b) / len(a | b) if a and b else 0.0


def details_text(post):
    return ' '.join(str(value) for value in post.details.values() if value is not None)


def known_equal(left, right):
    return bool(left and right and normalized(str(left)) == normalized(str(right)))


def compatible(source: Post, target: Post) -> bool:
    if source.id == target.id or source.user_id == target.user_id:
        return False
    if source.status != 'OPEN' or target.status != 'OPEN' or source.category != target.category:
        return False
    if (source.intent, target.intent) not in {('REQUEST', 'OFFER'), ('OFFER', 'REQUEST'), ('PARTNER', 'PARTNER')}:
        return False
    if source.category == 'RIDE':
        distances = route_distances(source, target)
        if distances is None or any(distance > MAX_DISTANCE_KM for distance in distances):
            return False
        if getattr(source, 'ride_booked', False) or getattr(target, 'ride_booked', False):
            return False
        if not source.starts_at or not target.starts_at or abs((source.starts_at - target.starts_at).total_seconds()) > 3600:
            return False
        offered, requested = (source, target) if source.intent == 'OFFER' else (target, source)
        return seats_remaining(offered) >= requested.details.get('seats', 0) > 0
    if all((source.starts_at, source.ends_at, target.starts_at, target.ends_at)):
        if max(source.starts_at, target.starts_at) >= min(source.ends_at, target.ends_at):
            return False
    if source.category == 'STUDY':
        a, b = source.details.get('mode'), target.details.get('mode')
        if a and b and a != b:
            return False
        if a == b == 'IN_PERSON' and source.location and target.location and not known_equal(source.location, target.location):
            return False
    elif source.category == 'RESTAURANT':
        if source.details.get('activity_type') != target.details.get('activity_type'):
            return False
    elif source.category == 'COMMUNITY':
        if source.details.get('subcategory') != target.details.get('subcategory'):
            return False
    return True


def score_pair(source: Post, target: Post, semantic_similarity=None):
    reasons, warnings = [], []
    if source.category == 'RIDE':
        minutes = abs((source.starts_at - target.starts_at).total_seconds()) / 60
        pickup, destination = route_distances(source, target)
        offer = source if source.intent == 'OFFER' else target
        score = (0.25 * max(0, 1 - pickup / MAX_DISTANCE_KM)
                 + 0.25 * max(0, 1 - destination / MAX_DISTANCE_KM)
                 + 0.35 * max(0, 1 - minutes / 60) + 0.15)
        reasons = [f'Pickup points are {pickup:.2f} km apart',
                   f'Destination points are {destination:.2f} km apart',
                   f'Departures are {minutes:g} minutes apart',
                   f'{seats_remaining(offer)} remaining seats cover the requested seats']
        warnings = ['Distances are straight-line measurements, not road routes or driving times.']
    else:
        semantic = semantic_similarity if semantic_similarity is not None else overlap(source.title + ' ' + source.text, target.title + ' ' + target.text)
        if semantic:
            reasons.append('Semantic relevance between confirmed posts' if semantic_similarity is not None else 'Shared words in the confirmed posts')
        if semantic_similarity is None:
            warnings.append('Heuristic token overlap is used; no semantic embedding provider is active.')
        availability = 0.0
        if all((source.starts_at, source.ends_at, target.starts_at, target.ends_at)):
            availability = 1.0
            reasons.append('Overlapping confirmed availability')
        else:
            warnings.append('Exact availability is missing; its score contribution is zero.')
        location = float(known_equal(source.location, target.location))
        if location:
            reasons.append('Same confirmed meeting location')
        if source.category == 'STUDY':
            topic = overlap(' '.join(str(source.details.get(f) or '') for f in ('course', 'topic')),
                            ' '.join(str(target.details.get(f) or '') for f in ('course', 'topic')))
            if topic:
                reasons.append('Overlapping course/topic terms')
            mode = source.details.get('mode')
            other_mode = target.details.get('mode')
            mode_location = 0.0
            if mode and mode == other_mode:
                reasons.append('Same confirmed study mode')
                mode_location = 1.0 if mode == 'ONLINE' else location
            if mode_location == 0:
                warnings.append('Compatible mode/location is unconfirmed; its score contribution is zero.')
            score = 0.40 * semantic + 0.25 * topic + 0.20 * availability + 0.15 * mode_location
        else:
            if source.category == 'RESTAURANT':
                preference = max(overlap(source.details.get('restaurant'), target.details.get('restaurant')),
                                 overlap(source.details.get('cuisine'), target.details.get('cuisine')))
                relevance = 0.5 + 0.5 * preference
                reasons.append('Same confirmed dining activity')
                if preference:
                    reasons.append('Shared restaurant/cuisine preference')
            else:
                relevance = 1.0
                reasons.append('Same confirmed community subcategory')
            if source.starts_at and target.starts_at and not all((source.ends_at, target.ends_at)):
                availability = max(0, 1 - abs((source.starts_at - target.starts_at).total_seconds()) / 3600)
                warnings = [w for w in warnings if not w.startswith('Exact availability')]
                if availability:
                    reasons.append('Confirmed start times within one hour')
            score = 0.50 * semantic + 0.25 * relevance + 0.25 * (0.5 * availability + 0.5 * location)
    return {'post': target, 'score': round(100 * score, 1), 'reasons': reasons, 'warnings': warnings}


def find_matches(db, user, post_id, limit, embeddings=None):
    source = get_post(db, post_id)
    if source.user_id != user.id:
        raise APIError(403, 'FORBIDDEN', 'Only the source author can request matches.')
    if source.status != 'OPEN':
        raise APIError(400, 'INVALID_OPERATION', 'Matches require an OPEN source post.')
    candidates = db.scalars(select(Post).where(Post.category == source.category, Post.status == 'OPEN', Post.user_id != user.id)).all()
    if source.category == 'RIDE' and route_distances(source, source) is None:
        raise APIError(400, 'INVALID_OPERATION', 'This older ride has no map pins. Edit your post to select From and To on the map, or create a new mapped ride.')
    attach_availability(db, candidates)
    candidates = [target for target in candidates if compatible(source, target)]
    prepared = EmbeddingResult()
    if embeddings is not None and candidates and source.category != 'RIDE':
        prepared = embeddings.prepare(db, [source, *candidates])
    matches = []
    for target in candidates:
        semantic = cosine_similarity(prepared.vectors[source.id], prepared.vectors[target.id]) if prepared.mode == 'SEMANTIC' else None
        match = score_pair(source, target, semantic)
        match['warnings'].extend(prepared.warnings)
        matches.append(match)
    matches.sort(key=lambda match: (-match['score'], match['post'].id))
    return {'post_id': post_id, 'matching_mode': prepared.mode, 'matches': matches[:limit]}
