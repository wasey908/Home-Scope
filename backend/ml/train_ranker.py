"""LightGBM LambdaMART training module.

Trains a learning-to-rank model from scenario-home feature data
and user interaction labels.
"""

from __future__ import annotations

import pickle
from datetime import datetime, timezone

import lightgbm as lgb
import numpy as np
from sqlalchemy.orm import Session

from models import MLModel as MLModelRecord
from ml.build_dataset import build_training_dataset, should_train
from ml.feature_engineering import FEATURE_NAMES


# ─── Hyperparameters (conservative for small dataset) ──────────────

LGBM_PARAMS = {
    "objective": "lambdarank",
    "metric": "ndcg",
    "ndcg_eval_at": [3, 5],
    "num_leaves": 15,
    "max_depth": 4,
    "learning_rate": 0.05,
    "n_estimators": 100,
    "min_child_samples": 5,
    "reg_alpha": 0.1,
    "reg_lambda": 1.0,
    "subsample": 0.8,
    "colsample_bytree": 0.8,
    "verbose": -1,
}


def train_model(db: Session) -> dict:
    """Train the LightGBM ranking model and save it to the database.

    Returns:
        dict with training status, metrics, and model version.

    Raises:
        ValueError: if training threshold is not met or data is insufficient.
    """
    # Check threshold
    threshold_met, n_interactions, n_scenarios = should_train(db)
    if not threshold_met:
        raise ValueError(
            f"Training threshold not met: {n_interactions} interactions "
            f"(need {35}), {n_scenarios} scenarios (need {3})."
        )

    # Build dataset
    X, y, groups, sample_weights = build_training_dataset(db)

    if X.empty or len(y) == 0 or len(groups) == 0:
        raise ValueError("No training data available after building dataset.")

    y_arr = np.array(y, dtype=np.float32)
    groups_arr = np.array(groups, dtype=np.int32)
    weights_arr = np.array(sample_weights, dtype=np.float32) if sample_weights else None

    # Validate data
    if len(y_arr) != len(X):
        raise ValueError(f"Label count ({len(y_arr)}) != feature rows ({len(X)})")
    if sum(groups_arr) != len(X):
        raise ValueError(f"Group sum ({sum(groups_arr)}) != feature rows ({len(X)})")

    # Train LightGBM Ranker
    model = lgb.LGBMRanker(**LGBM_PARAMS)
    model.fit(
        X[FEATURE_NAMES],
        y_arr,
        group=groups_arr,
        sample_weight=weights_arr,
    )

    # Compute training metrics
    train_predictions = model.predict(X[FEATURE_NAMES])

    # Compute NDCG@3 and NDCG@5 per query group
    from sklearn.metrics import ndcg_score as _ndcg_score

    ndcg_at_3_list = []
    ndcg_at_5_list = []
    offset = 0
    for g_size in groups:
        if g_size < 2:
            offset += g_size
            continue
        g_true = y_arr[offset:offset + g_size].reshape(1, -1)
        g_pred = train_predictions[offset:offset + g_size].reshape(1, -1)
        try:
            ndcg_at_3_list.append(float(_ndcg_score(g_true, g_pred, k=min(3, g_size))))
            ndcg_at_5_list.append(float(_ndcg_score(g_true, g_pred, k=min(5, g_size))))
        except Exception:
            pass
        offset += g_size

    avg_ndcg3 = round(sum(ndcg_at_3_list) / len(ndcg_at_3_list), 4) if ndcg_at_3_list else 0.0
    avg_ndcg5 = round(sum(ndcg_at_5_list) / len(ndcg_at_5_list), 4) if ndcg_at_5_list else 0.0

    metrics = {
        "ndcg@3": avg_ndcg3,
        "ndcg@5": avg_ndcg5,
        "n_training_rows": int(len(X)),
        "n_groups": int(len(groups)),
        "n_interactions": int(n_interactions),
        "n_features": len(FEATURE_NAMES),
        "feature_importance": dict(zip(
            FEATURE_NAMES,
            [int(x) for x in model.feature_importances_],
        )),
        "prediction_range": {
            "min": float(np.min(train_predictions)),
            "max": float(np.max(train_predictions)),
            "mean": float(np.mean(train_predictions)),
        },
    }

    # Serialise model
    model_blob = pickle.dumps(model)

    # Determine version
    latest = (
        db.query(MLModelRecord)
        .filter(MLModelRecord.model_name == "homescope_ranker")
        .order_by(MLModelRecord.model_version.desc())
        .first()
    )
    new_version = (latest.model_version + 1) if latest else 1

    # Deactivate previous active model
    db.query(MLModelRecord).filter(
        MLModelRecord.model_name == "homescope_ranker",
        MLModelRecord.is_active == True,
    ).update({"is_active": False})

    # Save new model
    record = MLModelRecord(
        model_name="homescope_ranker",
        model_version=new_version,
        model_blob=model_blob,
        feature_names=FEATURE_NAMES,
        metrics=metrics,
        is_active=True,
    )
    db.add(record)
    db.commit()

    return {
        "status": "trained",
        "model_version": new_version,
        "metrics": metrics,
    }
