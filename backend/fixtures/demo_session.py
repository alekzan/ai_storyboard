"""Debug fixture to skip LLM ingestion and preload a tiny session."""

from __future__ import annotations

from ..agent_structured_outputs import CharacterInfo, Scene, Shot


def demo_fixture(style: str = "realistic") -> dict:
    script = (
        "A restless wind swept across the flat Kansas prairie as young Dorothy Gale stepped out onto the worn "
        "wooden porch of the farmhouse, watching the fading sun cast long shadows over the endless fields that "
        "made the distant horizon feel both familiar and impossibly far away. The empty rooms behind her creaked "
        "softly with the shifting gusts, the windows trembling as the sky darkened shade by shade. Still, she "
        "lingered outside, gripping the railing as the wind tugged at her hair and a quiet unease settled in her "
        "chest, a sense that the ordinary world around her was subtly tilting. The camera held on her small "
        "silhouette against the vast prairie, catching that suspended moment before the storm announced itself."
    )

    characters = [
        CharacterInfo(
            name="Dorothy Gale",
            character_description=(
                "Neutral standing pose, upright with arms relaxed straight down at the sides. Realistic portrayal "
                "of a young rural girl: dark brown hair in two tidy braids tied with faded red ribbons, sun-kissed "
                "freckled skin with light prairie dust at the cheekbones, clear hazel eyes, unadorned natural face. "
                "Compact, slight silhouette with straight posture. Wardrobe: faded blue gingham pinafore dress over "
                "a simple white cotton blouse with short puffed sleeves, modest square neckline; worn scuffed brown "
                "canvas ankle boots and short hand-stitched socks visible above the boots. Clothing shows sun-faded "
                "fabric, visible mending patches at hems, and fine dust streaks consistent with farm life. Small, "
                "simple silver locket on a thin chain at the collar. Neutral, unsettled expression facing the "
                "horizon. Cinematic realistic lighting, static reference pose."
            ),
        )
    ]

    scenes = [
        Scene(
            scene_number=1,
            scene_title="Prairie Evening — The Calm Before the Storm",
            shots=[
                Shot(
                    shot_number=1,
                    shot_description=(
                        "Aerial wide oblique (drone-like) shot of a solitary wooden windmill on a vast Kansas rural "
                        "plain at late-afternoon golden hour. Camera angled slightly down and trailing, windmill "
                        "placed slightly off-center; long warm shadows stretch across tall dry prairie grass. "
                        "Foreground shows a dust-swept dirt road leading the eye toward a small weathered farmhouse "
                        "and a cluster of wind-bent trees in the midground. Background: endless rolling fields and a "
                        "sky with scattered cumulus clouds catching warm sunlight. Emphasize realistic cinematic "
                        "detail and texture (wood grain and rusted metal blades), gentle breeze animating the grasses, "
                        "warm color temperature, shallow atmospheric haze for depth, and high-resolution film-like "
                        "sharpness."
                    ),
                    characters_in_shot=["Dorothy Gale"],
                )
            ],
        )
    ]

    return {
        "script": script,
        "style": style or "realistic",
        "characters": characters,
        "scenes": scenes,
    }
