"""Core orchestration for the script ingestion endpoint."""

from __future__ import annotations

from fastapi import HTTPException, status

from ..agent_structured_outputs import CharacterInfo, Scene
from ..schemas import ScriptIngestionResponse
from ..session_store import session_store, SessionStore
from .llm_agents import run_character_cast_agent, run_script_agent


class ScriptIngestionService:
    def __init__(self, store: SessionStore | None = None) -> None:
        self.store = store or session_store

    def ingest_script(self, *, script: str, style: str, openai_api_key: str | None = None) -> ScriptIngestionResponse:
        try:
            character_output = run_character_cast_agent(script, style, openai_api_key=openai_api_key)
        except RuntimeError as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Character agent failed: {exc}",
            ) from exc

        try:
            script_output = run_script_agent(script, character_output.characters, style, openai_api_key=openai_api_key)
        except RuntimeError as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Script agent failed: {exc}",
            ) from exc

        session = self.store.create_session(
            script=script,
            style=style,
            characters=character_output.characters,
            scenes=script_output.scenes,
        )

        return ScriptIngestionResponse(
            session_id=session.session_id,
            script=session.script,
            style=session.style,
            characters=session.characters,
            scenes=session.scenes,
        )
