"""Application configuration helpers."""

from __future__ import annotations

import os
from functools import lru_cache
from pydantic import BaseModel
from dotenv import load_dotenv

# Ensure local environment variables are loaded when running locally
load_dotenv()


class Settings(BaseModel):
    """Centralized runtime configuration for the backend."""

    environment: str
    bria_api_token: str | None
    openai_api_key: str | None
    openai_model: str

    @property
    def bria_configured(self) -> bool:
        return bool(self.bria_api_token)

    @property
    def llm_configured(self) -> bool:
        return bool(self.openai_api_key)


@lru_cache
def get_settings() -> Settings:
    """Cache settings so modules across the app share the same config."""

    return Settings(
        environment=os.getenv("ENVIRONMENT", "local"),
        bria_api_token=os.getenv("BRIA_API_TOKEN"),
        openai_api_key=os.getenv("OPENAI_API_KEY"),
        openai_model=os.getenv("OPENAI_MODEL", "gpt-5-mini-2025-08-07"), #gpt-5-mini-2025-08-07, gpt-5-nano-2025-08-07
    )
