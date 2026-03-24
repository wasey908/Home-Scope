"""Model loader — loads and caches the active LightGBM model from the database."""

from __future__ import annotations

import pickle
from typing import Optional

import lightgbm as lgb
from sqlalchemy.orm import Session

from models import MLModel as MLModelRecord


class ModelLoader:
    """Singleton-style loader that caches the active ML model in memory."""

    def __init__(self):
        self._model: Optional[lgb.LGBMRanker] = None
        self._version: Optional[int] = None
        self._feature_names: Optional[list[str]] = None
        self._metrics: Optional[dict] = None

    def get_active_model(self, db: Session) -> Optional[lgb.LGBMRanker]:
        """Load the active model from DB if not cached (or if a newer version exists)."""
        active_record = (
            db.query(MLModelRecord)
            .filter(
                MLModelRecord.model_name == "homescope_ranker",
                MLModelRecord.is_active == True,
            )
            .first()
        )

        if not active_record:
            self._model = None
            self._version = None
            return None

        # Reload only if version changed
        if self._version != active_record.model_version:
            self._model = pickle.loads(active_record.model_blob)
            self._version = active_record.model_version
            self._feature_names = active_record.feature_names
            self._metrics = active_record.metrics

        return self._model

    @property
    def version(self) -> Optional[int]:
        return self._version

    @property
    def feature_names(self) -> Optional[list[str]]:
        return self._feature_names

    @property
    def metrics(self) -> Optional[dict]:
        return self._metrics

    def invalidate(self):
        """Force reload on next call."""
        self._model = None
        self._version = None


# Global singleton instance
_loader = ModelLoader()


def get_model_loader() -> ModelLoader:
    """Return the global model loader instance."""
    return _loader
