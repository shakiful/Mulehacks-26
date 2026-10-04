from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, Index, JSON, String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base, UTCDateTime, utcnow


class User(Base):
    __tablename__ = 'users'

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    major: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class StudentAccount(Base):
    __tablename__ = 'student_accounts'

    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'), primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    active: Mapped[bool] = mapped_column(default=True)


class AuthSession(Base):
    __tablename__ = 'auth_sessions'

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('student_accounts.user_id'), index=True)
    csrf_token: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime(), index=True)
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


class Connection(Base):
    __tablename__ = 'connections'
    __table_args__ = (
        CheckConstraint("status IN ('PENDING','ACCEPTED','DECLINED','CANCELLED')"),
        CheckConstraint('requester_id != receiver_id'),
        CheckConstraint('source_post_id != target_post_id'),
        Index('uq_active_connection_pair', 'pair_low', 'pair_high', unique=True,
              sqlite_where=text("status IN ('PENDING','ACCEPTED')")),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    requester_id: Mapped[int] = mapped_column(ForeignKey('users.id'), index=True)
    receiver_id: Mapped[int] = mapped_column(ForeignKey('users.id'), index=True)
    source_post_id: Mapped[int] = mapped_column(ForeignKey('posts.id'))
    target_post_id: Mapped[int] = mapped_column(ForeignKey('posts.id'))
    pair_low: Mapped[int]
    pair_high: Mapped[int]
    status: Mapped[str] = mapped_column(String(10), default='PENDING')
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, onupdate=utcnow)
    reservation: Mapped['RideReservation | None'] = relationship(lazy='joined', back_populates='connection')

    @property
    def reserved_seats(self):
        return self.reservation.seats if self.reservation is not None else 0


class RideReservation(Base):
    __tablename__ = 'ride_reservations'
    __table_args__ = (CheckConstraint('seats >= 1'),)

    connection_id: Mapped[int] = mapped_column(ForeignKey('connections.id'), primary_key=True)
    request_post_id: Mapped[int] = mapped_column(ForeignKey('posts.id'), unique=True)
    offer_post_id: Mapped[int] = mapped_column(ForeignKey('posts.id'), index=True)
    seats: Mapped[int]
    connection: Mapped[Connection] = relationship(back_populates='reservation')


class PostEmbedding(Base):
    __tablename__ = 'post_embeddings'
    __table_args__ = (CheckConstraint('dimensions >= 1'),)

    post_id: Mapped[int] = mapped_column(ForeignKey('posts.id', ondelete='CASCADE'), primary_key=True)
    provider: Mapped[str] = mapped_column(String(80))
    model: Mapped[str] = mapped_column(String(200))
    dimensions: Mapped[int]
    input_version: Mapped[str] = mapped_column(String(80))
    input_hash: Mapped[str] = mapped_column(String(64))
    vector: Mapped[list] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
