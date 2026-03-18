"""Scoring engine router — hybrid ML + heuristic scoring.

Tries the LightGBM ML ranker first. If no trained model is available,
falls back to the existing heuristic scoring logic.
"""

from typing import Optional
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from schemas import (
    ScoreRequest, ScoreResponse, HomeScoreResponse,
    PlaceBreakdown, ModeBreakdown, HomeFeatureVector, TransitStep,
)
from auth_utils import get_current_user
from models import User
from ml.predict_ranker import predict_scores, get_explanations
from ml.user_profile import get_user_profile_dict

router = APIRouter(prefix="/api", tags=["scoring"])

MODES = ["transit", "driving", "walking"]

TIME_WINDOWS = [
    {"id": "weekday_peak_8am", "label": "Weekday Peak (8 AM)", "shortLabel": "8am"},
    {"id": "weekday_offpeak_11am", "label": "Weekday Off-Peak (11 AM)", "shortLabel": "11am"},
    {"id": "saturday_midday", "label": "Saturday Midday (12 PM)", "shortLabel": "Sat"},
]

TIME_WINDOW_IDS = [tw["id"] for tw in TIME_WINDOWS]
METERS_TO_MILES = 0.000621371

# Fixed internal scoring weights
TIME_WEIGHT = 0.70
VARIABILITY_WEIGHT = 0.15
RELIABILITY_WEIGHT = 0.15

# Preference learning constants
FEATURE_KEYS = [
    "transitTime", "drivingTime", "walkingTime",
    "transferCount", "walkingDuration", "variability", "reliability",
]

IS_POSITIVE_FEATURE = {
    "transitTime": False,
    "drivingTime": False,
    "walkingTime": False,
    "transferCount": False,
    "walkingDuration": False,
    "variability": False,
    "reliability": True,
}


def compute_weighted_score(weights: dict, features: dict) -> float:
    score = 0.0
    for k in FEATURE_KEYS:
        goodness = features[k] if IS_POSITIVE_FEATURE[k] else (1 - features[k])
        score += weights.get(k, 0) * goodness
    return score


@router.post("/score", response_model=ScoreResponse)
def compute_scores(
    body: ScoreRequest,
    user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    routes = [r.model_dump() for r in body.routes]
    homes = [h.model_dump() for h in body.homes]
    places = [p.model_dump() for p in body.places]
    settings = body.settings.model_dump()
    fallback_durations = body.fallbackDurations
    pref_weights = body.prefWeights

    # Try ML model first
    user_profile = None
    if user:
        user_profile = get_user_profile_dict(db, str(user.id))

    mode_blend = settings.get("modeBlendWeights", {"transit": 0.6, "driving": 0.3, "walking": 0.1})
    ml_scores, features_df, ml_used = predict_scores(
        homes, places, routes, mode_blend, db, user_profile,
    )

    total_weight = sum(p["weight"] for p in places) or 1

    raw_data = []

    for home in homes:
        per_place_breakdown = []
        total_blended_minutes = 0.0
        variability_numerator = 0.0
        robustness_numerator = 0.0
        total_transfers = 0
        total_walking_min = 0
        transit_place_count = 0

        per_mode_accum = {
            mode: {"totalMin": 0.0, "totalMeters": 0.0, "count": 0}
            for mode in MODES
        }

        for place in places:
            place_routes = [
                r for r in routes
                if r["homeId"] == home["id"] and r["placeId"] == place["id"]
            ]

            by_mode = {}
            by_time_window = {}

            for mode in MODES:
                primary = next(
                    (r for r in place_routes if r["mode"] == mode and r["timeWindow"] == "weekday_peak_8am"),
                    None,
                )
                fallback = next((r for r in place_routes if r["mode"] == mode), None)
                route = primary or fallback

                duration_min = round(route["durationSec"] / 60) if route else 999
                distance_miles = round(route["distanceMeters"] * METERS_TO_MILES, 1) if route else 0.0

                by_mode[mode] = {
                    "durationMin": duration_min,
                    "distanceMiles": distance_miles,
                    "transferCount": route.get("transferCount") if route else None,
                    "walkingMin": round(route["walkingDurationSec"] / 60) if route else None,
                    "steps": route.get("steps") if route else None,
                }

                if route:
                    per_mode_accum[mode]["totalMin"] += route["durationSec"] / 60
                    per_mode_accum[mode]["totalMeters"] += route["distanceMeters"]
                    per_mode_accum[mode]["count"] += 1

            # Track transfers and walking
            if by_mode["transit"]["transferCount"] is not None:
                total_transfers += by_mode["transit"]["transferCount"]
                transit_place_count += 1
            if by_mode["transit"]["walkingMin"] is not None:
                total_walking_min += by_mode["transit"]["walkingMin"]

            for tw_id in TIME_WINDOW_IDS:
                r = next(
                    (r for r in place_routes if r["mode"] == "transit" and r["timeWindow"] == tw_id),
                    None,
                )
                by_time_window[tw_id] = r["durationSec"] if r else 0

            # Blended duration
            w = settings["modeBlendWeights"]
            w_total = w["transit"] + w["driving"] + w["walking"]
            blended_min = (
                by_mode["transit"]["durationMin"] * w["transit"]
                + by_mode["driving"]["durationMin"] * w["driving"]
                + by_mode["walking"]["durationMin"] * w["walking"]
            ) / w_total

            normalized_weight = place["weight"] / total_weight
            total_blended_minutes += blended_min * normalized_weight

            # Variability
            transit_durations = [by_time_window[tw_id] for tw_id in TIME_WINDOW_IDS if by_time_window[tw_id] > 0]
            variability_ratio = 0.0
            if len(transit_durations) >= 2:
                mean = sum(transit_durations) / len(transit_durations)
                rng = max(transit_durations) - min(transit_durations)
                variability_ratio = rng / mean if mean > 0 else 0
            variability_numerator += variability_ratio * normalized_weight

            # Robustness
            primary_duration = 0
            pr = next(
                (r for r in place_routes if r["mode"] == "transit" and r["timeWindow"] == "weekday_peak_8am"),
                None,
            )
            if pr:
                primary_duration = pr["durationSec"]
            fallback_key = f"{home['id']}-{place['id']}"
            fallback_duration = fallback_durations.get(fallback_key, primary_duration)

            robustness_penalty = 0.0
            if primary_duration > 0 and fallback_duration > primary_duration:
                robustness_penalty = (fallback_duration - primary_duration) / primary_duration
            robustness_numerator += robustness_penalty * normalized_weight

            per_place_breakdown.append({
                "placeId": place["id"],
                "placeName": place["name"],
                "weight": place["weight"],
                "byMode": by_mode,
                "byTimeWindow": by_time_window,
                "blendedMinutes": round(blended_min, 1),
            })

        variability_score = min(100, round(variability_numerator * 200))
        robustness_score = max(0, round((1 - robustness_numerator) * 100))

        per_mode_stats = {}
        for mode in MODES:
            acc = per_mode_accum[mode]
            per_mode_stats[mode] = {
                "avgMinutes": round(acc["totalMin"] / acc["count"]) if acc["count"] else 0,
                "avgDistanceMiles": round(acc["totalMeters"] / acc["count"] * METERS_TO_MILES, 1) if acc["count"] else 0,
            }

        avg_transfers = total_transfers / transit_place_count if transit_place_count > 0 else 0
        avg_walking_min = total_walking_min / transit_place_count if transit_place_count > 0 else 0

        raw_data.append({
            "home": home,
            "totalBlendedMinutes": total_blended_minutes,
            "variabilityScore": variability_score,
            "robustnessScore": robustness_score,
            "perPlaceBreakdown": per_place_breakdown,
            "perModeStats": per_mode_stats,
            "avgTransfers": avg_transfers,
            "avgWalkingMin": avg_walking_min,
        })

    if not raw_data:
        return ScoreResponse(scores=[])

    # Compute normalizers for legacy feature vectors (kept for frontend compatibility)
    max_transit = max(d["perModeStats"]["transit"]["avgMinutes"] for d in raw_data) or 1
    max_driving = max(d["perModeStats"]["driving"]["avgMinutes"] for d in raw_data) or 1
    max_walking = max(d["perModeStats"]["walking"]["avgMinutes"] for d in raw_data) or 1
    max_transfers = max(d["avgTransfers"] for d in raw_data) or 1
    max_walking_dur = max(d["avgWalkingMin"] for d in raw_data) or 1

    feature_vectors = []
    for d in raw_data:
        fv = {
            "transitTime": d["perModeStats"]["transit"]["avgMinutes"] / max_transit,
            "drivingTime": d["perModeStats"]["driving"]["avgMinutes"] / max_driving,
            "walkingTime": d["perModeStats"]["walking"]["avgMinutes"] / max_walking,
            "transferCount": d["avgTransfers"] / max_transfers,
            "walkingDuration": d["avgWalkingMin"] / max_walking_dur,
            "variability": d["variabilityScore"] / 100,
            "reliability": d["robustnessScore"] / 100,
        }
        feature_vectors.append(fv)

    # ── Determine final scores ──────────────────────────────────
    if ml_used and ml_scores:
        # ML model is available — use ML-predicted scores
        final_scores = ml_scores
    else:
        # Heuristic fallback scoring
        if pref_weights:
            raw_scores = [compute_weighted_score(pref_weights, fv) for fv in feature_vectors]
        else:
            max_commute = max(d["totalBlendedMinutes"] for d in raw_data)
            min_commute = min(d["totalBlendedMinutes"] for d in raw_data)

            raw_scores = []
            for d in raw_data:
                commute_score = (
                    50 if max_commute == min_commute
                    else ((max_commute - d["totalBlendedMinutes"]) / (max_commute - min_commute)) * 100
                )
                time_component = commute_score * TIME_WEIGHT
                variability_penalty = (d["variabilityScore"] / 100) * VARIABILITY_WEIGHT * 100
                reliability_penalty = ((100 - d["robustnessScore"]) / 100) * RELIABILITY_WEIGHT * 100
                raw_scores.append(time_component - variability_penalty - reliability_penalty)

        # Min-max normalize to 0-100
        min_raw = min(raw_scores)
        max_raw = max(raw_scores)
        score_range = max_raw - min_raw

        final_scores = []
        for raw in raw_scores:
            if score_range > 0:
                normalized = ((raw - min_raw) / score_range) * 70 + 20
            else:
                normalized = 55
            final_scores.append(max(10, min(99, round(normalized))))

    # ── Build response ──────────────────────────────────────────
    scores = []
    for i, d in enumerate(raw_data):
        total_score = int(final_scores[i]) if i < len(final_scores) else 55

        scores.append(HomeScoreResponse(
            homeId=d["home"]["id"],
            address=d["home"]["address"],
            rentMonthlyGBP=d["home"]["rentMonthlyGBP"],
            blendedCommuteMinutes=round(d["totalBlendedMinutes"], 1),
            variabilityScore=d["variabilityScore"],
            robustnessScore=d["robustnessScore"],
            totalScore=total_score,
            variabilityLabel=(
                "Variable" if d["variabilityScore"] > 60
                else "Moderate" if d["variabilityScore"] > 30
                else "Stable"
            ),
            robustnessLabel=(
                "Very reliable" if d["robustnessScore"] >= 80
                else "Reliable" if d["robustnessScore"] >= 50
                else "Fragile"
            ),
            perPlaceBreakdown=d["perPlaceBreakdown"],
            perModeStats=d["perModeStats"],
            featureVector=feature_vectors[i],
        ))

    scores.sort(key=lambda s: s.totalScore, reverse=True)
    return ScoreResponse(scores=scores)

