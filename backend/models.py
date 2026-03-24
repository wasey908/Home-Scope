"""SQLAlchemy ORM models for HomeScope."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Column, String, Float, Integer, DateTime, Text, ForeignKey, JSON, Boolean, LargeBinary
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from database import Base


def utcnow():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    # Relationships
    scenarios = relationship("Scenario", back_populates="user", cascade="all, delete-orphan")
    preference_weights = relationship(
        "PreferenceWeights", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )


class Scenario(Base):
    __tablename__ = "scenarios"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)
    name = Column(String(255), nullable=False, default="New Scenario")
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    last_completed_step = Column(Integer, default=0)

    # Store wizard inputs as JSON (places, homes, travel prefs)
    wizard_inputs = Column(JSON, default=dict)

    # Store computed results as JSON
    results = Column(JSON, nullable=True)

    # Store feedback as JSON  { homeId: "liked" | "disliked" | "neutral" }
    feedback = Column(JSON, nullable=True)

    # Store learned preferences snapshot
    learned_preferences = Column(JSON, nullable=True)

    # Relationships
    user = relationship("User", back_populates="scenarios")


class PreferenceWeights(Base):
    __tablename__ = "preference_weights"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False)
    transit_time = Column(Float, default=0.20)
    driving_time = Column(Float, default=0.15)
    walking_time = Column(Float, default=0.10)
    transfer_count = Column(Float, default=0.10)
    walking_duration = Column(Float, default=0.10)
    variability = Column(Float, default=0.15)
    reliability = Column(Float, default=0.20)
    interaction_count = Column(Integer, default=0)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    # Relationships
    user = relationship("User", back_populates="preference_weights")


class GeocodeCache(Base):
    __tablename__ = "geocode_cache"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    address_key = Column(String(512), unique=True, nullable=False, index=True)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    formatted_address = Column(String(512), nullable=False)
    fetched_at = Column(DateTime(timezone=True), default=utcnow)


class DirectionsCache(Base):
    __tablename__ = "directions_cache"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cache_key = Column(String(512), unique=True, nullable=False, index=True)
    result_json = Column(JSON, nullable=False)
    fetched_at = Column(DateTime(timezone=True), default=utcnow)


# ─── ML Ranking System ─────────────────────────────────────────────


class UserInteraction(Base):
    """Logs user interactions with homes (like, dislike, view details, select top)."""
    __tablename__ = "user_interactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    scenario_id = Column(UUID(as_uuid=True), ForeignKey("scenarios.id"), nullable=False, index=True)
    home_id = Column(Integer, nullable=False)
    action = Column(String(32), nullable=False)  # 'liked', 'disliked', 'viewed_details', 'selected_top'
    created_at = Column(DateTime(timezone=True), default=utcnow)

    # Relationships
    user = relationship("User", backref="interactions")
    scenario = relationship("Scenario", backref="interactions")


class UserPreferenceProfile(Base):
    """Aggregated user preference stats for ML personalisation features."""
    __tablename__ = "user_preference_profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False)
    avg_liked_commute = Column(Float, default=0.0)
    avg_liked_rent = Column(Float, default=0.0)
    interaction_count = Column(Integer, default=0)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    # Relationships
    user = relationship("User", backref="preference_profile")


class MLModel(Base):
    """Stores trained LightGBM ranking models."""
    __tablename__ = "ml_models"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    model_name = Column(String(128), nullable=False)
    model_version = Column(Integer, nullable=False)
    model_blob = Column(LargeBinary, nullable=False)
    feature_names = Column(JSON, nullable=False)
    metrics = Column(JSON, nullable=True)
    trained_at = Column(DateTime(timezone=True), default=utcnow)
    is_active = Column(Boolean, default=False)
