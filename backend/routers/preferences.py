"""Interaction and preference router — logs user interactions for ML training.

Replaces the old preference-weight-shifting system with interaction logging
that feeds the LightGBM LambdaMART ranking model.

Also preserves backward-compatible preference endpoints for the frontend
during transition.
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import User, UserInteraction, UserPreferenceProfile
from schemas import (
    PreferenceWeightsSchema, UpdateWeightsRequest, HomeFeatureVector,
    InteractionCreate, InteractionResponse,
)
from auth_utils import get_current_user
from ml.user_profile import update_user_profile, get_user_profile_dict

router = APIRouter(prefix="/api/preferences", tags=["preferences"])

# ─── Legacy defaults (kept for backward compatibility) ─────────────

DEFAULT_WEIGHTS = {
    "transitTime": 0.20,
    "drivingTime": 0.15,
    "walkingTime": 0.10,
    "transferCount": 0.10,
    "walkingDuration": 0.10,
    "variability": 0.15,
    "reliability": 0.20,
}


# ─── New interaction-based endpoints ───────────────────────────────

@router.post("/interaction", response_model=InteractionResponse)
def log_interaction(
    body: InteractionCreate,
    user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Log a user interaction (like, dislike, view details, select top).

    This is the primary data collection endpoint for the ML system.
    """
    if not user:
        raise HTTPException(status_code=401, detail="Must be logged in to record interactions")

    valid_actions = {"liked", "disliked", "viewed_details", "selected_top"}
    if body.action not in valid_actions:
        raise HTTPException(status_code=400, detail=f"Invalid action. Must be one of: {valid_actions}")

    interaction = UserInteraction(
        user_id=user.id,
        scenario_id=body.scenario_id,
        home_id=body.home_id,
        action=body.action,
    )
    db.add(interaction)
    db.commit()
    db.refresh(interaction)

    # Update user preference profile in the background
    try:
        update_user_profile(db, str(user.id))
    except Exception:
        pass  # Non-critical — profile will be updated on next interaction

    return InteractionResponse(
        id=str(interaction.id),
        scenario_id=str(interaction.scenario_id),
        home_id=interaction.home_id,
        action=interaction.action,
        created_at=interaction.created_at,
    )


# ─── Legacy endpoints (backward compatibility) ────────────────────
# These are kept so the frontend continues to work during transition.
# The old weight-shifting logic is replaced: interactions are now
# logged via the /interaction endpoint above.

@router.get("", response_model=PreferenceWeightsSchema)
def get_preferences(
    user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return default preference weights (legacy endpoint).

    Now returns fixed defaults since ML model handles preferences.
    The interactionCount reflects real interaction count.
    """
    count = 0
    if user:
        profile = get_user_profile_dict(db, str(user.id))
        if profile:
            count = profile.get("interaction_count", 0)

    return PreferenceWeightsSchema(**DEFAULT_WEIGHTS, interactionCount=count)


@router.post("/update", response_model=PreferenceWeightsSchema)
def update_preferences(
    body: UpdateWeightsRequest,
    user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Legacy weight update endpoint.

    Now returns fixed defaults. Real preference learning happens
    through the /interaction endpoint and ML model training.
    """
    count = 0
    if user:
        profile = get_user_profile_dict(db, str(user.id))
        if profile:
            count = profile.get("interaction_count", 0)

    return PreferenceWeightsSchema(**DEFAULT_WEIGHTS, interactionCount=count)


@router.post("/reset", response_model=PreferenceWeightsSchema)
def reset_preferences(
    user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Legacy reset endpoint. Returns defaults."""
    return PreferenceWeightsSchema(**DEFAULT_WEIGHTS, interactionCount=0)
