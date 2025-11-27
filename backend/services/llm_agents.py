"""Wrappers around LLM calls for project-specific agents."""

from __future__ import annotations

import json
import re
from typing import List, Any

from openai import OpenAI

from ..agent_prompts import character_cast_agent_prompt, script_agent_prompt, shot_agent_prompt
from ..agent_structured_outputs import (
    CharacterCastAgentOutput,
    CharacterInfo,
    ScriptAgentOutput,
    ShotAgentDecision,
)
from ..settings import get_settings


def _get_client() -> OpenAI:
    settings = get_settings()
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured")
    return OpenAI(api_key=settings.openai_api_key)


def _extract_output_text(resp: Any) -> str:
    # Prefer the convenience property if present
    if hasattr(resp, "output_text") and resp.output_text:
        return resp.output_text

    # Fallback: scan output array for message content with output_text entries
    output = getattr(resp, "output", None) or []
    for item in output:
        if item.get("type") == "message":
            for content in item.get("content", []):
                if content.get("type") == "output_text":
                    return content.get("text", "")
    return ""


def _call_llm(system_prompt: str, user_prompt: str, *, force_json: bool = True) -> str:
    settings = get_settings()
    client = _get_client()
    response_format = {"type": "json_object"} if force_json else None
    kwargs = {
        "model": settings.openai_model,
        "input": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }
    if response_format:
        kwargs["response_format"] = response_format
    try:
        response = client.responses.create(**kwargs)
    except TypeError:
        # Fallback for older openai SDK versions that don't support response_format
        kwargs.pop("response_format", None)
        response = client.responses.create(**kwargs)
    return _extract_output_text(response)


def _extract_json_block(text: str) -> str:
    text = text.strip()
    if text.startswith("{") or text.startswith("["):
        return text
    match = re.search(r"(\{.*\}|\[.*\])", text, flags=re.DOTALL)
    if match:
        return match.group(1)
    return text


def run_character_cast_agent(script: str) -> CharacterCastAgentOutput:
    schema = json.dumps(CharacterCastAgentOutput.model_json_schema(), indent=2)
    user_prompt = (
        "Read the following script and respond ONLY with valid JSON conforming to the schema.\n"
        f"Schema:\n{schema}\n\n"
        f"Script:\n" + script.strip()
    )
    content = _call_llm(character_cast_agent_prompt.strip(), user_prompt, force_json=True)
    json_payload = _extract_json_block(content)
    try:
        return CharacterCastAgentOutput.model_validate_json(json_payload)
    except Exception as exc:  # pylint: disable=broad-except
        snippet = json_payload[:500] if isinstance(json_payload, str) else str(json_payload)[:500]
        raise RuntimeError(f"Unable to parse character agent output: {exc}. Raw: {snippet}") from exc


def run_script_agent(script: str, characters: List[CharacterInfo]) -> ScriptAgentOutput:
    schema = json.dumps(ScriptAgentOutput.model_json_schema(), indent=2)
    characters_json = json.dumps([c.model_dump() for c in characters], indent=2)
    user_prompt = (
        "Use the provided script and main characters to output scenes and shots as JSON.\n"
        f"Schema:\n{schema}\n\n"
        f"Characters:\n{characters_json}\n\n"
        f"Script:\n{script.strip()}"
    )
    content = _call_llm(script_agent_prompt.strip(), user_prompt, force_json=True)
    json_payload = _extract_json_block(content)
    try:
        return ScriptAgentOutput.model_validate_json(json_payload)
    except Exception as exc:  # pylint: disable=broad-except
        snippet = json_payload[:500] if isinstance(json_payload, str) else str(json_payload)[:500]
        raise RuntimeError(f"Unable to parse script agent output: {exc}. Raw: {snippet}") from exc


def run_shot_agent(
    *,
    shot_description: str,
    user_request: str,
    previous_structured_prompt: dict,
    seed: int,
    characters_in_shot: List[str],
) -> ShotAgentDecision:
    schema = json.dumps(ShotAgentDecision.model_json_schema(), indent=2)
    context = {
        "shot_description": shot_description,
        "seed": seed,
        "characters_in_shot": characters_in_shot,
        "previous_structured_prompt": previous_structured_prompt,
        "user_request": user_request,
    }
    user_prompt = (
        "Decide whether to refine or regenerate this shot. Respond ONLY with JSON matching the schema.\n"
        f"Schema:\n{schema}\n\n"
        f"Context:\n{json.dumps(context, indent=2)}"
    )
    content = _call_llm(shot_agent_prompt.strip(), user_prompt, force_json=True)
    json_payload = _extract_json_block(content)
    try:
        return ShotAgentDecision.model_validate_json(json_payload)
    except Exception as exc:  # pylint: disable=broad-except
        # Fallback: if the model drifts off-schema, default to regenerate with user request appended.
        snippet = json_payload[:500] if isinstance(json_payload, str) else str(json_payload)[:500]
        fallback_desc = f"{shot_description}\nEdit: {user_request}".strip()
        return ShotAgentDecision(
            action="generate",
            shot_description=fallback_desc,
            edit_prompt=None,
            use_reference_images=True,
        )
