"""Prediction module — runs ML inference or falls back to heuristic scoring.

This is the central scoring gateway: it checks whether a trained ML model
is available and uses it, or delegates to the existing heuristic scorer.
"""

from __future__ import annotations

from typing import Optional

import numpy as np
import pandas as pd
from sqlalchemy.orm import Session

from ml.feature_engineering import compute_features, FEATURE_NAMES
from ml.model_loader import get_model_loader
from ml.explainability import explain_homes, counterfactual_suggestions_for_all


def predict_scores(
    homes: list[dict],
    places: list[dict],
    routes: list[dict],
    mode_blend_weights: dict[str, float],
    db: Session,
    user_profile: dict | None = None,
) -> tuple[list[float], pd.DataFrame, bool]:
    """Predict ranking scores for homes in a scenario.

    Returns:
        (scores, features_df, ml_used) where:
        - scores: list of normalised scores (0–100), one per home
        - features_df: the computed feature DataFrame
        - ml_used: True if ML model was used, False if heuristic fallback
    """
    # Compute features
    features_df = compute_features(homes, places, routes, mode_blend_weights, user_profile)

    if features_df.empty:
        return [], features_df, False

    # Try ML model
    loader = get_model_loader()
    model = loader.get_active_model(db)

    if model is not None:
        # Use ML model
        raw_scores = model.predict(features_df[FEATURE_NAMES])
        normalised = _normalise_to_ui_range(raw_scores)
        return normalised.tolist(), features_df, True

    # Fallback: heuristic scoring is handled by the existing scoring.py
    # Return empty scores to signal that the caller should use heuristic
    return [], features_df, False


def _normalise_to_ui_range(raw_scores: np.ndarray) -> np.ndarray:
    """Normalise raw LightGBM prediction scores to 0–100 UI range.

    Maps the range [min, max] to [20, 90] so all scores are visually distinct.
    """
    min_s = np.min(raw_scores)
    max_s = np.max(raw_scores)
    score_range = max_s - min_s

    if score_range > 0:
        normalised = ((raw_scores - min_s) / score_range) * 70 + 20
    else:
        normalised = np.full_like(raw_scores, 55.0)

    return np.clip(np.round(normalised), 10, 99)


def get_explanations(
    homes: list[dict],
    features_df: pd.DataFrame,
    db: Session,
) -> list[dict]:
    """Get SHAP explanations + counterfactual improvements for each home.

    Returns:
        List of dicts with keys: homeId, explanations, improvements
    """
    loader = get_model_loader()
    model = loader.get_active_model(db)

    if model is None or features_df.empty:
        return []

    explanations = explain_homes(model, features_df)
    improvements = counterfactual_suggestions_for_all(model, features_df)

    results = []
    for i in range(len(features_df)):
        results.append({
            "homeId": homes[i].get("id", i),
            "explanations": explanations[i] if i < len(explanations) else [],
            "improvements": improvements[i] if i < len(improvements) else [],
        })

    return results
