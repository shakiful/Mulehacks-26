import re
from datetime import date, datetime, timedelta, timezone
from typing import Protocol
from zoneinfo import ZoneInfo

from ..config import Settings
from ..errors import APIError
from ..schemas import UnderstandInput, Understanding


class UnderstandingProvider(Protocol):
    def preview(self, request: UnderstandInput) -> Understanding: ...


def normalized(value: str | None) -> str:
    return ' '.join(re.findall(r'\w+', (value or '').casefold()))


def extract_time(request: UnderstandInput):
    text = request.text.lower()
    zone = ZoneInfo(request.timezone)
    reference = request.reference_time.astimezone(zone)
    warnings = []
    iso = re.search(r'\b\d{4}-\d{2}-\d{2}t\d{2}:\d{2}(?::\d{2})?(?:z|[+-]\d{2}:\d{2})\b', text)
    if iso:
        try:
            return datetime.fromisoformat(iso[0].upper()).astimezone(timezone.utc), warnings
        except ValueError:
            return None, ['Confirm the date and time; the supplied timestamp is invalid.']
    day = None
    explicit_date = re.search(r'\b\d{4}-\d{2}-\d{2}\b', text)
    if explicit_date:
        try:
            day = date.fromisoformat(explicit_date[0])
        except ValueError:
            return None, ['Confirm the date; the supplied date is invalid.']
    elif re.search(r'\btomorrow\b', text):
        day = reference.date() + timedelta(days=1)
    elif re.search(r'\b(today|tonight)\b|this (morning|afternoon|evening)', text):
        day = reference.date()
    clocks = re.findall(
        r'\b(?:at|around|about)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b', text,
    )
    if not clocks:
        clocks = re.findall(r'\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b', text)
    if not clocks:
        clocks = re.findall(r'\b(\d{1,2})(?::(\d{2}))?\s*()(?:tonight|this evening)\b', text)
    if day is None or len(clocks) != 1:
        return None, ['Exact date/time is unspecified or ambiguous; confirm availability.']
    hour, minute, meridiem = clocks[0]
    hour, minute = int(hour), int(minute or 0)
    if minute > 59 or hour > 23 or (meridiem and not 1 <= hour <= 12):
        return None, ['Confirm a valid departure/meeting time.']
    if meridiem:
        hour = hour % 12 + (12 if meridiem == 'pm' else 0)
    elif 1 <= hour <= 12:
        if re.search(r'\btonight\b|(?:this )?(?:evening|afternoon)', text) and hour < 12:
            hour += 12
        elif not re.search(r'\bmorning\b', text) or hour == 12:
            return None, ['Confirm AM or PM for the supplied time.']
    naive = datetime.combine(day, datetime.min.time()).replace(hour=hour, minute=minute)
    first, second = naive.replace(tzinfo=zone, fold=0), naive.replace(tzinfo=zone, fold=1)
    # Ambiguous and nonexistent DST wall-clock times require user confirmation.
    if first.utcoffset() != second.utcoffset() or first.astimezone(timezone.utc).astimezone(zone).replace(tzinfo=None) != naive:
        return None, ['This local time is ambiguous or unavailable during daylight saving; provide an explicit UTC offset.']
    if first < reference:
        warnings.append('This time is earlier than the reference time; confirm the date before posting.')
    warnings.append('Confirm the extracted date/time before posting.')
    return first.astimezone(timezone.utc), warnings


def phrase_after(text: str, prefix: str) -> str | None:
    match = re.search(prefix + r'\s+(.+?)(?=\s+(?:to|at|around|about|today|tomorrow|tonight|with|for|and)\b|[.,!?]|$)', text, re.I)
    return match[1].strip() if match else None


class HeuristicUnderstanding:
    """Conservative keyword extraction; unknown facts stay null, never defaulted."""

    def preview(self, request: UnderstandInput) -> Understanding:
        text, lower = request.text, request.text.casefold()
        category = request.category_hint
        if category is None:
            if re.search(r'\b(phishing|scam|suspicious|password|account expires)\b|https?://', lower):
                category = 'CYBERSECURITY'
            elif re.search(r'\b(ride|lift|carpool|driving)\b', lower):
                category = 'RIDE'
            elif re.search(r'\b(study|studying|tutor|tutoring|sql|python|homework|databases)\b', lower):
                category = 'STUDY'
            elif re.search(r'\b(food|dinner|lunch|cuisine|restaurant|ordering|pizza|chipotle)\b', lower):
                category = 'RESTAURANT'
            else:
                category = 'COMMUNITY'
        if category == 'CYBERSECURITY':
            return Understanding(category=category, intent=None, title='Private security assessment',
                text=text, details=None, warnings=['Use the private security page; this text must not become a public post.'])
        offer = bool(re.search(r'\b(?:offering|offer|i can (?:help|lend|tutor|give|drive)|i have .+ (?:to lend|you can borrow)|available seats)\b', lower))
        partner = bool(re.search(r'\b(partner|together|someone to study with|people to play)\b', lower))
        intent = 'OFFER' if offer else 'PARTNER' if partner and category in ('STUDY', 'COMMUNITY') else 'REQUEST'
        starts_at, warnings = extract_time(request)
        warnings.insert(0, 'Heuristic preview: review and correct the extracted fields before posting.')
        location = phrase_after(text, r'(?:in|at)(?: the)?')
        # A time phrase is not a location.
        if location and (re.match(r'\d', location) or normalized(location) in ('home', 'night')):
            location = None
        missing = []
        if category == 'RIDE':
            origin = phrase_after(text, r'from')
            destination = phrase_after(text, r'to')
            seat_match = re.search(r'\b(\d+)\s+(?:seats?|people|passengers?)\b', lower)
            seats = int(seat_match[1]) if seat_match and int(seat_match[1]) >= 1 else None
            details = dict(origin=origin, destination=destination, seats=seats, purpose=None)
            missing = ['details.' + name for name in ('origin', 'destination', 'seats') if not details[name]]
            title = ('Ride to ' + destination) if destination else 'Ride request'
        elif category == 'STUDY':
            course = next((name for name in ('SQL', 'Python', 'Databases', 'Calculus', 'Chemistry', 'Physics')
                           if re.search(r'\b' + name.lower() + r'\b', lower)), None)
            topic = next((name for name in ('joins', 'loops', 'relational databases', 'algebra', 'derivatives')
                          if name in lower), None)
            if not course and not topic:
                topic = phrase_after(text, r'(?:study|studying|help with|learn)')
            mode = 'ONLINE' if re.search(r'\b(online|zoom|remote)\b', lower) else 'IN_PERSON' if re.search(r'\bin[ -]person\b', lower) else None
            level = next((name.upper() for name in ('beginner', 'intermediate', 'advanced') if name in lower), None)
            details = dict(course=course, topic=topic, skill_level=level, mode=mode)
            if not course and not topic:
                missing = ['details.course', 'details.topic']
            title = 'Study: ' + (course or topic or 'confirm your topic')
        elif category == 'RESTAURANT':
            restaurant = next((name for name in ('Chipotle', 'Pizza Hut') if name.lower() in lower), None)
            cuisine = next((name for name in ('Pizza', 'Korean', 'Indian', 'Chinese', 'Mexican') if name.lower() in lower), None)
            activity = 'GROUP_ORDER' if re.search(r'\b(order|ordering|group order)\b', lower) else 'TRIP' if re.search(r'\btrip\b', lower) else 'DINING' if re.search(r'\b(dinner|lunch|dining|eat)\b', lower) else None
            size_match = re.search(r'\b(?:group of|for)\s+(\d+)\b', lower)
            details = dict(restaurant=restaurant, cuisine=cuisine, activity_type=activity,
                           group_size=int(size_match[1]) if size_match and int(size_match[1]) >= 1 else None)
            if not restaurant and not cuisine:
                missing += ['details.restaurant', 'details.cuisine']
            missing += ['details.' + name for name in ('activity_type', 'group_size') if not details[name]]
            title = 'Food: ' + (restaurant or cuisine or 'confirm your plans')
        else:
            subcategory = next((name for name, pattern in (
                ('BORROW_LEND', r'\b(borrow|lend|loan)\b'), ('MOVING', r'\bmoving\b'),
                ('SHOPPING', r'\bshopping\b'), ('NEW_STUDENT', r'\bnew (here|student)\b'),
                ('ACTIVITY', r'\b(play|soccer|activity|sport)\b'), ('CAMPUS_HELP', r'\b(print|campus help)\b'),
            ) if re.search(pattern, lower)), 'OTHER')
            item = next((name for name in ('calculator', 'book', 'furniture') if name in lower), None)
            activity = next((name for name in ('soccer', 'basketball') if name in lower), None)
            details = dict(subcategory=subcategory, item=item, activity=activity)
            title = text[:120]
        if category in ('RIDE', 'RESTAURANT') and starts_at is None:
            missing.append('starts_at')
        return Understanding(category=category, intent=intent, title=title[:120], text=text,
            location=location, starts_at=starts_at, details=details, missing_fields=missing, warnings=warnings)


class UnderstandingService:
    def __init__(self, settings: Settings, provider: UnderstandingProvider | None = None):
        self.settings = settings
        self.provider = provider

    def preview(self, request: UnderstandInput) -> Understanding:
        if self.settings.ai_provider == 'heuristic' and self.provider is None:
            return HeuristicUnderstanding().preview(request)
        try:
            if self.provider is None:
                raise RuntimeError('No provider configured')
            result = Understanding.model_validate(self.provider.preview(request))
            if request.category_hint and result.category != request.category_hint:
                raise ValueError('Provider ignored manual category')
            if result.text != request.text:
                raise ValueError('Provider changed submitted text')
            return result
        except Exception:
            if not self.settings.ai_fallback_enabled:
                raise APIError(503, 'PROVIDER_UNAVAILABLE', 'Understanding provider is unavailable.') from None
            result = HeuristicUnderstanding().preview(request)
            result.warnings.append('Configured provider is unavailable; using the heuristic fallback.')
            return result
