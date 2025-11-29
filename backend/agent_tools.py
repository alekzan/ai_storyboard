import os
import json
import requests
from dotenv import load_dotenv

load_dotenv()

# =========================
# Shared helpers
# =========================

BRIA_API_URL = "https://engine.prod.bria-api.com/v2/image/generate"
BRIA_API_TOKEN = os.getenv("BRIA_API_TOKEN")  # put this in your .env


def _bria_headers():
    if not BRIA_API_TOKEN:
        raise RuntimeError("BRIA_API_TOKEN is not set in environment")
    return {
        "Content-Type": "application/json",
        "api_token": BRIA_API_TOKEN,
    }


STYLE_MAP = {
    "outline": (
        "black and white storyboard frame, clean line art, zero color, zero gray shading, "
        "inked outlines only, simple shapes, high-contrast silhouettes, looks like a classic storyboard sketch"
    ),
    "realistic": (
        "highly realistic cinematic frame, natural lighting, realistic materials and skin, "
        "film still quality"
    ),
    "3d": (
        "high quality 3D animation still, soft stylized characters, detailed materials, "
        "Pixar-like cinematic render, gentle lighting"
    ),
    "anime": (
        "2D anime frame, flat cel shading, bold line art, simplified shapes, expressive faces, "
        "no 3D rendering, no heavy detail"
    ),
}


def build_storyboard_prompt(shot_description: str, style: str) -> str:
    style_key = style.lower().strip()
    style_desc = STYLE_MAP.get(style_key, STYLE_MAP["realistic"])

    prompt = (
        f"Storyboard frame for a film or series. Style: {style_desc}. "
        f"Single cinematic shot with intentional camera choice and framing (e.g., wide, close-up, over-the-shoulder, low angle, dutch tilt when fitting). "
        f"Include depth, lighting, and composition that feel like a film still. "
        f"No on-screen text or captions. "
        f"Scene to depict: {shot_description}"
    )
    return prompt


# =========================
# Character generation
# =========================

def build_character_prompt(character_description: str, style: str) -> str:
    """
    General prompt to design a character for the storyboard.
    White background, full or 3/4 body, same visual style as the shots.
    """
    style_key = style.lower().strip()
    style_desc = STYLE_MAP.get(style_key, STYLE_MAP["realistic"])

    # Style-specific constraints for characters
    if style_key == "outline":
        style_enforcement = (
            "Pure black ink line art on a flat white background. No color anywhere. No gray shading. "
            "No gradients, no tones. Ignore color words in the description—render as black line art only. "
            "No environment; leave the background fully white."
        )
    else:
        style_enforcement = (
            "Pure white seamless studio background only—no scene, no environment, no props unless explicitly requested. "
            "Do not add backgrounds or scenery. Subject is cleanly separated on white."
        )

    prompt = (
        f"Single character design for a storyboard. Style: {style_desc}. "
        f"{style_enforcement} "
        f"Full or three quarter body view. "
        f"No on-screen text. "
        f"Character should be clearly readable for use in multiple storyboard shots. "
        f"Character description: {character_description}"
    )
    return prompt


def generate_character(
    character_description: str,
    style: str = "realistic",
    aspect_ratio: str = "9:16",
):
    """
    Create an initial character image.

    Inputs:
      character_description: text from the LLM describing the character
      style: outline, realistic, 3d, anime
      aspect_ratio: default 9:16 for full body

    Returns:
      dict with image_url, seed, structured_prompt (dict), raw_structured_prompt (string)
    """
    prompt = build_character_prompt(character_description, style)

    payload = {
        "prompt": prompt,
        "sync": True,
        "aspect_ratio": aspect_ratio,
    }

    print("⏳ Generating character...")
    try:
        response = requests.post(BRIA_API_URL, json=payload, headers=_bria_headers(), timeout=60)
        response.raise_for_status()
    except requests.exceptions.RequestException as exc:  # includes timeouts and HTTP errors
        status = getattr(exc.response, "status_code", None)
        raise RuntimeError(f"Bria character generation failed (status={status}): {exc}") from exc

    data = response.json()["result"]
    image_url = data["image_url"]
    seed = data["seed"]
    structured_prompt_str = data["structured_prompt"]
    structured_prompt_dict = json.loads(structured_prompt_str)

    print("✅ Character generated")
    print("🖼️ Image URL:", image_url)
    print("🌱 Seed:", seed)

    return {
        "image_url": image_url,
        "seed": seed,
        "structured_prompt": structured_prompt_dict,
        "raw_structured_prompt": structured_prompt_str,
    }


def refine_character(
    edit_prompt: str,
    previous_structured_prompt,
    seed: int,
    aspect_ratio: str = "9:16",
):
    """
    Refine an existing character.

    Inputs:
      edit_prompt: what to change (for example, 'change jacket to red leather and add glasses')
      previous_structured_prompt: dict or JSON string
      seed: from the character you are editing

    Returns:
      dict with image_url, seed, structured_prompt (dict), raw_structured_prompt (string)
    """
    if isinstance(previous_structured_prompt, dict):
        structured_prompt_str = json.dumps(previous_structured_prompt)
    else:
        structured_prompt_str = previous_structured_prompt

    payload = {
        "prompt": edit_prompt,
        "structured_prompt": structured_prompt_str,
        "seed": seed,
        "sync": True,
        "aspect_ratio": aspect_ratio,
    }

    print("⏳ Refining character...")
    response = requests.post(BRIA_API_URL, json=payload, headers=_bria_headers())
    if response.status_code >= 400:
        try:
            detail = response.json()
        except Exception:  # pragma: no cover
            detail = response.text
        raise RuntimeError(f"Bria shot generation failed (status={response.status_code}): {detail}")
    response.raise_for_status()

    data = response.json()["result"]
    image_url = data["image_url"]
    new_seed = data["seed"]
    structured_prompt_str_new = data["structured_prompt"]
    structured_prompt_dict_new = json.loads(structured_prompt_str_new)

    print("✅ Character refinement generated")
    print("🖼️ New Image URL:", image_url)
    print("🌱 Seed:", new_seed)

    return {
        "image_url": image_url,
        "seed": new_seed,
        "structured_prompt": structured_prompt_dict_new,
        "raw_structured_prompt": structured_prompt_str_new,
    }


# =========================
# Shots using character reference images
# =========================

def generate_shot_with_refs(
    shot_description: str,
    style: str,
    reference_image_urls,
    aspect_ratio: str = "16:9",
):
    """
    Generate a storyboard shot using one or more character reference images.
    Bria docs say images <= 1 item, so we use only the first reference for now.

    Inputs:
      shot_description: moment of the story to depict
      style: outline, realistic, 3d, anime
      reference_image_urls: list of URLs of character images (we will use the first)
      aspect_ratio: default 16:9 for a shot

    Returns:
      dict with image_url, seed, structured_prompt (dict), raw_structured_prompt (string)
    """
    prompt = build_storyboard_prompt(shot_description, style)

    images = reference_image_urls or []
    if images:
        images = images[:1]  # API currently documents max 1

    payload = {
        "prompt": prompt,
        "sync": True,
        "aspect_ratio": aspect_ratio,
    }
    if images:
        payload["images"] = images

    print("⏳ Generating shot with character reference...")
    response = requests.post(BRIA_API_URL, json=payload, headers=_bria_headers())
    if response.status_code >= 400:
        try:
            detail = response.json()
        except Exception:  # pragma: no cover
            detail = response.text
        raise RuntimeError(f"Bria shot generation failed (status={response.status_code}): {detail}")

    data = response.json()["result"]
    image_url = data["image_url"]
    seed = data["seed"]
    structured_prompt_str = data["structured_prompt"]
    structured_prompt_dict = json.loads(structured_prompt_str)

    print("✅ Shot generated")
    print("🖼️ Image URL:", image_url)
    print("🌱 Seed:", seed)

    return {
        "image_url": image_url,
        "seed": seed,
        "structured_prompt": structured_prompt_dict,
        "raw_structured_prompt": structured_prompt_str,
    }


def refine_shot_with_refs(
    edit_prompt: str,
    previous_structured_prompt,
    seed: int,
    reference_image_urls=None,
    aspect_ratio: str = "16:9",
):
    """
    Refine an existing shot, optionally passing character reference images too.
    This is slightly experimental, since docs for refine do not explicitly mention images,
    but we include them as the same /image/generate endpoint accepts prompt + images.

    Inputs:
      edit_prompt: what to change in the shot
      previous_structured_prompt: dict or JSON string for the shot
      seed: seed from the shot you are editing
      reference_image_urls: optional list of character reference URLs (we use at most one)
      aspect_ratio: default 16:9

    Returns:
      dict with image_url, seed, structured_prompt (dict), raw_structured_prompt (string)
    """
    if isinstance(previous_structured_prompt, dict):
        structured_prompt_str = json.dumps(previous_structured_prompt)
    else:
        structured_prompt_str = previous_structured_prompt

    images = reference_image_urls or []
    if images:
        images = images[:1]

    payload = {
        "prompt": edit_prompt,
        "structured_prompt": structured_prompt_str,
        "seed": seed,
        "sync": True,
        "aspect_ratio": aspect_ratio,
    }
    if images:
        payload["images"] = images

    print("⏳ Refining shot with character reference...")
    response = requests.post(BRIA_API_URL, json=payload, headers=_bria_headers())
    if response.status_code >= 400:
        try:
            detail = response.json()
        except Exception:  # pragma: no cover
            detail = response.text
        raise RuntimeError(f"Bria shot refinement failed (status={response.status_code}): {detail}")

    data = response.json()["result"]
    image_url = data["image_url"]
    new_seed = data["seed"]
    structured_prompt_str_new = data["structured_prompt"]
    structured_prompt_dict_new = json.loads(structured_prompt_str_new)

    print("✅ Shot refinement generated")
    print("🖼️ New Image URL:", image_url)
    print("🌱 Seed:", new_seed)

    return {
        "image_url": image_url,
        "seed": new_seed,
        "structured_prompt": structured_prompt_dict_new,
        "raw_structured_prompt": structured_prompt_str_new,
    }
