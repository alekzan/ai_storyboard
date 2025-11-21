"""Service layer for refining or regenerating existing storyboard shots."""

from __future__ import annotations

from fastapi import HTTPException, status

from ..agent_tools import refine_shot_with_refs
from ..schemas import ShotAsset, ShotRefineRequest, ShotRefineResponse
from ..session_store import SessionStore, session_store


class ShotRefinementService:
    def __init__(self, store: SessionStore | None = None) -> None:
        self.store = store or session_store

    def _get_shot_asset(self, session, scene_number: int, shot_number: int) -> ShotAsset:
        key = f"{scene_number}:{shot_number}"
        asset = session.shot_assets.get(key)
        if not asset:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Shot not found; generate it before refining.",
            )
        return asset

    def _collect_references(self, shot_asset: ShotAsset, session) -> list[str]:
        if not shot_asset.characters_in_shot:
            return []
        missing: list[str] = []
        refs: list[str] = []
        for name in shot_asset.characters_in_shot:
            character = session.character_assets.get(name)
            if character:
                refs.append(character.image_url)
            else:
                missing.append(name)
        if missing:
            names = ", ".join(missing)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Missing character references for refine: {names}. Generate characters first.",
            )
        return refs

    def refine(self, payload: ShotRefineRequest) -> ShotRefineResponse:
        session = self.store.get_session(payload.session_id)
        if not session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

        shot_asset = self._get_shot_asset(session, payload.scene_number, payload.shot_number)
        references = self._collect_references(shot_asset, session) if payload.use_reference_images else []

        try:
            result = refine_shot_with_refs(
                edit_prompt=payload.edit_prompt,
                previous_structured_prompt=shot_asset.structured_prompt,
                seed=shot_asset.seed,
                reference_image_urls=references or None,
            )
        except RuntimeError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=(
                    f"Shot refinement failed for scene {payload.scene_number} "
                    f"shot {payload.shot_number}: {exc}"
                ),
            ) from exc

        updated = ShotAsset(
            scene_number=shot_asset.scene_number,
            shot_number=shot_asset.shot_number,
            shot_description=shot_asset.shot_description,
            characters_in_shot=shot_asset.characters_in_shot,
            image_url=result["image_url"],
            seed=result["seed"],
            structured_prompt=result["structured_prompt"],
            raw_structured_prompt=result["raw_structured_prompt"],
        )

        key = f"{payload.scene_number}:{payload.shot_number}"
        session.shot_assets[key] = updated
        self.store.update_session(session)

        return ShotRefineResponse(session_id=session.session_id, shot=updated)
