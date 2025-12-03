"""Service layer that uses shot_agent to decide refine vs regenerate for shots."""

from __future__ import annotations

from fastapi import HTTPException, status
import re

from ..agent_structured_outputs import Scene, Shot, ShotAgentDecision
from ..agent_tools import generate_shot_with_refs, refine_shot_with_refs
from ..schemas import ShotAsset, ShotEditRequest, ShotEditResponse
from ..session_store import SessionStore, session_store
from .llm_agents import run_shot_agent


class ShotEditService:
    def __init__(self, store: SessionStore | None = None) -> None:
        self.store = store or session_store

    def _get_session_shot_data(self, session_id: str, scene_number: int, shot_number: int):
        session = self.store.get_session(session_id)
        if not session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

        key = f"{scene_number}:{shot_number}"
        shot_asset = session.shot_assets.get(key)
        planned_shot = None
        for scene in session.scenes:
            if scene.scene_number != scene_number:
                continue
            planned_shot = next((s for s in scene.shots if s.shot_number == shot_number), None)
            break

        if not planned_shot:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shot not found")

        return session, shot_asset, planned_shot

    def _infer_characters_in_text(self, description: str, session) -> list[str]:
        """Fuzzy match character names in free text.

        Accepts either the full name or any meaningful token (e.g., first name)
        to support prompts that only mention "Dorothy" instead of "Dorothy Gale".
        """

        lowered = description.lower()
        names: list[str] = []
        for character in session.characters:
            full = character.name.lower()
            tokens = [t for t in re.split(r"[\s\-]+", full) if len(t) > 2]
            match_full = full in lowered
            match_token = any(token in lowered for token in tokens)
            if match_full or match_token:
                names.append(character.name)
        # Preserve ordering but unique
        seen = set()
        ordered = []
        for name in names:
            if name in seen:
                continue
            seen.add(name)
            ordered.append(name)
        return ordered

    def _strip_reference_hint(self, text: str) -> str:
        """Remove LLM-side helper hints like '(use provided character reference)'."""

        if not text:
            return text
        return re.sub(r"\s*\(.*?provided character reference.*?\)", "", text, flags=re.IGNORECASE).strip()

    def _default_characters_if_single(self, session, current: list[str]) -> list[str]:
        """If no characters inferred and there is a single known character, use it as a fallback."""

        if current:
            return current
        if len(session.characters) == 1:
            return [session.characters[0].name]
        return current

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
        session, shot_asset, planned_shot = self._get_session_shot_data(
            payload.session_id, payload.scene_number, payload.shot_number
        )

        # If no asset exists yet, treat this as a first-time generation using the
        # shot description plus the user request as guidance. We still run the
        # shot agent to synthesize a full shot description.
        if not shot_asset:
            base_description = (planned_shot.shot_description or "").strip()
            combined_description = "\n".join(filter(None, [base_description, payload.user_request])).strip()

            try:
                decision = run_shot_agent(
                    shot_description=base_description or "Placeholder shot",
                    user_request=payload.user_request,
                    previous_structured_prompt={},
                    seed=0,
                    characters_in_shot=planned_shot.characters_in_shot,
                    style=session.style,
                    characters_catalog=[c.name for c in session.characters],
                    has_asset=False,
                )
            except RuntimeError:
                # Fall back to a simple generate path if the agent fails
                decision = ShotAgentDecision(
                    action="generate",
                    shot_description=combined_description or payload.user_request,
                    edit_prompt=None,
                    use_reference_images=True,
                )

            new_description_raw = decision.shot_description or combined_description or payload.user_request or ""
            new_description = self._strip_reference_hint(new_description_raw)
            characters_in_shot = planned_shot.characters_in_shot or self._infer_characters_in_text(
                new_description or combined_description, session
            )
            characters_in_shot = self._default_characters_if_single(session, characters_in_shot)
            use_refs_flag = decision.use_reference_images
            if use_refs_flag is True:
                references = self._collect_references(session, characters_in_shot) if characters_in_shot else []
            else:
                references = []

            try:
                result = generate_shot_with_refs(
                    shot_description=new_description,
                    style=session.style,
                    reference_image_urls=references,
                )
            except RuntimeError as exc:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=(
                        f"Shot generation failed for scene {payload.scene_number} "
                        f"shot {payload.shot_number}: {exc}"
                    ),
                ) from exc

            generated = ShotAsset(
                scene_number=payload.scene_number,
                shot_number=planned_shot.shot_number,
                shot_description=new_description,
                characters_in_shot=characters_in_shot,
                image_url=result["image_url"],
                seed=result["seed"],
                structured_prompt=result["structured_prompt"],
                raw_structured_prompt=result["raw_structured_prompt"],
            )
            key = f"{payload.scene_number}:{payload.shot_number}"
            session.shot_assets[key] = generated

            # Persist updated description in the scene so the UI reflects the agent change.
            for scene_idx, scene in enumerate(session.scenes):
                if scene.scene_number != payload.scene_number:
                    continue
                updated_shots: list[Shot] = []
                for shot in scene.shots:
                    if shot.shot_number == payload.shot_number:
                        updated_shots.append(
                            Shot(
                                shot_number=shot.shot_number,
                                shot_description=new_description,
                                characters_in_shot=characters_in_shot,
                            )
                        )
                    else:
                        updated_shots.append(shot)
                session.scenes[scene_idx] = Scene(
                    scene_number=scene.scene_number,
                    scene_title=scene.scene_title,
                    shots=updated_shots,
                )
                break

            self.store.update_session(session)
            return ShotEditResponse(session_id=session.session_id, decision=decision.action, shot=generated)

        try:
            decision = run_shot_agent(
                shot_description=shot_asset.shot_description,
                user_request=payload.user_request,
                previous_structured_prompt=shot_asset.structured_prompt,
                seed=shot_asset.seed,
                characters_in_shot=shot_asset.characters_in_shot,
                style=session.style,
                characters_catalog=[c.name for c in session.characters],
                has_asset=True,
            )
        except RuntimeError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Shot agent failed: {exc}",
            ) from exc

        action = decision.action.lower().strip()
        use_refs_flag = decision.use_reference_images
        references: list[str] = []

        # Attempt to infer an updated character list from the agent-proposed description
        new_characters_in_shot = shot_asset.characters_in_shot
        if decision.shot_description:
            inferred = self._infer_characters_in_text(decision.shot_description, session)
            if inferred:
                new_characters_in_shot = inferred
        new_characters_in_shot = self._default_characters_if_single(session, new_characters_in_shot)

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
            # if the agent implied new characters, use that list to collect references only when requested
            if new_characters_in_shot and (use_refs_flag is True):
                references = self._collect_references(session, new_characters_in_shot)

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

        # Compute an updated description so the UI reflects the agent change and future
        # generations use the latest narrative.
        # Prefer the agent-supplied full description; otherwise fall back to the edit text
        # or user request so the UI reflects the latest narrative without stacking
        # "Edit:" lines.
        new_shot_description_raw = (
            decision.shot_description
            or result.get("structured_prompt", {}).get("short_description")
            or (decision.edit_prompt if decision.action == "refine" else None)
            or (payload.user_request if decision.action == "generate" else None)
            or shot_asset.shot_description
        )
        new_shot_description = self._strip_reference_hint(new_shot_description_raw)

        characters_in_shot_final = new_characters_in_shot or shot_asset.characters_in_shot

        updated = ShotAsset(
            scene_number=shot_asset.scene_number,
            shot_number=shot_asset.shot_number,
            shot_description=new_shot_description,
            characters_in_shot=characters_in_shot_final,
            image_url=result["image_url"],
            seed=result["seed"],
            structured_prompt=result["structured_prompt"],
            raw_structured_prompt=result["raw_structured_prompt"],
        )

        key = f"{payload.scene_number}:{payload.shot_number}"
        session.shot_assets[key] = updated

        # Also persist the updated description in the structured scenes so the prompt
        # text area shows the agent's change.
        for scene_idx, scene in enumerate(session.scenes):
            if scene.scene_number != payload.scene_number:
                continue
            updated_shots: list[Shot] = []
            for shot in scene.shots:
                if shot.shot_number == payload.shot_number:
                    updated_shots.append(
                        Shot(
                            shot_number=shot.shot_number,
                            shot_description=new_shot_description,
                            characters_in_shot=characters_in_shot_final,
                        )
                    )
                else:
                    updated_shots.append(shot)
            session.scenes[scene_idx] = Scene(
                scene_number=scene.scene_number,
                scene_title=scene.scene_title,
                shots=updated_shots,
            )
            break

        self.store.update_session(session)

        return ShotEditResponse(session_id=session.session_id, decision=action, shot=updated)
