"""ML admin router — training triggers and model status.

Provides endpoints for:
- Checking ML system status (model availability, interaction counts)
- Triggering model training
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import User, UserInteraction, MLModel as MLModelRecord
from schemas import MLStatusResponse
from auth_utils import get_current_user
from ml.build_dataset import should_train, MIN_INTERACTIONS, MIN_SCENARIOS_WITH_FEEDBACK
from ml.train_ranker import train_model

router = APIRouter(prefix="/api/ml", tags=["ml"])


@router.get("/status", response_model=MLStatusResponse)
def get_ml_status(
    user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get the current ML system status with user-specific interaction data."""
    # Check for active model
    active_model = (
        db.query(MLModelRecord)
        .filter(
            MLModelRecord.model_name == "homescope_ranker",
            MLModelRecord.is_active == True,
        )
        .first()
    )

    threshold_met, n_interactions, n_scenarios = should_train(db)

    # User-specific interaction counts
    user_total = 0
    user_liked = 0
    user_disliked = 0
    if user:
        user_total = (
            db.query(UserInteraction)
            .filter(UserInteraction.user_id == user.id)
            .count()
        )
        user_liked = (
            db.query(UserInteraction)
            .filter(UserInteraction.user_id == user.id, UserInteraction.action == "liked")
            .count()
        )
        user_disliked = (
            db.query(UserInteraction)
            .filter(UserInteraction.user_id == user.id, UserInteraction.action == "disliked")
            .count()
        )

    return MLStatusResponse(
        model_available=active_model is not None,
        model_version=active_model.model_version if active_model else None,
        trained_at=active_model.trained_at if active_model else None,
        total_interactions=n_interactions,
        total_scenarios_with_feedback=n_scenarios,
        training_threshold_met=threshold_met,
        interactions_needed=MIN_INTERACTIONS,
        scenarios_needed=MIN_SCENARIOS_WITH_FEEDBACK,
        user_interactions=user_total,
        user_liked=user_liked,
        user_disliked=user_disliked,
        metrics=active_model.metrics if active_model else None,
    )


@router.post("/train")
def trigger_training(
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Trigger ML model training.

    Requires authentication. Will fail if training threshold is not met.
    """
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        result = train_model(db)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Training failed: {str(e)}")
