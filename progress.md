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
