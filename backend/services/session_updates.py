"""Services for updating session data (character and shot prompts)."""

from __future__ import annotations

from fastapi import HTTPException, status

from ..agent_structured_outputs import CharacterInfo, Scene, Shot
from ..schemas import (
    CharacterUpdateRequest,
    CharacterUpdateResponse,
    ShotUpdateRequest,
    ShotUpdateResponse,
)
from ..session_store import SessionStore, session_store


class SessionUpdateService:
    def __init__(self, store: SessionStore | None = None) -> None:
        self.store = store or session_store

    def _get_session(self, session_id: str):
        session = self.store.get_session(session_id)
        if not session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
        return session

    def update_character(self, payload: CharacterUpdateRequest) -> CharacterUpdateResponse:
        session = self._get_session(payload.session_id)

        idx = next((i for i, c in enumerate(session.characters) if c.name.lower() == payload.name.lower()), None)
        if idx is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Character not found")

        prev = session.characters[idx]
        session.characters[idx] = CharacterInfo(
            name=prev.name,
            character_description=payload.character_description,
        )
        # Drop asset only if description actually changed
        if payload.character_description.strip() != (prev.character_description or "").strip():
            session.character_assets.pop(prev.name, None)
        self.store.update_session(session)
        return CharacterUpdateResponse(session_id=session.session_id, characters=session.characters)

    def update_shot(self, payload: ShotUpdateRequest) -> ShotUpdateResponse:
        session = self._get_session(payload.session_id)

        scene_idx = next((i for i, s in enumerate(session.scenes) if s.scene_number == payload.scene_number), None)
        if scene_idx is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scene not found")

        scene = session.scenes[scene_idx]
        shot_idx = next((i for i, s in enumerate(scene.shots) if s.shot_number == payload.shot_number), None)
        if shot_idx is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shot not found")

        # Update shot description
        scene.shots[shot_idx] = Shot(
            shot_number=scene.shots[shot_idx].shot_number,
            shot_description=payload.shot_description,
            characters_in_shot=scene.shots[shot_idx].characters_in_shot,
        )

        # Clear stale generated asset for this shot
        key = f"{payload.scene_number}:{payload.shot_number}"
        session.shot_assets.pop(key, None)

        # Persist updates
        session.scenes[scene_idx] = Scene(
            scene_number=scene.scene_number,
            scene_title=scene.scene_title,
            shots=scene.shots,
        )
        self.store.update_session(session)
        return ShotUpdateResponse(session_id=session.session_id, scenes=session.scenes)
