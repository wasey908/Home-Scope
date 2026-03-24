"""Explainability module — SHAP-based explanations and counterfactual suggestions.

Provides:
1. Per-home top-3 feature contributions (why this rank)
2. Counterfactual improvements (what would improve this home's rank)
"""

from __future__ import annotations

from typing import Optional

import numpy as np
import pandas as pd

from ml.feature_engineering import (
    FEATURE_NAMES, FEATURE_LABELS, LOWER_IS_BETTER, FEATURE_UNITS,
)


def explain_homes(
    model,
    features_df: pd.DataFrame,
    top_n: int = 3,
) -> list[list[dict]]:
    """Generate SHAP-based explanations for each home's ranking.

    Args:
        model: Trained LGBMRanker model
        features_df: Feature DataFrame (one row per home)
        top_n: Number of top contributing features to return

    Returns:
        List of lists — for each home, a list of {factor, impact} dicts.
    """
    try:
        import shap
        explainer = shap.TreeExplainer(model)
        shap_values = explainer.shap_values(features_df[FEATURE_NAMES])
    except Exception:
        # SHAP can fail on edge cases — fall back to feature importance
        return _fallback_explanations(model, features_df, top_n)

    explanations = []
    for i in range(len(features_df)):
        row_shap = shap_values[i]
        # Sort by absolute SHAP value (most impactful first)
        indexed = list(enumerate(row_shap))
        indexed.sort(key=lambda x: abs(x[1]), reverse=True)

        reasons = []
        for feat_idx, shap_val in indexed[:top_n]:
            feat_name = FEATURE_NAMES[feat_idx]
            human_label = FEATURE_LABELS.get(feat_name, feat_name)

            # Determine direction text
            if shap_val > 0:
                # Positive SHAP = pushes ranking up
                if feat_name in LOWER_IS_BETTER:
                    direction = "Lower"
                else:
                    direction = "Higher"
            else:
                if feat_name in LOWER_IS_BETTER:
                    direction = "Higher"
                else:
                    direction = "Lower"

            reasons.append({
                "factor": f"{direction} {human_label}",
                "impact": round(float(shap_val), 2),
            })

        explanations.append(reasons)

    return explanations


def _fallback_explanations(
    model,
    features_df: pd.DataFrame,
    top_n: int = 3,
) -> list[list[dict]]:
    """Fallback when SHAP fails — use global feature importance + feature values."""
    importances = model.feature_importances_
    top_indices = np.argsort(importances)[-top_n:][::-1]

    explanations = []
    for i in range(len(features_df)):
        reasons = []
        for idx in top_indices:
            feat_name = FEATURE_NAMES[idx]
            human_label = FEATURE_LABELS.get(feat_name, feat_name)
            val = features_df.iloc[i][feat_name]

            # Compare to median of all homes in this scenario
            median_val = features_df[feat_name].median()
            if feat_name in LOWER_IS_BETTER:
                direction = "Lower" if val < median_val else "Higher"
            else:
                direction = "Higher" if val > median_val else "Lower"

            reasons.append({
                "factor": f"{direction} {human_label}",
                "impact": round(float(importances[idx]), 2),
            })
        explanations.append(reasons)

    return explanations


def counterfactual_suggestions_for_all(
    model,
    features_df: pd.DataFrame,
    top_n: int = 3,
) -> list[list[dict]]:
    """Generate counterfactual improvement suggestions for each home.

    For homes not ranked #1, identifies what feature changes would most
    improve their ranking score.

    Returns:
        List of lists — for each home, a list of {suggestion, estimated_score_gain} dicts.
    """
    if features_df.empty:
        return []

    try:
        import shap
        explainer = shap.TreeExplainer(model)
        shap_values = explainer.shap_values(features_df[FEATURE_NAMES])
    except Exception:
        # Can't compute counterfactuals without SHAP
        return [[] for _ in range(len(features_df))]

    # Find the top-ranked home (highest predicted score)
    predictions = model.predict(features_df[FEATURE_NAMES])
    top_idx = int(np.argmax(predictions))
    top_features = features_df.iloc[top_idx]

    improvements = []
    for i in range(len(features_df)):
        if i == top_idx:
            # Top home doesn't need improvements
            improvements.append([])
            continue

        row_shap = shap_values[i]
        row_features = features_df.iloc[i]
        suggestions = []

        for feat_idx, shap_val in enumerate(row_shap):
            if shap_val >= 0:
                # This feature is already helping, skip
                continue

            feat_name = FEATURE_NAMES[feat_idx]
            delta = float(row_features[feat_name] - top_features[feat_name])

            if abs(delta) < 0.01:
                continue

            human_label = FEATURE_LABELS.get(feat_name, feat_name)
            unit = FEATURE_UNITS.get(feat_name, "")

            # Build human-readable suggestion
            if feat_name in LOWER_IS_BETTER:
                if delta > 0:
                    suggestion = f"{human_label} were {abs(delta):.0f} {unit} shorter".strip()
                else:
                    continue  # Already better than top, shouldn't happen
            else:
                if delta < 0:
                    suggestion = f"{human_label} were {abs(delta):.0f} {unit} higher".strip()
                else:
                    continue

            suggestions.append({
                "suggestion": suggestion,
                "estimated_score_gain": round(abs(float(shap_val)), 1),
            })

        # Sort by score gain and take top_n
        suggestions.sort(key=lambda s: s["estimated_score_gain"], reverse=True)
        improvements.append(suggestions[:top_n])

    return improvements
