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
- **Needs Testing:** Run `POST /script` → `POST /characters/generate` → `POST /shots/generate` to verify shots generate per scene, style propagates, reference enforcement raises clear errors when a character image is missing, and shot assets persist across requests.
- **Next:** Implement shot refinement/regeneration flow (shot_agent + `/shots/refine`), or begin frontend integration pages using the stored session assets.
