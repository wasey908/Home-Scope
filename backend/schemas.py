"""Pydantic schemas for request/response validation."""

from __future__ import annotations
from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, EmailStr, Field


# ─── Auth ───────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    email: str
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Scenarios ──────────────────────────────────────────────────────

class PlaceInput(BaseModel):
    name: str
    address: str
    importance: float = 1.0


class HomeInput(BaseModel):
    address: str
    rent: str


class TravelInput(BaseModel):
    selectedTimes: List[str] = []
    changesPreference: int = 50
    walkingPreference: int = 50
    learnPreferences: bool = False
    preferReliable: bool = True


class WizardInputs(BaseModel):
    places: Optional[List[PlaceInput]] = None
    homes: Optional[List[HomeInput]] = None
    travel: Optional[TravelInput] = None


class ScenarioCreate(BaseModel):
    name: Optional[str] = None


class ScenarioUpdate(BaseModel):
    name: Optional[str] = None
    last_completed_step: Optional[int] = None
    wizard_inputs: Optional[WizardInputs] = None
    results: Optional[Dict[str, Any]] = None
    feedback: Optional[Dict[str, str]] = None
    learned_preferences: Optional[Dict[str, float]] = None


class ScenarioResponse(BaseModel):
    id: str
    name: str
    created_at: datetime
    updated_at: datetime
    last_completed_step: int
    wizard_inputs: Dict[str, Any]
    results: Optional[Dict[str, Any]] = None
    feedback: Optional[Dict[str, str]] = None
    learned_preferences: Optional[Dict[str, float]] = None

    class Config:
        from_attributes = True


# ─── Scoring ────────────────────────────────────────────────────────

class TransitStep(BaseModel):
    type: str  # "walking" | "transit"
    durationSec: int
    distanceMeters: int
    instruction: Optional[str] = None
    lineName: Optional[str] = None
    vehicleType: Optional[str] = None
    departureStop: Optional[str] = None
    arrivalStop: Optional[str] = None
    numStops: Optional[int] = None
    headsign: Optional[str] = None


class RouteResult(BaseModel):
    homeId: int
    placeId: int
    mode: str  # "transit" | "driving" | "walking"
    timeWindow: str
    durationSec: int
    distanceMeters: int
    steps: List[TransitStep] = []
    transferCount: int = 0
    walkingDurationSec: int = 0
    summaryText: str = ""
    departureTime: str = ""
    arrivalTime: str = ""
    polyline: Optional[str] = None


class ModeBlendWeights(BaseModel):
    transit: float = 0.6
    driving: float = 0.3
    walking: float = 0.1


class RoutingSettings(BaseModel):
    modeBlendWeights: ModeBlendWeights = ModeBlendWeights()


class ScorePlaceInput(BaseModel):
    id: int
    name: str
    weight: float


class ScoreHomeInput(BaseModel):
    id: int
    address: str
    rentMonthlyGBP: float
    lat: float
    lng: float


class ScoreRequest(BaseModel):
    routes: List[RouteResult]
    homes: List[ScoreHomeInput]
    places: List[ScorePlaceInput]
    settings: RoutingSettings = RoutingSettings()
    fallbackDurations: Dict[str, float] = {}
    prefWeights: Optional[Dict[str, float]] = None


class ModeBreakdown(BaseModel):
    durationMin: int
    distanceMiles: float
    transferCount: Optional[int] = None
    walkingMin: Optional[int] = None
    steps: Optional[List[TransitStep]] = None


class PlaceBreakdown(BaseModel):
    placeId: int
    placeName: str
    weight: float
    byMode: Dict[str, ModeBreakdown]
    byTimeWindow: Dict[str, int]
    blendedMinutes: float


class HomeFeatureVector(BaseModel):
    transitTime: float = 0
    drivingTime: float = 0
    walkingTime: float = 0
    transferCount: float = 0
    walkingDuration: float = 0
    variability: float = 0
    reliability: float = 0


class HomeScoreResponse(BaseModel):
    homeId: int
    address: str
    rentMonthlyGBP: float
    blendedCommuteMinutes: float
    variabilityScore: int
    robustnessScore: int
    totalScore: int
    variabilityLabel: str
    robustnessLabel: str
    perPlaceBreakdown: List[PlaceBreakdown]
    perModeStats: Dict[str, Dict[str, float]]
    featureVector: Optional[HomeFeatureVector] = None


class ScoreResponse(BaseModel):
    scores: List[HomeScoreResponse]


# ─── Preferences ────────────────────────────────────────────────────

class PreferenceWeightsSchema(BaseModel):
    transitTime: float = 0.20
    drivingTime: float = 0.15
    walkingTime: float = 0.10
    transferCount: float = 0.10
    walkingDuration: float = 0.10
    variability: float = 0.15
    reliability: float = 0.20
    interactionCount: int = 0


class UpdateWeightsRequest(BaseModel):
    features: HomeFeatureVector
    averageFeatures: HomeFeatureVector
    direction: int  # +1 or -1


# ─── Geocoding ──────────────────────────────────────────────────────

class GeocodeRequest(BaseModel):
    address: str


class GeocodeResponse(BaseModel):
    lat: float
    lng: float
    formattedAddress: str


# ─── Directions ─────────────────────────────────────────────────────

class DirectionRequest(BaseModel):
    originLat: float
    originLng: float
    destLat: float
    destLng: float
    mode: str  # "transit" | "driving" | "walking"
    timeWindow: str
    homeId: int
    placeId: int


class DirectionBatchRequest(BaseModel):
    requests: List[DirectionRequest]


class DirectionResponse(BaseModel):
    results: List[Optional[RouteResult]]
    completedRequests: int
    failedRequests: int


# ─── ML Interactions ────────────────────────────────────────────────

class InteractionCreate(BaseModel):
    scenario_id: str
    home_id: int
    action: str  # 'liked', 'disliked', 'viewed_details', 'selected_top'


class InteractionResponse(BaseModel):
    id: str
    scenario_id: str
    home_id: int
    action: str
    created_at: datetime

    class Config:
        from_attributes = True


class MLStatusResponse(BaseModel):
    model_available: bool
    model_version: Optional[int] = None
    trained_at: Optional[datetime] = None
    total_interactions: int
    total_scenarios_with_feedback: int
    training_threshold_met: bool
    interactions_needed: int = 35
    scenarios_needed: int = 3
    # User-specific stats
    user_interactions: int = 0
    user_liked: int = 0
    user_disliked: int = 0
    metrics: Optional[Dict[str, Any]] = None


class ScoreExplanation(BaseModel):
    factor: str
    impact: float


class ScoreImprovement(BaseModel):
    suggestion: str
    estimated_score_gain: float


class HomeScoreWithExplanation(BaseModel):
    homeId: int
    totalScore: int
    explanations: Optional[List[ScoreExplanation]] = None
    improvements: Optional[List[ScoreImprovement]] = None
