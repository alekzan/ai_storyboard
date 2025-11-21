"""Service layer that uses shot_agent to decide refine vs regenerate for shots."""

from __future__ import annotations

from fastapi import HTTPException, status

from ..agent_tools import generate_shot_with_refs, refine_shot_with_refs
from ..schemas import ShotAsset, ShotEditRequest, ShotEditResponse
from ..session_store import SessionStore, session_store
from .llm_agents import run_shot_agent


class ShotEditService:
    def __init__(self, store: SessionStore | None = None) -> None:
        self.store = store or session_store

    def _get_session_and_shot(self, session_id: str, scene_number: int, shot_number: int):
        session = self.store.get_session(session_id)
        if not session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

        key = f"{scene_number}:{shot_number}"
        shot_asset = session.shot_assets.get(key)
        if not shot_asset:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Shot not found; generate it before editing.",
            )
        return session, shot_asset

    def _collect_references(self, session, characters: list[str]) -> list[str]:
        refs: list[str] = []
        missing: list[str] = []
        for name in characters:
            asset = session.character_assets.get(name)
            if asset:
                refs.append(asset.image_url)
            else:
                missing.append(name)
        if missing:
            names = ", ".join(missing)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Missing character references: {names}. Generate characters first.",
            )
        return refs

    def edit(self, payload: ShotEditRequest) -> ShotEditResponse:
        session, shot_asset = self._get_session_and_shot(
            payload.session_id, payload.scene_number, payload.shot_number
        )

        try:
            decision = run_shot_agent(
                shot_description=shot_asset.shot_description,
                user_request=payload.user_request,
                previous_structured_prompt=shot_asset.structured_prompt,
                seed=shot_asset.seed,
                characters_in_shot=shot_asset.characters_in_shot,
            )
        except RuntimeError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Shot agent failed: {exc}",
            ) from exc

        action = decision.action.lower().strip()
        use_refs_flag = decision.use_reference_images
        references: list[str] = []

        if action not in {"refine", "generate"}:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Invalid shot agent action: {decision.action}",
            )

        if action == "refine":
            edit_prompt = decision.edit_prompt or payload.user_request
            if shot_asset.characters_in_shot and (use_refs_flag is True):
                references = self._collect_references(session, shot_asset.characters_in_shot)

            try:
                result = refine_shot_with_refs(
                    edit_prompt=edit_prompt,
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
        else:
            description = decision.shot_description or f"{shot_asset.shot_description}. {payload.user_request}"
            if shot_asset.characters_in_shot and (use_refs_flag is not False):
                references = self._collect_references(session, shot_asset.characters_in_shot)

            try:
                result = generate_shot_with_refs(
                    shot_description=description,
                    style=session.style,
                    reference_image_urls=references,
                )
            except RuntimeError as exc:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=(
                        f"Shot regeneration failed for scene {payload.scene_number} "
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

        return ShotEditResponse(session_id=session.session_id, decision=action, shot=updated)
