"""Simple in-memory session storage for the storyboard pipeline."""

from __future__ import annotations

from typing import Dict
from uuid import uuid4

from pydantic import BaseModel, Field

from .agent_structured_outputs import CharacterInfo, Scene
from .schemas import CharacterAsset, ShotAsset


class SessionData(BaseModel):
    session_id: str
    script: str
    style: str
    characters: list[CharacterInfo]
    scenes: list[Scene]
    character_assets: Dict[str, CharacterAsset] = Field(default_factory=dict)
    shot_assets: Dict[str, ShotAsset] = Field(default_factory=dict)


class SessionStore:
    def __init__(self) -> None:
        self._sessions: Dict[str, SessionData] = {}

    def create_session(
        self, *, script: str, style: str, characters: list[CharacterInfo], scenes: list[Scene]
    ) -> SessionData:
        session_id = uuid4().hex
        data = SessionData(
            session_id=session_id,
            script=script,
            style=style,
            characters=characters,
            scenes=scenes,
        )
        self._sessions[session_id] = data
        return data

    def get_session(self, session_id: str) -> SessionData | None:
        return self._sessions.get(session_id)

    def update_session(self, session: SessionData) -> None:
        self._sessions[session.session_id] = session


session_store = SessionStore()
