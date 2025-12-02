"""API request/response schemas for the AI Storyboard Maker backend."""

from __future__ import annotations

from typing import Literal, List, Optional, Dict, Any
from pydantic import BaseModel, Field

from .agent_structured_outputs import CharacterInfo, Scene


class ScriptIngestionRequest(BaseModel):
    script: str = Field(..., description="User provided story or screenplay text.")
    style: Literal["outline", "realistic", "3d", "anime"] = Field(
        default="realistic", description="Visual style applied across the project."
    )


class ScriptIngestionResponse(BaseModel):
    session_id: str = Field(..., description="Identifier for subsequent refinement calls.")
    style: str
    script: str
    characters: List[CharacterInfo]
    scenes: List[Scene]


class CharacterAsset(BaseModel):
    name: str
    description: str
    image_url: str
    seed: int
    structured_prompt: Dict[str, Any]
    raw_structured_prompt: str


class CharacterGenerationRequest(BaseModel):
    session_id: str
    character_names: Optional[List[str]] = Field(
        default=None,
        description="Optional subset of character names to generate; defaults to all main cast.",
    )


class CharacterGenerationResponse(BaseModel):
    session_id: str
    characters: List[CharacterAsset]


class ShotAsset(BaseModel):
    scene_number: int
    shot_number: int
    shot_description: str
    characters_in_shot: List[str]
    image_url: str
    seed: int
    structured_prompt: Dict[str, Any]
    raw_structured_prompt: str


class ShotGenerationRequest(BaseModel):
    session_id: str
    scene_numbers: Optional[List[int]] = Field(
        default=None,
        description="Optional subset of scenes to process; defaults to all scenes in the session.",
    )


class ShotGenerationResponse(BaseModel):
    session_id: str
    shots: List[ShotAsset]


class SingleShotGenerationRequest(BaseModel):
    session_id: str
    scene_number: int
    shot_number: int


class SingleShotGenerationResponse(BaseModel):
    session_id: str
    shot: ShotAsset


class ShotRefineRequest(BaseModel):
    session_id: str
    scene_number: int
    shot_number: int
    edit_prompt: str = Field(..., description="What to change in the shot.")
    use_reference_images: bool = Field(
        default=False,
        description="Optionally pass character reference images to the refine call if identity drifted.",
    )


class ShotRefineResponse(BaseModel):
    session_id: str
    shot: ShotAsset


class ShotEditRequest(BaseModel):
    session_id: str
    scene_number: int
    shot_number: int
    user_request: str = Field(..., description="Freeform user request to change the shot.")


class ShotEditResponse(BaseModel):
    session_id: str
    decision: str
    shot: ShotAsset


class CharacterUpdateRequest(BaseModel):
    session_id: str
    name: str = Field(..., description="Character name to update.")
    character_description: str = Field(..., description="New description to use for generation/refine.")


class CharacterUpdateResponse(BaseModel):
    session_id: str
    characters: List[CharacterInfo]


class ShotUpdateRequest(BaseModel):
    session_id: str
    scene_number: int
    shot_number: int
    shot_description: str = Field(..., description="New shot description to use for generation/refine.")
    insert_before: bool = Field(
        default=False,
        description="If true and shot_number exists, insert a new shot before it instead of updating the existing shot.",
    )


class ShotUpdateResponse(BaseModel):
    session_id: str
    scenes: List[Scene]
    shot_assets: List[ShotAsset] | None = Field(
        default=None,
        description="Optional list of shot assets after the update; included when renumbering occurs.",
    )
