"""Feature engineering for the LightGBM LambdaMART ranking model.

Computes 30 features per (scenario, home) pair from route data,
place importance, and user preference history.
"""

from __future__ import annotations

import statistics
from typing import List, Dict, Optional, Any

import pandas as pd

# ─── Feature name constants (ordered) ──────────────────────────────

FEATURE_NAMES: list[str] = [
    # A. Cost / Property (3)
    "rent_monthly",
    "rent_rank_in_scenario",
    "rent_percentile",
    # B. Commute Core (5)
    "weighted_avg_transit_time",
    "weighted_avg_driving_time",
    "weighted_avg_walking_time",
    "avg_transfers",
    "total_walking_duration",
    # C. Mode Blend (3)
    "blended_commute_duration",
    "best_mode_ratio_transit",
    "best_mode_ratio_driving",
    # D. Place Importance (3)
    "importance_weighted_commute",
    "top2_places_avg_commute",
    "worst_important_place_commute",
    # E. Reliability / Robustness (3)
    "robustness_score",
    "robustness_penalty_ratio",
    "alternative_route_count",
    # F. Variability (2)
    "commute_variability_score",
    "variability_ratio",
    # G. Structural Burden (4)
    "total_transfer_burden",
    "total_walking_burden",
    "worst_commute_any_place",
    "long_journey_count",
    # H. Scenario-Relative Ranking (4)
    "blended_commute_rank",
    "robustness_rank",
    "variability_rank",
    "commute_rank_in_scenario",
    # I. User Preference Signals (3)
    "user_avg_liked_commute",
    "user_avg_liked_rent",
    "user_interaction_count",
]

MODES = ["transit", "driving", "walking"]
TIME_WINDOW_IDS = ["weekday_peak_8am", "weekday_offpeak_11am", "saturday_midday"]
METERS_TO_MILES = 0.000621371

# Feature-to-human-readable label mapping (for explainability)
FEATURE_LABELS: dict[str, str] = {
    "rent_monthly": "monthly rent",
    "rent_rank_in_scenario": "rent rank among candidates",
    "rent_percentile": "rent percentile",
    "weighted_avg_transit_time": "transit commute time",
    "weighted_avg_driving_time": "driving commute time",
    "weighted_avg_walking_time": "walking commute time",
    "avg_transfers": "number of line changes",
    "total_walking_duration": "total walking during transit",
    "blended_commute_duration": "blended commute time",
    "best_mode_ratio_transit": "transit as best mode ratio",
    "best_mode_ratio_driving": "driving as best mode ratio",
    "importance_weighted_commute": "commute to important places",
    "top2_places_avg_commute": "commute to top 2 places",
    "worst_important_place_commute": "worst commute to key place",
    "robustness_score": "route reliability",
    "robustness_penalty_ratio": "route fragility",
    "alternative_route_count": "alternative route count",
    "commute_variability_score": "journey time consistency",
    "variability_ratio": "peak vs off-peak variation",
    "total_transfer_burden": "total transfer burden",
    "total_walking_burden": "total walking burden",
    "worst_commute_any_place": "longest commute",
    "long_journey_count": "number of long journeys",
    "blended_commute_rank": "commute rank",
    "robustness_rank": "reliability rank",
    "variability_rank": "variability rank",
    "commute_rank_in_scenario": "importance-weighted commute rank",
    "user_avg_liked_commute": "preferred commute time",
    "user_avg_liked_rent": "preferred rent level",
    "user_interaction_count": "interaction history",
}

# Features where lower values are better for the user
LOWER_IS_BETTER = {
    "rent_monthly", "rent_rank_in_scenario", "rent_percentile",
    "weighted_avg_transit_time", "weighted_avg_driving_time",
    "weighted_avg_walking_time", "avg_transfers", "total_walking_duration",
    "blended_commute_duration", "importance_weighted_commute",
    "top2_places_avg_commute", "worst_important_place_commute",
    "robustness_penalty_ratio", "commute_variability_score",
    "variability_ratio", "total_transfer_burden", "total_walking_burden",
    "worst_commute_any_place", "long_journey_count",
    "blended_commute_rank", "variability_rank", "commute_rank_in_scenario",
}

# Units for counterfactual explanations
FEATURE_UNITS: dict[str, str] = {
    "rent_monthly": "£/mo",
    "weighted_avg_transit_time": "min",
    "weighted_avg_driving_time": "min",
    "weighted_avg_walking_time": "min",
    "avg_transfers": "changes",
    "total_walking_duration": "min",
    "blended_commute_duration": "min",
    "importance_weighted_commute": "min",
    "top2_places_avg_commute": "min",
    "worst_important_place_commute": "min",
    "worst_commute_any_place": "min",
    "total_transfer_burden": "transfers",
    "total_walking_burden": "min",
    "long_journey_count": "journeys",
}

# ─── User preference safeguard defaults ────────────────────────────

# When user has < 3 interactions, set to zero so the model
# does not infer preferences from unreliable signals.
USER_FEATURE_DEFAULTS = {
    "user_avg_liked_commute": 0.0,
    "user_avg_liked_rent": 0.0,
    "user_interaction_count": 0,
}

MIN_INTERACTIONS_FOR_PERSONALISATION = 3


def _parse_rent(rent_str: str) -> float:
    """Extract numeric rent from strings like '£1,200' or '1200'."""
    import re
    digits = re.sub(r"[^\d.]", "", str(rent_str))
    return float(digits) if digits else 0.0


def _get_route(
    routes: list[dict], home_id: int, place_id: int,
    mode: str, time_window: str | None = None,
) -> dict | None:
    """Find a specific route from the routes list."""
    for r in routes:
        if (r["homeId"] == home_id and r["placeId"] == place_id
                and r["mode"] == mode):
            if time_window is None or r["timeWindow"] == time_window:
                return r
    return None


def _duration_min(route: dict | None) -> float:
    """Get duration in minutes from a route dict, or 999 if missing."""
    if route is None:
        return 999.0
    return route.get("durationSec", 0) / 60.0


def compute_features(
    homes: list[dict],
    places: list[dict],
    routes: list[dict],
    mode_blend_weights: dict[str, float],
    user_profile: dict | None = None,
) -> pd.DataFrame:
    """Compute 30 features for each home in a scenario.

    Args:
        homes: List of home dicts with keys: id, address, rent (or rentMonthlyGBP)
        places: List of place dicts with keys: id, name, weight (importance)
        routes: List of route dicts (RouteResult schema)
        mode_blend_weights: Dict with keys transit, driving, walking (floats, summing ~1)
        user_profile: Optional dict with keys avg_liked_commute, avg_liked_rent, interaction_count

    Returns:
        DataFrame with one row per home and 30 feature columns.
    """
    if not homes or not places:
        return pd.DataFrame(columns=FEATURE_NAMES)

    total_importance = sum(p.get("weight", 1) for p in places) or 1.0
    w = mode_blend_weights
    w_total = w.get("transit", 0.6) + w.get("driving", 0.3) + w.get("walking", 0.1)
    if w_total == 0:
        w_total = 1.0

    rows = []

    for home in homes:
        home_id = home.get("id", 0)
        rent = home.get("rentMonthlyGBP") or _parse_rent(home.get("rent", "0"))

        # ── Per-place aggregations ──────────────────────────────
        transit_times, driving_times, walking_times = [], [], []
        w_transit_times, w_driving_times, w_walking_times = [], [], []
        transfers_list = []
        walking_during_transit = []
        blended_per_place = []
        variability_ratios = []
        robustness_penalties = []
        alt_route_counts = []
        best_mode_counts = {"transit": 0, "driving": 0, "walking": 0}

        for place in places:
            place_id = place.get("id", 0)
            importance = place.get("weight", 1.0)
            norm_importance = importance / total_importance

            # Get durations per mode
            durations = {}
            for mode in MODES:
                r = (_get_route(routes, home_id, place_id, mode, "weekday_peak_8am")
                     or _get_route(routes, home_id, place_id, mode))
                durations[mode] = _duration_min(r)

            transit_times.append(durations["transit"])
            driving_times.append(durations["driving"])
            walking_times.append(durations["walking"])
            w_transit_times.append(durations["transit"] * norm_importance)
            w_driving_times.append(durations["driving"] * norm_importance)
            w_walking_times.append(durations["walking"] * norm_importance)

            # Transfers and walking during transit
            transit_route = (_get_route(routes, home_id, place_id, "transit", "weekday_peak_8am")
                             or _get_route(routes, home_id, place_id, "transit"))
            tc = transit_route.get("transferCount", 0) if transit_route else 0
            wm = (transit_route.get("walkingDurationSec", 0) / 60.0) if transit_route else 0
            transfers_list.append(tc)
            walking_during_transit.append(wm)

            # Blended commute for this place
            blended = (
                durations["transit"] * w.get("transit", 0.6)
                + durations["driving"] * w.get("driving", 0.3)
                + durations["walking"] * w.get("walking", 0.1)
            ) / w_total
            blended_per_place.append((blended, importance))

            # Best mode for this place
            best = min(MODES, key=lambda m: durations[m])
            best_mode_counts[best] += 1

            # Variability across time windows
            tw_durations = []
            for tw in TIME_WINDOW_IDS:
                r = _get_route(routes, home_id, place_id, "transit", tw)
                if r:
                    tw_durations.append(r["durationSec"])
            if len(tw_durations) >= 2:
                mean_tw = statistics.mean(tw_durations)
                range_tw = max(tw_durations) - min(tw_durations)
                vr = range_tw / mean_tw if mean_tw > 0 else 0
            else:
                vr = 0.0
            variability_ratios.append((vr, norm_importance))

            # Robustness (primary vs fallback)
            primary = _get_route(routes, home_id, place_id, "transit", "weekday_peak_8am")
            primary_dur = primary["durationSec"] if primary else 0
            # Fallback = any other transit route for this home-place
            fallback_dur = primary_dur
            for tw in TIME_WINDOW_IDS:
                fb = _get_route(routes, home_id, place_id, "transit", tw)
                if fb and fb["durationSec"] > fallback_dur:
                    fallback_dur = fb["durationSec"]
            penalty = (fallback_dur - primary_dur) / primary_dur if primary_dur > 0 else 0
            robustness_penalties.append((penalty, norm_importance))

            # Alternative route count
            alt_count = sum(
                1 for tw in TIME_WINDOW_IDS
                if _get_route(routes, home_id, place_id, "transit", tw) is not None
            )
            alt_route_counts.append(alt_count)

        # ── Aggregate features ──────────────────────────────────
        n_places = len(places)

        # B. Commute Core
        weighted_avg_transit = sum(w_transit_times)
        weighted_avg_driving = sum(w_driving_times)
        weighted_avg_walking = sum(w_walking_times)
        avg_xfers = statistics.mean(transfers_list) if transfers_list else 0
        total_walk_dur = sum(walking_during_transit)

        # C. Mode Blend
        total_blended = sum(b * (imp / total_importance) for b, imp in blended_per_place)
        n_places_safe = n_places or 1
        best_transit_ratio = best_mode_counts["transit"] / n_places_safe
        best_driving_ratio = best_mode_counts["driving"] / n_places_safe

        # D. Place Importance
        imp_weighted_commute = sum(
            b * (imp / total_importance) for b, imp in blended_per_place
        )
        # Top 2 most important places
        sorted_by_imp = sorted(blended_per_place, key=lambda x: x[1], reverse=True)
        top2 = sorted_by_imp[:2]
        top2_avg = statistics.mean([b for b, _ in top2]) if top2 else 0
        # Worst commute to important places (importance >= 3)
        important_commutes = [
            b for b, imp in blended_per_place if imp >= 3
        ]
        worst_important = max(important_commutes) if important_commutes else max(
            (b for b, _ in blended_per_place), default=0
        )

        # E. Reliability / Robustness
        weighted_rob_penalty = sum(p * wi for p, wi in robustness_penalties)
        rob_score = max(0, round((1 - weighted_rob_penalty) * 100))
        rob_penalty_ratio = weighted_rob_penalty
        avg_alt_routes = statistics.mean(alt_route_counts) if alt_route_counts else 0

        # F. Variability
        weighted_var = sum(vr * wi for vr, wi in variability_ratios)
        var_score = min(100, round(weighted_var * 200))
        var_ratio = weighted_var

        # G. Structural Burden
        total_xfer_burden = sum(transfers_list)
        total_walk_burden = sum(walking_during_transit)
        worst_commute = max((b for b, _ in blended_per_place), default=0)
        long_count = sum(1 for b, _ in blended_per_place if b > 60)

        row = {
            "rent_monthly": rent,
            # Rank features computed after all homes are processed
            "rent_rank_in_scenario": 0,
            "rent_percentile": 0.0,
            "weighted_avg_transit_time": round(weighted_avg_transit, 2),
            "weighted_avg_driving_time": round(weighted_avg_driving, 2),
            "weighted_avg_walking_time": round(weighted_avg_walking, 2),
            "avg_transfers": round(avg_xfers, 2),
            "total_walking_duration": round(total_walk_dur, 2),
            "blended_commute_duration": round(total_blended, 2),
            "best_mode_ratio_transit": round(best_transit_ratio, 3),
            "best_mode_ratio_driving": round(best_driving_ratio, 3),
            "importance_weighted_commute": round(imp_weighted_commute, 2),
            "top2_places_avg_commute": round(top2_avg, 2),
            "worst_important_place_commute": round(worst_important, 2),
            "robustness_score": rob_score,
            "robustness_penalty_ratio": round(rob_penalty_ratio, 4),
            "alternative_route_count": round(avg_alt_routes, 1),
            "commute_variability_score": var_score,
            "variability_ratio": round(var_ratio, 4),
            "total_transfer_burden": total_xfer_burden,
            "total_walking_burden": round(total_walk_burden, 2),
            "worst_commute_any_place": round(worst_commute, 2),
            "long_journey_count": long_count,
            # Rank features (placeholder)
            "blended_commute_rank": 0,
            "robustness_rank": 0,
            "variability_rank": 0,
            "commute_rank_in_scenario": 0,
            # User preference features (placeholder)
            "user_avg_liked_commute": 0.0,
            "user_avg_liked_rent": 0.0,
            "user_interaction_count": 0,
        }
        rows.append(row)

    df = pd.DataFrame(rows, columns=FEATURE_NAMES)

    # ── Compute scenario-relative rank features ─────────────────
    n = len(df)
    if n > 0:
        df["rent_rank_in_scenario"] = df["rent_monthly"].rank(method="min").astype(int)
        df["rent_percentile"] = (df["rent_rank_in_scenario"] - 1) / max(n - 1, 1)
        df["blended_commute_rank"] = df["blended_commute_duration"].rank(method="min").astype(int)
        df["robustness_rank"] = df["robustness_score"].rank(ascending=False, method="min").astype(int)
        df["variability_rank"] = df["commute_variability_score"].rank(method="min").astype(int)
        df["commute_rank_in_scenario"] = df["importance_weighted_commute"].rank(method="min").astype(int)

    # ── Apply user preference features ──────────────────────────
    if user_profile and user_profile.get("interaction_count", 0) >= MIN_INTERACTIONS_FOR_PERSONALISATION:
        df["user_avg_liked_commute"] = user_profile.get("avg_liked_commute", USER_FEATURE_DEFAULTS["user_avg_liked_commute"])
        df["user_avg_liked_rent"] = user_profile.get("avg_liked_rent", USER_FEATURE_DEFAULTS["user_avg_liked_rent"])
        df["user_interaction_count"] = user_profile.get("interaction_count", 0)
    else:
        # Safeguard: use neutral median values for low-interaction users
        df["user_avg_liked_commute"] = USER_FEATURE_DEFAULTS["user_avg_liked_commute"]
        df["user_avg_liked_rent"] = USER_FEATURE_DEFAULTS["user_avg_liked_rent"]
        df["user_interaction_count"] = user_profile.get("interaction_count", 0) if user_profile else 0

    return df
