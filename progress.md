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
- **Completed:** Character flow now uses current textarea prompts without extra saves, supports per-character regenerate with edit/cancel toggles, and bulk generation syncs prompts first; character generation runs in parallel via ThreadPoolExecutor (backend/services/character_generation.py, frontend/app.js).
- **Completed:** Added single-shot generation endpoint for per-shot regeneration and sequential display, hid the old scenes panel, and ensured edited shot prompts are used for bulk/per-shot generation; character images render in portrait frames (backend/app.py, backend/schemas.py, backend/services/shot_generation.py, frontend/app.js, frontend/styles.css).
- **Completed:** Layout tweaks: wider app shell (1440px), character grid forced to 4-per-row with tighter spacing, and shot grid set to 3 larger cards per row with taller frames (frontend/styles.css, frontend/index.html).

## 2025-11-24 (agent refine UX)

- **Completed:** Shot agent edits now update the shot prompt text area with the agent-modified description, persist it in session scenes, and lock further agent requests/edits for that shot after sending. The refine modal auto-closes on send success.
- **Completed:** Refine modal now closes immediately on send; shot clicks are temporarily blocked only while the agent call is in flight, then re-enabled once the new image arrives. Prompts refresh with the agent-modified text.
- **Completed:** Added a safe fallback in shot agent parsing—if the model returns non-JSON, we default to regenerate with the user edit appended instead of failing. Prevents 502s from off-schema LLM output.
- **Needs Testing:** Run a script → generate shots → click a shot image → submit an agent edit. Confirm the modal closes right after send, the textarea updates to the new description, the shot re-renders, and you can open refine again after the response (but not while the request is in flight). Also verify /shots/edit no longer returns 502 on malformed agent output.

## 2025-11-25 (style & cinematic prompts)

- **Completed:** Strengthened style definitions: outline = pure black-and-white line storyboard (no color/gray), anime = 2D flat cel shading (no 3D), 3D = Pixar-like stylized, realistic unchanged. Character prompts now force pure white background.
- **Completed:** Shot prompts now encourage explicit cinematic framing (camera angles, intentional composition) to reduce flat shots.
- **Needs Testing:** Regenerate characters in each style to confirm backgrounds stay white and style matches the new definitions. Regenerate shots to confirm more cinematic framing language is reflected.

## 2025-11-25 (character backgrounds/styles tuning)

- **Completed:** Strengthened character prompts to hard-enforce pure white backgrounds across all styles; outline now explicitly ignores all color terms and renders black ink line art only (no gray, no fills). Other styles keep pure white studio backdrops with no environment unless asked.
- **Needs Testing:** Regenerate characters in anime/3d/realistic/outline to confirm white backgrounds; outline should be strictly black-and-white line art with no gray or color.

## 2025-11-26 (character generation timeout handling)

- **Completed:** Added timeout and clearer error handling for Bria character generation; 504/HTTP errors now surface as 502 to the client instead of crashing the server.
- **Needs Testing:** Retry character generation when Bria returns 504/timeout; ensure the API responds with a usable 502 error message instead of a 500 stack trace.

## 2025-11-27 (UX style picker)

- **Completed:** Replaced the Step 1 style dropdown with visual thumbnail selectors (realistic, outline, 3D, anime) backed by example images; selection state syncs with ingest submissions.
- **Needs Testing:** Open the frontend (served from `frontend/`) and confirm the thumbnail picker highlights the chosen style, sends it to `/script`, and works across reloads.

## 2025-11-28 (storyboard shot insertion UX)

- **Completed:** Backend `/shots/update` now supports inserting new shots at any position, renumbers existing shots safely (including rekeyed shot assets), and infers characters from descriptions when missing. Shot edits can now generate a first image when no asset exists by combining the shot text with the user request.
- **Completed:** Storyboard grid renders per-scene blocks with `+` adders before/between/after shots. New shots start empty with placeholders, sync back to the session, and keep existing generated shots intact after renumbering. Single/bulk generation and "Ask AI" are blocked until a shot description is provided, with state sync for renumbered assets.
- **Needs Testing:** Ingest a script and confirm the initial shots render. Add shots at the start/middle/end, then generate via manual prompt and via "Ask AI" when no asset exists. Verify existing generated shots keep their images/seeds after inserting new shots and that bulk generate refuses empty prompts.
- **Next:** Persist session/prompt state across reloads and add dedicated character refine/regenerate controls in the UI.

## 2025-12-01 (debug fixture)

- **Completed:** Added a debug-only `/debug/load_fixture` endpoint that loads a canned script/characters/scenes without calling the LLM, plus a “Load demo prompts” button in the frontend to trigger it.
- **Needs Testing:** Click “Load demo prompts,” then generate characters/shots and run agent edits to ensure the shortcut session behaves the same as a freshly ingested one.
- **Next:** Remove or replace with selectable fixtures once debugging is done.

## 2025-12-01 (shot agent tags)

- **Completed:** Agent-generated shots created from empty cards now persist inferred characters into the session and UI, so character tags (e.g., Dorothy Gale) display after using “Ask AI” to add a character.
- **Needs Testing:** Add a new empty shot, ask the agent to add a main character, and confirm the character tag renders on the card.
