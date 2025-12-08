# AI Storyboard Maker

Turn any script into a production-ready storyboard with deterministic, JSON-driven image generation powered by Bria FIBO. This project was built for the FIBO Hackathon to showcase how structured control (camera, lighting, palette, composition) can accelerate real creative workflows without brittle prompt-crafting.

## What this app does
- Ingest a full script, detect main characters, and break the story into scenes and shots.
- Generate consistent character references with FIBO so faces/outfits stay stable across every shot.
- Create and refine shots using FIBO’s structured controls; you can edit descriptions directly or ask an AI agent to apply changes while preserving composition.
- Enforce a single visual style (realistic, outline, 3D, anime) across the whole board.
- Persist sessions so you can keep editing, insert new shots anywhere, and regenerate specific frames.

## Why it matters (FIBO fit)
- Structured, deterministic generation: we drive FIBO through JSON parameters instead of prompt guesswork, so camera angle, FOV, lighting, palette, and composition behave predictably.
- Disentangled controls: character generation and shot composition stay independent, which keeps identities stable while allowing creative framing changes.
- Production-friendly: you can add/insert shots mid-stream, refine with an agent, and regenerate without losing style/character consistency.

## User flow
1) Paste a script and pick a visual style.  
2) Click **Ingest Script**: GPT-5 parses characters, scenes, and shots with cinematic language.  
3) Generate character images (FIBO) for consistent identities.  
4) Generate shots (FIBO JSON). Insert new shots anytime.  
5) Refine: edit the text prompt or click an image and describe a change; the agent decides whether to refine or regenerate using the stored JSON + seed.  
6) Export/use the storyboard with consistent visuals end to end.

## Tech stack
- Frontend: Vanilla JS + HTML/CSS, served via Nginx.  
- Backend: FastAPI (Python), OpenAI GPT-5 for parsing/agent logic, Bria FIBO for image generation.  
- Infra: Ubuntu on DigitalOcean, systemd for uvicorn, Nginx reverse proxy, Let’s Encrypt TLS.  
- Domain: https://fibo.autoflujo.com (reverse-proxy to `/api`).

## Live usage notes
- To use server-side keys, enter `1` in both API key fields (OpenAI and Bria) and click **Save keys** before ingesting.  
- You can also supply your own keys in the UI; they’re kept client-side for the session only.  
- Sample script loader is available under “Script & Style”.

## Local development
Requirements: Python 3.12+, Node not required (vanilla JS).  

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # add your keys
uvicorn backend.app:app --reload --host 0.0.0.0 --port 8000
# open frontend/index.html in the browser (or serve statically)
```

Environment variables (`.env`):
- `OPENAI_API_KEY` – used when clients send `1` as the OpenAI key.
- `BRIA_API_TOKEN` – used when clients send `1` as the Bria key.
- `ENVIRONMENT` – e.g., `local` or `prod`.

## Deployment (current)
- Repo: `alekzan/ai_storyboard` (main).  
- Droplet: 64.23.197.176 with Nginx → uvicorn on :8000.  
- TLS: Let’s Encrypt via certbot for `fibo.autoflujo.com`.  
- Auto-deploy: systemd timer runs `/opt/ai_storyboard/deploy.sh` every minute to pull `origin/main`, install deps, and restart the service on changes.

## Hackathon highlights (for judges)
- Uses FIBO’s JSON-native controls to guarantee deterministic framing, lighting, and composition—no prompt roulette.  
- Real production fit: stable character identities + per-shot refinement + insertable shots without breaking style.  
- Agent-assisted edits: reads stored JSON + seeds to choose refine vs regenerate, keeping outputs consistent.  
- Flexible UX: pick style once, regenerate specific shots, or ask the agent to adjust only what’s needed.  
- Ready for teams: structured outputs, repeatable generations, and a clear separation between character identity and scene composition.

## Demo context
The video demo walks through end-to-end: ingest script → detect characters/scenes → generate characters with FIBO → generate/refine shots via FIBO JSON → insert shots → agent-driven edits for quick tweaks while preserving consistency.

## Security & keys
- Server keys live only in `/opt/ai_storyboard/.env` on the droplet (not in git).  
- Client-supplied keys stay in the browser for that session and are not persisted server-side.  
- “1” sentinel tells the backend to use the server’s .env keys.

## Status checks
- Health: `https://fibo.autoflujo.com/api/health`  
- Frontend: `https://fibo.autoflujo.com/`

## Contributing
Open a PR to `main`. Keep APIs stable, respect structured outputs, and avoid leaking secrets. Focus on production-ready UX, deterministic generation, and agent-guided refinements. 
