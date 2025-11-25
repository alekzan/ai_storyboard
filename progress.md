## 2024-05-29

- **Completed:** Initialized FastAPI backend (`backend/app.py`) with health endpoint, CORS, and shared settings loader. Added project dependencies (`requirements.txt`), backend package init, and `.env` loading within `agent_tools.py` plus centralized config helper.
- **Needs Testing:** Hit `/health` once the server is running to confirm environment reporting works. Manual smoke tests for the Bria tool wrappers still pending.
- **Next:** Implement roadmap step 2 — script ingestion endpoint plus storage scaffold so agents can run through the pipeline with real requests.

## 2024-05-30

- **Completed:** Added API contracts (`backend/schemas.py`), in-memory session store, OpenAI-powered agent wrappers, and a `/script` ingestion endpoint that orchestrates character + scene generation while persisting session state. Health probe now reports both BRIA and LLM config status.
- **Completed:** Implemented `/characters/generate` endpoint + service that loops through session characters, calls `generate_character`, and stores full asset metadata for future refinement flows.
- **Needs Testing:** Run `POST /script` followed by `POST /characters/generate` once OpenAI + BRIA creds are set to ensure both pipelines return structured data and sessions persist between calls.
- **Next:** Build shot generation endpoint (roadmap 2.3) that uses `generate_shot_with_refs` per scene/shot and stores seeds + structured prompts in the session.

## 2025-11-20

- **Completed:** Added `/shots/generate` endpoint and service to iterate session scenes/shots, gather character reference images, call `generate_shot_with_refs`, and persist shot assets (image_url, seed, structured_prompt) in session storage.
- **Completed:** Added `/shots/refine` endpoint to apply edit prompts against existing shots using `refine_shot_with_refs`, reusing stored structured_prompt and seed, with optional character references and session persistence.
- **Needs Testing:** Run `POST /script` → `POST /characters/generate` → `POST /shots/generate` → `POST /shots/refine` to confirm refinement works, respects stored seeds/prompts, optional reference flag, and updates shot assets in session.
- **Completed:** Implemented shot_agent-driven `/shots/edit` endpoint that decides regenerate vs refine based on user request, calls the appropriate Bria tool, and updates stored shot assets.
- **Needs Testing:** Run `POST /script` → `POST /characters/generate` → `POST /shots/generate` → `POST /shots/edit` (with a user request) to confirm agent decisions, ensure references are enforced when requested, and verify shot assets persist with updated seeds/prompts.
- **Completed:** Migrated all LLM calls to OpenAI Responses API with model `gpt-5-nano-2025-08-07`; fixed `shot_agent_prompt` import causing `/shots/edit` 500.
- **Next:** Start frontend integration (script input → characters → storyboard grid) or extend shot_agent logic for more granular regenerate cases; pick UI next if ready.

## 2025-11-20 (frontend)

- **Completed:** Added lightweight static frontend (`frontend/index.html`, `frontend/styles.css`, `frontend/app.js`) with a modern layout for the full flow: script/style ingestion, character cards, scene plan preview, storyboard grid, and inline shot edit requests wired to `/script`, `/characters/generate`, `/shots/generate`, and `/shots/edit`.
- **Needs Testing:** Run the backend locally, open `frontend/index.html`, and walk through the full flow with real creds. Verify CORS, that images render, shot edits refresh in place, and that toast messaging surfaces API errors.
- **Next:** Add character refine/regenerate controls in the UI, keep session state across reloads (localStorage), and consider packaging as a proper Next.js/React app if time allows.
- **Completed:** Hardened all LLM agents to force JSON responses via `response_format=json_object` and improved parse error reporting (backend/services/llm_agents.py) to prevent /shots/edit 502s when the model returns non-JSON text.
- **Completed:** Added backwards-compatible fallback for older OpenAI SDKs that do not support `response_format` to avoid ingest failures (backend/services/llm_agents.py).
- **Completed:** Added prompt-edit endpoints for characters and shots plus frontend UI to edit them; shot edits clear stale assets so storyboard grid stays in sync (backend/services/session_updates.py, backend/schemas.py, backend/app.py, frontend/app.js).
