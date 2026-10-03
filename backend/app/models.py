from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, Index, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base, UTCDateTime, utcnow


class User(Base):
    __tablename__ = 'users'

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    major: Mapped[str | None] = mapped_column(String(120), nullable=True)
    is_demo: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class Post(Base):
    __tablename__ = 'posts'
    __table_args__ = (
        CheckConstraint("category IN ('RIDE','STUDY','RESTAURANT','COMMUNITY')"),
        CheckConstraint("intent IN ('REQUEST','OFFER','PARTNER')"),
        CheckConstraint("status IN ('OPEN','COMPLETED','CANCELLED')"),
        CheckConstraint("intent != 'PARTNER' OR category IN ('STUDY','COMMUNITY')"),
        Index('ix_posts_category_status', 'category', 'status'),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'), index=True)
    author: Mapped[User] = relationship(lazy='joined')
    category: Mapped[str] = mapped_column(String(20))
    intent: Mapped[str] = mapped_column(String(10))
    title: Mapped[str] = mapped_column(String(120))
    text: Mapped[str] = mapped_column(String(4000))
    status: Mapped[str] = mapped_column(String(10), default='OPEN')
    location: Mapped[str | None] = mapped_column(nullable=True)
    starts_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    details: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, onupdate=utcnow)
    # Internal marker makes seeding repeatable without deleting user-created posts.
    seed_key: Mapped[str | None] = mapped_column(unique=True, nullable=True)
