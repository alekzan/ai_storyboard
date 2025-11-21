from pydantic import BaseModel, Field
from typing import List


#################################################
######## FOR character_cast_agent OUTPUT ########
#################################################
class CharacterInfo(BaseModel):
    name: str = Field(description="The character name as it appears in the story.")
    character_description: str = Field(
        description="A complete visual description of the character including appearance, clothing, silhouette, age, and anything needed to generate their image."
    )

class CharacterCastAgentOutput(BaseModel):
    """Return all main characters of the story."""
    characters: List[CharacterInfo] = Field(
        description="List of all MAIN characters with their full descriptions."
    )


#################################################
############ FOR script_agent OUTPUT ############
#################################################
class Shot(BaseModel):
    shot_number: int = Field(description="Sequential number of the shot.")
    shot_description: str = Field(
        description="A description of what visually happens in this single camera shot."
    )
    characters_in_shot: List[str] = Field(
        description="Names of characters appearing in this shot, exactly matching character_cast_agent output."
    )

class Scene(BaseModel):
    scene_number: int = Field(description="Sequential number of the scene.")
    scene_title: str = Field(description="Short title describing the purpose of the scene.")
    shots: List[Shot] = Field(description="List of shots belonging to this scene.")

class ScriptAgentOutput(BaseModel):
    """Return all scenes and their shots derived from the story."""
    scenes: List[Scene] = Field(description="Ordered list of scenes containing structured shots.")


#################################################
############### FOR shot_agent ##################
#################################################
class ShotAgentDecision(BaseModel):
    action: str = Field(description="Either 'refine' or 'generate'.")
    edit_prompt: str | None = Field(
        default=None,
        description="Required when action is 'refine'. Concise change description.",
    )
    shot_description: str | None = Field(
        default=None,
        description="Required when action is 'generate'. Full shot description incorporating changes.",
    )
    use_reference_images: bool | None = Field(
        default=None,
        description="If true, include character reference images in the chosen call.",
    )
