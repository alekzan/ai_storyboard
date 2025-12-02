"""Services for updating session data (character and shot prompts)."""

from __future__ import annotations

from fastapi import HTTPException, status

from ..agent_structured_outputs import CharacterInfo, Scene, Shot
from ..schemas import (
    CharacterUpdateRequest,
    CharacterUpdateResponse,
    ShotAsset,
    ShotUpdateRequest,
    ShotUpdateResponse,
)
from ..session_store import SessionStore, session_store


class SessionUpdateService:
    def __init__(self, store: SessionStore | None = None) -> None:
        self.store = store or session_store

    def _infer_characters_in_text(self, text: str, session) -> list[str]:
        """Lightweight name matching to populate characters_in_shot for new shots."""

        lowered = text.lower()
        names: list[str] = []
        for character in session.characters:
            if character.name.lower() in lowered:
                names.append(character.name)
        return names

    def _renumber_shots_with_mapping(self, shots_with_flags: list[dict]) -> tuple[list[Shot], dict[int, int]]:
        """Renumber shots sequentially and return a mapping from old->new numbers for existing shots."""

        mapping: dict[int, int] = {}
        renumbered: list[Shot] = []
        for idx, entry in enumerate(shots_with_flags, start=1):
            shot = entry["shot"]
            renumbered.append(
                Shot(
                    shot_number=idx,
                    shot_description=shot.shot_description,
                    characters_in_shot=shot.characters_in_shot,
                )
            )
            if not entry.get("is_new"):
                mapping[shot.shot_number] = idx
        return renumbered, mapping

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
        shots_with_flags: list[dict] = [{"shot": s, "is_new": False} for s in scene.shots]
        shot_idx = next((i for i, s in enumerate(scene.shots) if s.shot_number == payload.shot_number), None)

        if shot_idx is not None and not payload.insert_before:
            previous = scene.shots[shot_idx]
            inferred_characters = previous.characters_in_shot or self._infer_characters_in_text(
                payload.shot_description, session
            )
            shots_with_flags[shot_idx] = {
                "shot": Shot(
                    shot_number=previous.shot_number,
                    shot_description=payload.shot_description,
                    characters_in_shot=inferred_characters,
                ),
                "is_new": False,
            }
            # Clear stale generated asset for this shot if prompt changed
            if payload.shot_description.strip() != previous.shot_description.strip():
                key = f"{payload.scene_number}:{payload.shot_number}"
                session.shot_assets.pop(key, None)
        else:
            insert_pos = max(0, min(len(shots_with_flags), payload.shot_number - 1))
            inferred_characters = self._infer_characters_in_text(payload.shot_description, session)
            shots_with_flags.insert(
                insert_pos,
                {
                    "shot": Shot(
                        shot_number=payload.shot_number,
                        shot_description=payload.shot_description,
                        characters_in_shot=inferred_characters,
                    ),
                    "is_new": True,
                },
            )

        renumbered_shots, mapping = self._renumber_shots_with_mapping(shots_with_flags)

        # Re-key shot assets for this scene to follow any renumbering
        new_shot_assets = {}
        for key, asset in session.shot_assets.items():
            try:
                scene_str, shot_str = key.split(":", maxsplit=1)
                scene_key = int(scene_str)
                shot_key = int(shot_str)
            except ValueError:
                continue
            if scene_key != payload.scene_number:
                new_shot_assets[key] = asset
                continue

            new_shot_number = mapping.get(shot_key)
            if new_shot_number is None:
                # Asset removed because the shot was deleted or replaced
                continue
            updated_asset = ShotAsset(
                scene_number=asset.scene_number,
                shot_number=new_shot_number,
                shot_description=asset.shot_description,
                characters_in_shot=asset.characters_in_shot,
                image_url=asset.image_url,
                seed=asset.seed,
                structured_prompt=asset.structured_prompt,
                raw_structured_prompt=asset.raw_structured_prompt,
            )
            new_key = f"{scene_key}:{new_shot_number}"
            new_shot_assets[new_key] = updated_asset

        session.shot_assets = new_shot_assets
        session.scenes[scene_idx] = Scene(
            scene_number=scene.scene_number,
            scene_title=scene.scene_title,
            shots=renumbered_shots,
        )
        self.store.update_session(session)
        return ShotUpdateResponse(
            session_id=session.session_id,
            scenes=session.scenes,
            shot_assets=list(session.shot_assets.values()) or None,
        )
