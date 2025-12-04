"""Service layer for generating visual assets for characters."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
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

    def _filter_missing_assets(self, session, targets):
        """Return only characters that do not yet have generated assets in the session."""
        existing = {name.lower() for name in session.character_assets.keys()}
        return [c for c in targets if c.name.lower() not in existing]

    def generate(self, payload: CharacterGenerationRequest) -> CharacterGenerationResponse:
        session = self.store.get_session(payload.session_id)
        if not session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

        targets = self._resolve_characters(session, payload.character_names)
        targets = self._filter_missing_assets(session, targets)

        # Nothing to do; return empty list but keep session intact.
        if not targets:
            return CharacterGenerationResponse(session_id=session.session_id, characters=[])

        def _generate(character):
            try:
                result = generate_character(
                    character.character_description, session.style, bria_api_token=payload.bria_api_token
                )
                return character, result
            except Exception as exc:  # pylint: disable=broad-except
                # Convert to RuntimeError so outer handler can wrap as HTTPException
                raise RuntimeError(exc) from exc

        generated_assets: list[CharacterAsset] = []
        max_workers = min(len(targets), 8) or 1
        try:
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                future_map = {executor.submit(_generate, character): character.name for character in targets}
                for future in as_completed(future_map):
                    character, result = future.result()
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
        except RuntimeError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Character generation failed: {exc}",
            ) from exc
        except Exception as exc:  # pylint: disable=broad-except
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Character generation failed: {exc}",
            ) from exc

        self.store.update_session(session)
        return CharacterGenerationResponse(session_id=session.session_id, characters=generated_assets)
