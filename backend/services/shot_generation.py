"""Service layer for generating storyboard shots."""

from __future__ import annotations

from typing import Iterable

from fastapi import HTTPException, status

from ..agent_structured_outputs import Scene, Shot
from ..agent_tools import generate_shot_with_refs
from ..schemas import ShotAsset, ShotGenerationRequest, ShotGenerationResponse
from ..session_store import SessionStore, session_store


class ShotGenerationService:
    def __init__(self, store: SessionStore | None = None) -> None:
        self.store = store or session_store

    def _filter_scenes(self, scenes: Iterable[Scene], scene_numbers: Iterable[int] | None) -> list[Scene]:
        if scene_numbers is None:
            return list(scenes)
        allowed = set(scene_numbers)
        filtered = [scene for scene in scenes if scene.scene_number in allowed]
        if not filtered:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No matching scenes found for provided scene_numbers",
            )
        return filtered

    def _compose_shot_description(self, scene: Scene, shot: Shot) -> str:
        base = f"Scene {scene.scene_number} - {scene.scene_title}: {shot.shot_description}"
        if shot.characters_in_shot:
            characters = ", ".join(shot.characters_in_shot)
            return f"{base} Characters in shot: {characters}."
        return base

    def _collect_references(self, shot: Shot, session) -> list[str]:
        references: list[str] = []
        missing: list[str] = []

        for name in shot.characters_in_shot:
            asset = session.character_assets.get(name)
            if asset:
                references.append(asset.image_url)
            else:
                missing.append(name)

        if missing:
            missing_str = ", ".join(missing)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Characters missing generated images for shot "
                    f"{shot.shot_number}: {missing_str}. Generate characters first."
                ),
            )

        return references

    def generate(self, payload: ShotGenerationRequest) -> ShotGenerationResponse:
        session = self.store.get_session(payload.session_id)
        if not session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

        scenes_to_process = self._filter_scenes(session.scenes, payload.scene_numbers)
        generated_shots: list[ShotAsset] = []

        for scene in scenes_to_process:
            for shot in scene.shots:
                references = self._collect_references(shot, session)
                shot_description = self._compose_shot_description(scene, shot)

                try:
                    result = generate_shot_with_refs(
                        shot_description=shot_description,
                        style=session.style,
                        reference_image_urls=references,
                    )
                except RuntimeError as exc:
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail=(
                            f"Shot generation failed for scene {scene.scene_number} "
                            f"shot {shot.shot_number}: {exc}"
                        ),
                    ) from exc

                asset = ShotAsset(
                    scene_number=scene.scene_number,
                    shot_number=shot.shot_number,
                    shot_description=shot.shot_description,
                    characters_in_shot=shot.characters_in_shot,
                    image_url=result["image_url"],
                    seed=result["seed"],
                    structured_prompt=result["structured_prompt"],
                    raw_structured_prompt=result["raw_structured_prompt"],
                )

                key = f"{scene.scene_number}:{shot.shot_number}"
                session.shot_assets[key] = asset
                generated_shots.append(asset)

        self.store.update_session(session)
        return ShotGenerationResponse(session_id=session.session_id, shots=generated_shots)
