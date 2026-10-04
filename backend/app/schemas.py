from typing import Annotated, Literal

from pydantic import (
    AwareDatetime, BaseModel, ConfigDict, Field, StringConstraints, model_validator,
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


class DemoUsers(BaseModel):
    items: list[Author]


class Health(BaseModel):
    status: Literal['ok'] = 'ok'
    demo_mode: bool
