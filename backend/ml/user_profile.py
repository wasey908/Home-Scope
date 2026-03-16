"""User preference profile management.

Updates aggregated preference stats when users interact with homes,
so that personalisation features (28-30) can be computed.
"""

from __future__ import annotations

from sqlalchemy.orm import Session
from sqlalchemy import func

from models import UserInteraction, UserPreferenceProfile, Scenario
from ml.feature_engineering import _parse_rent


def update_user_profile(db: Session, user_id: str) -> None:
    """Recompute the user's preference profile from their interaction history.

    Calculates:
    - avg_liked_commute: mean blended commute of liked homes
    - avg_liked_rent: mean rent of liked homes
    - interaction_count: total like + dislike interactions
    """
    # Count total interactions (liked + disliked only — these are strong signals)
    interaction_count = (
        db.query(UserInteraction)
        .filter(
            UserInteraction.user_id == user_id,
            UserInteraction.action.in_(["liked", "disliked"]),
        )
        .count()
    )

    # Get liked interactions with their scenario data
    liked_interactions = (
        db.query(UserInteraction, Scenario)
        .join(Scenario, UserInteraction.scenario_id == Scenario.id)
        .filter(
            UserInteraction.user_id == user_id,
            UserInteraction.action == "liked",
        )
        .all()
    )

    avg_commute = 0.0
    avg_rent = 0.0

    if liked_interactions:
        commutes = []
        rents = []

        for interaction, scenario in liked_interactions:
            wi = scenario.wizard_inputs or {}
            results = scenario.results or {}
            homes = wi.get("homes", [])
            hid = interaction.home_id

            if 0 <= hid < len(homes):
                # Extract rent
                rent = _parse_rent(homes[hid].get("rent", "0"))
                if rent > 0:
                    rents.append(rent)

                # Extract blended commute from saved scores if available
                saved_scores = results.get("scores", [])
                for score in saved_scores:
                    if score.get("homeId") == hid:
                        commute = score.get("blendedCommuteMinutes", 0)
                        if commute > 0:
                            commutes.append(commute)
                        break

        if commutes:
            avg_commute = sum(commutes) / len(commutes)
        if rents:
            avg_rent = sum(rents) / len(rents)

    # Upsert profile
    profile = (
        db.query(UserPreferenceProfile)
        .filter(UserPreferenceProfile.user_id == user_id)
        .first()
    )

    if profile:
        profile.avg_liked_commute = avg_commute
        profile.avg_liked_rent = avg_rent
        profile.interaction_count = interaction_count
    else:
        profile = UserPreferenceProfile(
            user_id=user_id,
            avg_liked_commute=avg_commute,
            avg_liked_rent=avg_rent,
            interaction_count=interaction_count,
        )
        db.add(profile)

    db.commit()


def get_user_profile_dict(db: Session, user_id: str) -> dict | None:
    """Fetch user preference profile as a dict for feature engineering."""
    profile = (
        db.query(UserPreferenceProfile)
        .filter(UserPreferenceProfile.user_id == user_id)
        .first()
    )
    if not profile:
        return None
    return {
        "avg_liked_commute": profile.avg_liked_commute,
        "avg_liked_rent": profile.avg_liked_rent,
        "interaction_count": profile.interaction_count,
    }
