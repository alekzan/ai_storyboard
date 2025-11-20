"""Service layer for generating visual assets for characters."""

from __future__ import annotations

from typing import Iterable

from fastapi import HTTPException, status

from ..agent_tools import generate_character
from ..schemas import (
    CharacterGenerationRequest,
    CharacterGenerationResponse,
    CharacterAsset,
)
from ..session_store import session_store, SessionStore


class CharacterGenerationService:
    def __init__(self, store: SessionStore | None = None) -> None:
        self.store = store or session_store

    def _resolve_characters(self, session, names: Iterable[str] | None):
        targets = session.characters
        if names:
            name_set = {name.lower() for name in names}
            targets = [c for c in session.characters if c.name.lower() in name_set]
            if not targets:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="No matching characters found for provided names",
                )
        return targets

    def generate(self, payload: CharacterGenerationRequest) -> CharacterGenerationResponse:
        session = self.store.get_session(payload.session_id)
        if not session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

        targets = self._resolve_characters(session, payload.character_names)

        generated_assets: list[CharacterAsset] = []
        for character in targets:
            try:
                result = generate_character(character.character_description, session.style)
            except RuntimeError as exc:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Character generation failed for {character.name}: {exc}",
                ) from exc

            asset = CharacterAsset(
                name=character.name,
                description=character.character_description,
                image_url=result["image_url"],
                seed=result["seed"],
                structured_prompt=result["structured_prompt"],
                raw_structured_prompt=result["raw_structured_prompt"],
            )
            session.character_assets[character.name] = asset
            generated_assets.append(asset)

        self.store.update_session(session)
        return CharacterGenerationResponse(session_id=session.session_id, characters=generated_assets)
