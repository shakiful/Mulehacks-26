from typing import Annotated, Any, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import (
    AwareDatetime, BaseModel, ConfigDict, Field, SecretStr, StringConstraints, TypeAdapter, field_validator, model_validator,
)

Category = Literal['RIDE', 'STUDY', 'RESTAURANT', 'COMMUNITY']
Intent = Literal['REQUEST', 'OFFER', 'PARTNER']
PostStatus = Literal['OPEN', 'COMPLETED', 'CANCELLED']
Nonempty = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
PositiveInt = Annotated[int, Field(strict=True, ge=1)]


class InputModel(BaseModel):
    model_config = ConfigDict(extra='forbid')


class RideDetails(InputModel):
    origin: Nonempty
    destination: Nonempty
    seats: PositiveInt
    purpose: str | None = None


class StudyDetails(InputModel):
    course: Nonempty | None = None
    topic: Nonempty | None = None
    skill_level: Literal['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] | None = None
    mode: Literal['ONLINE', 'IN_PERSON'] | None = None

    @model_validator(mode='after')
    def course_or_topic(self):
        if not self.course and not self.topic:
            raise ValueError('Provide course or topic')
        return self


class RestaurantDetails(InputModel):
    restaurant: Nonempty | None = None
    cuisine: Nonempty | None = None
    activity_type: Literal['DINING', 'GROUP_ORDER', 'TRIP']
    group_size: PositiveInt

    @model_validator(mode='after')
    def restaurant_or_cuisine(self):
        if not self.restaurant and not self.cuisine:
            raise ValueError('Provide restaurant or cuisine')
        return self


class CommunityDetails(InputModel):
    subcategory: Literal[
        'BORROW_LEND', 'CAMPUS_HELP', 'ACTIVITY', 'MOVING', 'SHOPPING',
        'NEW_STUDENT', 'OTHER',
    ]
    item: str | None = None
    activity: str | None = None


class CommonPost(InputModel):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]
    location: str | None = None
    starts_at: AwareDatetime | None = None
    ends_at: AwareDatetime | None = None

    @model_validator(mode='after')
    def valid_interval(self):
        if self.ends_at is not None:
            if self.starts_at is None:
                raise ValueError('ends_at requires starts_at')
            if self.ends_at <= self.starts_at:
                raise ValueError('ends_at must be later than starts_at')
        return self


class RidePost(CommonPost):
    category: Literal['RIDE']
    intent: Literal['REQUEST', 'OFFER']
    starts_at: AwareDatetime
    details: RideDetails


class StudyPost(CommonPost):
    category: Literal['STUDY']
    intent: Intent
    details: StudyDetails


class RestaurantPost(CommonPost):
    category: Literal['RESTAURANT']
    intent: Literal['REQUEST', 'OFFER']
    starts_at: AwareDatetime
    details: RestaurantDetails


class CommunityPost(CommonPost):
    category: Literal['COMMUNITY']
    intent: Intent
    details: CommunityDetails


PostCreate = Annotated[
    RidePost | StudyPost | RestaurantPost | CommunityPost,
    Field(discriminator='category'),
]


class StatusUpdate(InputModel):
    status: Literal['COMPLETED', 'CANCELLED']


class Author(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str


class PostResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    author: Author
    category: Category
    intent: Intent
    title: str
    text: str
    location: str | None
    starts_at: AwareDatetime | None
    ends_at: AwareDatetime | None
    details: dict
    status: PostStatus
    created_at: AwareDatetime
    updated_at: AwareDatetime


class PostList(BaseModel):
    items: list[PostResponse]
    total: int
    limit: int
    offset: int


class LoginInput(InputModel):
    username: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
    password: SecretStr = Field(min_length=1, max_length=256)


class SignedInUser(Author):
    username: str


class SessionResponse(BaseModel):
    user: SignedInUser | None
    csrf_token: str | None


class Health(BaseModel):
    status: Literal['ok'] = 'ok'


UnderstandingCategory = Literal['RIDE', 'STUDY', 'RESTAURANT', 'COMMUNITY', 'CYBERSECURITY']
ConnectionStatus = Literal['PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED']


class UnderstandInput(InputModel):
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]
    category_hint: UnderstandingCategory | None = None
    reference_time: AwareDatetime
    timezone: str

    @field_validator('timezone')
    @classmethod
    def valid_timezone(cls, value):
        try:
            ZoneInfo(value)
        except ZoneInfoNotFoundError as exc:
            raise ValueError('Use a valid IANA timezone') from exc
        return value


class Understanding(BaseModel):
    category: UnderstandingCategory
    intent: Intent | None
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    text: str
    location: str | None = None
    starts_at: AwareDatetime | None = None
    ends_at: AwareDatetime | None = None
    details: dict[str, Any] | None
    missing_fields: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    analysis_mode: Literal['LLM', 'HEURISTIC'] = 'HEURISTIC'

    @model_validator(mode='after')
    def validate_preview(self):
        if self.category == 'CYBERSECURITY':
            if self.intent is not None or self.details is not None:
                raise ValueError('Security previews cannot contain public post details')
            return self
        schema = {'RIDE': RideDetails, 'STUDY': StudyDetails,
                  'RESTAURANT': RestaurantDetails, 'COMMUNITY': CommunityDetails}[self.category]
        if self.details is None or self.intent is None:
            raise ValueError('Public previews require intent and category details')
        if self.category in ('RIDE', 'RESTAURANT') and self.intent == 'PARTNER':
            raise ValueError('PARTNER is unsupported for this category')
        for name, value in self.details.items():
            if name not in schema.model_fields:
                raise ValueError('Unexpected category detail')
            field = schema.model_fields[name]
            annotation = Annotated[field.annotation, *field.metadata] if field.metadata else field.annotation
            if value is not None or 'details.' + name not in self.missing_fields:
                self.details[name] = TypeAdapter(annotation).validate_python(value)
        required = {'RIDE': ['origin', 'destination', 'seats'],
                    'RESTAURANT': ['activity_type', 'group_size'],
                    'COMMUNITY': ['subcategory'], 'STUDY': []}[self.category]
        for name in required:
            if self.details.get(name) is None and 'details.' + name not in self.missing_fields:
                raise ValueError('Unresolved required detail must appear in missing_fields')
        if self.category in ('RIDE', 'RESTAURANT') and self.starts_at is None and 'starts_at' not in self.missing_fields:
            raise ValueError('Unresolved time must appear in missing_fields')
        alternatives = {'STUDY': ('course', 'topic'), 'RESTAURANT': ('restaurant', 'cuisine')}.get(self.category)
        if alternatives and not any(self.details.get(name) for name in alternatives):
            if not any('details.' + name in self.missing_fields for name in alternatives):
                raise ValueError('Unresolved required subject/preference must appear in missing_fields')
        if self.ends_at is not None and (self.starts_at is None or self.ends_at <= self.starts_at):
            raise ValueError('Preview ends_at must be after starts_at')
        return self


class MatchInput(InputModel):
    post_id: PositiveInt
    limit: Annotated[int, Field(strict=True, ge=1, le=20)] = 5


class Match(BaseModel):
    post: PostResponse
    score: Annotated[float, Field(ge=0, le=100)]
    reasons: list[str]
    warnings: list[str]


class MatchResponse(BaseModel):
    post_id: int
    matching_mode: Literal['SEMANTIC', 'HEURISTIC']
    matches: list[Match]


class ConnectionInput(InputModel):
    source_post_id: PositiveInt
    target_post_id: PositiveInt


class ConnectionUpdate(InputModel):
    status: Literal['ACCEPTED', 'DECLINED', 'CANCELLED']


class ConnectionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    requester_id: int
    receiver_id: int
    source_post_id: int
    target_post_id: int
    status: ConnectionStatus
    created_at: AwareDatetime
    updated_at: AwareDatetime


class ConnectionList(BaseModel):
    items: list[ConnectionResponse]
