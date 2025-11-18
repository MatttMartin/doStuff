# backend/models.py

from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import BigInteger, Integer, Text, Boolean, TIMESTAMP, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID
from typing import Optional
from db import Base
import uuid


# =========================================================
# USERS
# =========================================================
class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    username: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    email: Mapped[Optional[str]] = mapped_column(Text, unique=True, nullable=True)
    bio: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=func.now()
    )

    runs = relationship("Run", back_populates="user", cascade="all, delete-orphan")
    likes = relationship("Like", back_populates="user", cascade="all, delete-orphan")
    comments = relationship("Comment", back_populates="user", cascade="all, delete-orphan")


# =========================================================
# LEVELS
# =========================================================
class Level(Base):
    __tablename__ = "levels"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    # Replaces "difficulty" — determines progression stage
    level_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    seconds_limit: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    steps = relationship("RunStep", back_populates="level", cascade="all, delete-orphan")


# =========================================================
# RUNS (One active run per user)
# =========================================================
class Run(Base):
    __tablename__ = "runs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE")
    )
    caption: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    started_at = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=func.now()
    )
    finished_at = mapped_column(TIMESTAMP(timezone=True), nullable=True)

    public: Mapped[bool] = mapped_column(Boolean, default=True)

    # -----------------------------------------------------
    # NEW: persistent challenge state
    # -----------------------------------------------------

    # Which challenge is currently active?
    pending_level_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("levels.id", ondelete="SET NULL"),
        nullable=True
    )

    # Are we on the proof-upload screen?
    proof_pending: Mapped[bool] = mapped_column(Boolean, default=False)

    # When the current challenge began (used for timer recovery)
    pending_started_at = mapped_column(TIMESTAMP(timezone=True), nullable=True)

    # How many seconds they had for this challenge
    pending_time_limit: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # How many skips used this run
    skips_used: Mapped[int] = mapped_column(Integer, default=0)

    # -----------------------------------------------------
    # Relationships
    # -----------------------------------------------------
    user = relationship("User", back_populates="runs")

    steps = relationship("RunStep", back_populates="run", cascade="all, delete-orphan")

    # FIXED: these must be here to match Like.back_populates and Comment.back_populates
    likes = relationship("Like", back_populates="run", cascade="all, delete-orphan")
    comments = relationship("Comment", back_populates="run", cascade="all, delete-orphan")

    # Lookup for the pending challenge (read-only)
    pending_level = relationship(
        "Level",
        primaryjoin="Run.pending_level_id == Level.id",
        viewonly=True
    )


# =========================================================
# RUN STEPS (history of completed/skipped challenges)
# =========================================================
class RunStep(Base):
    __tablename__ = "run_steps"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("runs.id", ondelete="CASCADE")
    )
    level_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("levels.id", ondelete="CASCADE")
    )

    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    proof_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Explicit skip (instead of relying on proof_url sentinel)
    skipped_whole: Mapped[bool] = mapped_column(Boolean, default=False)

    completed_at = mapped_column(TIMESTAMP(timezone=True), nullable=True)

    run = relationship("Run", back_populates="steps")
    level = relationship("Level", back_populates="steps")


# =========================================================
# LIKES
# =========================================================
class Like(Base):
    __tablename__ = "likes"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("runs.id", ondelete="CASCADE")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE")
    )

    created_at = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=func.now()
    )

    run = relationship("Run", back_populates="likes")
    user = relationship("User", back_populates="likes")


# =========================================================
# COMMENTS
# =========================================================
class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("runs.id", ondelete="CASCADE")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE")
    )

    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=func.now()
    )

    run = relationship("Run", back_populates="comments")
    user = relationship("User", back_populates="comments")
