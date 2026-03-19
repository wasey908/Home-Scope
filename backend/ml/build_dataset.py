"""Dataset builder — converts stored scenarios + interactions into LightGBM training data.

Reads from database, joins homes/places/routes with user interactions,
generates engineered features, and outputs (X, y, groups) for LGBMRanker.fit().
"""

from __future__ import annotations

from typing import Optional

import pandas as pd
from sqlalchemy.orm import Session

from models import Scenario, UserInteraction, UserPreferenceProfile
from ml.feature_engineering import compute_features, FEATURE_NAMES


# ─── Training threshold constants ──────────────────────────────────

MIN_INTERACTIONS = 35
MIN_SCENARIOS_WITH_FEEDBACK = 3

# Label mapping: action → relevance label for LambdaMART
ACTION_TO_LABEL = {
    "disliked": 0,
    "viewed_details": 2,
    "selected_top": 3,
    "liked": 4,
}
NEUTRAL_LABEL = 1  # No interaction

# Interaction weighting: stronger signals get more training influence
ACTION_TO_WEIGHT = {
    "liked": 1.0,
    "disliked": 1.0,
    "selected_top": 0.9,
    "viewed_details": 0.5,
}
NEUTRAL_WEIGHT = 0.2


def should_train(db: Session) -> tuple[bool, int, int]:
    """Check whether training threshold is met.

    Returns:
        (threshold_met, interaction_count, scenario_count)
    """
    interaction_count = db.query(UserInteraction).count()
    scenario_count = (
        db.query(UserInteraction.scenario_id)
        .distinct()
        .count()
    )
    met = (interaction_count >= MIN_INTERACTIONS
           and scenario_count >= MIN_SCENARIOS_WITH_FEEDBACK)
    return met, interaction_count, scenario_count


def _get_user_profile(db: Session, user_id) -> dict | None:
    """Fetch user preference profile as a dict."""
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


def _extract_scenario_data(scenario: Scenario) -> tuple[list, list, list, dict]:
    """Extract homes, places, routes, and mode blend from a scenario's stored data.

    Returns:
        (homes, places, routes, mode_blend_weights)
    """
    wi = scenario.wizard_inputs or {}
    results = scenario.results or {}

    homes_raw = wi.get("homes", [])
    places_raw = wi.get("places", [])
    routes = results.get("routes", [])

    # Normalise home format
    homes = []
    for i, h in enumerate(homes_raw):
        homes.append({
            "id": i,
            "address": h.get("address", ""),
            "rent": h.get("rent", "0"),
        })

    # Normalise place format
    places = []
    for i, p in enumerate(places_raw):
        places.append({
            "id": i,
            "name": p.get("name", ""),
            "weight": p.get("importance", 1.0),
        })

    # Mode blend weights
    routing_settings = wi.get("routingSettings", results.get("routingSettings", {}))
    mode_blend = routing_settings.get("modeBlendWeights", {
        "transit": 0.6, "driving": 0.3, "walking": 0.1,
    })

    return homes, places, routes, mode_blend


def _get_labels_and_weights_for_scenario(
    db: Session, scenario_id: str, num_homes: int,
) -> tuple[list[int], list[float]]:
    """Look up interactions for a scenario and return per-home labels + weights.

    Returns:
        (labels, weights): each list of length num_homes.
    """
    interactions = (
        db.query(UserInteraction)
        .filter(UserInteraction.scenario_id == scenario_id)
        .all()
    )

    # Start with neutral labels and weights
    labels = [NEUTRAL_LABEL] * num_homes
    weights = [NEUTRAL_WEIGHT] * num_homes

    # Apply interaction labels (latest action per home wins)
    for inter in interactions:
        hid = inter.home_id
        if 0 <= hid < num_homes:
            action_label = ACTION_TO_LABEL.get(inter.action, NEUTRAL_LABEL)
            action_weight = ACTION_TO_WEIGHT.get(inter.action, NEUTRAL_WEIGHT)
            # Keep the highest label if multiple interactions exist
            if action_label > labels[hid]:
                labels[hid] = action_label
                weights[hid] = action_weight
            elif action_label == labels[hid]:
                weights[hid] = max(weights[hid], action_weight)

    return labels, weights


def build_training_dataset(db: Session) -> tuple[pd.DataFrame, list[int], list[int], list[float]]:
    """Build the full training dataset from all qualifying scenarios.

    Includes pairwise preference augmentation and sample weights to
    increase training signal for small datasets.

    Returns:
        (X, y, groups, sample_weights) where:
        - X: DataFrame with 30 feature columns
        - y: list of relevance labels
        - groups: list of group sizes (num homes per scenario)
        - sample_weights: list of per-sample weights
    """
    # Load all scenarios that have completed results
    scenarios = (
        db.query(Scenario)
        .filter(Scenario.results.isnot(None))
        .all()
    )

    all_features = []
    all_labels = []
    all_weights = []
    groups = []

    for scenario in scenarios:
        homes, places, routes, mode_blend = _extract_scenario_data(scenario)

        if not homes or not places or not routes:
            continue

        # Get user profile for personalisation features
        user_profile = None
        if scenario.user_id:
            user_profile = _get_user_profile(db, scenario.user_id)

        # Compute features
        features_df = compute_features(homes, places, routes, mode_blend, user_profile)
        if features_df.empty:
            continue

        # Get labels and weights
        labels, weights = _get_labels_and_weights_for_scenario(
            db, str(scenario.id), len(homes),
        )

        # Add the full scenario group
        all_features.append(features_df)
        all_labels.extend(labels)
        all_weights.extend(weights)
        groups.append(len(homes))

        # Pairwise preference augmentation
        pair_features, pair_labels, pair_groups, pair_weights = _generate_pairwise_augmentation(
            features_df, labels, weights,
        )
        if pair_features is not None and not pair_features.empty:
            all_features.append(pair_features)
            all_labels.extend(pair_labels)
            all_weights.extend(pair_weights)
            groups.extend(pair_groups)

    if not all_features:
        return pd.DataFrame(columns=FEATURE_NAMES), [], [], []

    X = pd.concat(all_features, ignore_index=True)
    return X, all_labels, groups, all_weights


def _generate_pairwise_augmentation(
    features_df: pd.DataFrame,
    labels: list[int],
    weights: list[float],
) -> tuple[pd.DataFrame | None, list[int], list[int], list[float]]:
    """Generate pairwise preference training pairs from a single scenario.

    For each pair of homes where labels differ, creates a size-2 query group:
    - liked (4) vs disliked (0)
    - liked (4) vs neutral (1)
    - liked (4) vs viewed (2)
    - selected_top (3) vs disliked (0)
    - neutral (1) vs disliked (0)

    Returns:
        (pair_features_df, pair_labels, pair_groups, pair_weights)
    """
    n = len(labels)
    if n < 2:
        return None, [], [], []

    pair_rows = []
    pair_labels = []
    pair_groups = []
    pair_weights = []

    for i in range(n):
        for j in range(i + 1, n):
            if labels[i] == labels[j]:
                continue

            if labels[i] > labels[j]:
                better_idx, worse_idx = i, j
                better_label, worse_label = labels[i], labels[j]
            else:
                better_idx, worse_idx = j, i
                better_label, worse_label = labels[j], labels[i]

            if better_label - worse_label < 2:
                continue

            pair_rows.append(features_df.iloc[better_idx])
            pair_rows.append(features_df.iloc[worse_idx])
            pair_labels.extend([better_label, worse_label])
            # Use the max weight of the pair for both samples
            pw = max(weights[better_idx] if better_idx < len(weights) else NEUTRAL_WEIGHT,
                     weights[worse_idx] if worse_idx < len(weights) else NEUTRAL_WEIGHT)
            pair_weights.extend([pw, pw])
            pair_groups.append(2)

    if not pair_rows:
        return None, [], [], []

    pair_df = pd.DataFrame(pair_rows, columns=FEATURE_NAMES)
    return pair_df, pair_labels, pair_groups, pair_weights

