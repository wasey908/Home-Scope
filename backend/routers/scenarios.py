"""Scenarios CRUD router."""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models import Scenario, User
from schemas import ScenarioCreate, ScenarioUpdate, ScenarioResponse
from auth_utils import get_current_user

router = APIRouter(prefix="/api/scenarios", tags=["scenarios"])


def _scenario_to_response(s: Scenario) -> ScenarioResponse:
    return ScenarioResponse(
        id=str(s.id),
        name=s.name,
        created_at=s.created_at,
        updated_at=s.updated_at,
        last_completed_step=s.last_completed_step,
        wizard_inputs=s.wizard_inputs or {},
        results=s.results,
        feedback=s.feedback,
        learned_preferences=s.learned_preferences,
    )


@router.get("", response_model=list[ScenarioResponse])
def list_scenarios(
    user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all scenarios for the current user (or guest scenarios if unauthenticated)."""
    if user:
        scenarios = (
            db.query(Scenario)
            .filter(Scenario.user_id == user.id)
            .order_by(Scenario.updated_at.desc())
            .all()
        )
    else:
        # Guest users don't have persisted scenarios
        scenarios = []
    return [_scenario_to_response(s) for s in scenarios]


@router.post("", response_model=ScenarioResponse, status_code=status.HTTP_201_CREATED)
def create_scenario(
    body: ScenarioCreate,
    user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    scenario = Scenario(
        name=body.name or "New Scenario",
        user_id=user.id if user else None,
        wizard_inputs={},
    )
    db.add(scenario)
    db.commit()
    db.refresh(scenario)
    return _scenario_to_response(scenario)


@router.get("/{scenario_id}", response_model=ScenarioResponse)
def get_scenario(
    scenario_id: str,
    user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found.")
    # Verify ownership
    if scenario.user_id and user and scenario.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied.")
    return _scenario_to_response(scenario)


@router.put("/{scenario_id}", response_model=ScenarioResponse)
def update_scenario(
    scenario_id: str,
    body: ScenarioUpdate,
    user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found.")
    if scenario.user_id and user and scenario.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied.")

    if body.name is not None:
        scenario.name = body.name
    if body.last_completed_step is not None:
        scenario.last_completed_step = body.last_completed_step
    if body.wizard_inputs is not None:
        scenario.wizard_inputs = body.wizard_inputs.model_dump()
    if body.results is not None:
        scenario.results = body.results
    if body.feedback is not None:
        scenario.feedback = body.feedback
    if body.learned_preferences is not None:
        scenario.learned_preferences = body.learned_preferences

    db.commit()
    db.refresh(scenario)
    return _scenario_to_response(scenario)


@router.delete("/{scenario_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_scenario(
    scenario_id: str,
    user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found.")
    if scenario.user_id and user and scenario.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied.")
    db.delete(scenario)
    db.commit()
