"""Wrappers around LLM calls for project-specific agents."""

from __future__ import annotations

import json
import re
from typing import List

from openai import OpenAI

from ..agent_prompts import character_cast_agent_prompt, script_agent_prompt
from ..agent_structured_outputs import (
    CharacterCastAgentOutput,
    CharacterInfo,
    ScriptAgentOutput,
)
from ..settings import get_settings


def _get_client() -> OpenAI:
    settings = get_settings()
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured")
    return OpenAI(api_key=settings.openai_api_key)


def _call_llm(system_prompt: str, user_prompt: str) -> str:
    settings = get_settings()
    client = _get_client()
    response = client.chat.completions.create(
        model=settings.openai_model,
        temperature=0.2,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )
    return response.choices[0].message.content or ""


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
    content = _call_llm(character_cast_agent_prompt.strip(), user_prompt)
    json_payload = _extract_json_block(content)
    try:
        return CharacterCastAgentOutput.model_validate_json(json_payload)
    except Exception as exc:  # pylint: disable=broad-except
        raise RuntimeError(f"Unable to parse character agent output: {exc}") from exc


def run_script_agent(script: str, characters: List[CharacterInfo]) -> ScriptAgentOutput:
    schema = json.dumps(ScriptAgentOutput.model_json_schema(), indent=2)
    characters_json = json.dumps([c.model_dump() for c in characters], indent=2)
    user_prompt = (
        "Use the provided script and main characters to output scenes and shots as JSON.\n"
        f"Schema:\n{schema}\n\n"
        f"Characters:\n{characters_json}\n\n"
        f"Script:\n{script.strip()}"
    )
    content = _call_llm(script_agent_prompt.strip(), user_prompt)
    json_payload = _extract_json_block(content)
    try:
        return ScriptAgentOutput.model_validate_json(json_payload)
    except Exception as exc:  # pylint: disable=broad-except
        raise RuntimeError(f"Unable to parse script agent output: {exc}") from exc
