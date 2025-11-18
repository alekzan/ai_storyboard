# AI Storyboard Maker PRD

## 1. Overview

AI Storyboard Maker is a web application that turns a written story or script into a visually consistent storyboard.

The app:

* Takes a user’s story or script in plain text  
* Generates consistent main characters with reusable reference images  
* Breaks the story into scenes and camera shots with text descriptions  
* Creates storyboard frames with Bria FIBO (image plus JSON per frame)  
* Lets the user refine any character or shot using natural language  
* Keeps visual and narrative continuity across the whole project  
* Provides an intuitive UI for visual storytelling, shot editing, and scene management  

MVP scope is focused on a single session per user for a hackathon demo, without authentication or multi tenant persistence.

---

## 2. Goals and non goals

### Goals

* Turn a plain text script into a full storyboard: characters, scenes, shots  
* Guarantee visual consistency for main characters across all shots  
* Guarantee narrative continuity between scenes and shots  
* Provide simple controls to refine characters and shots with AI  
* Support four visual styles for the whole project: outline, realistic, 3D, anime  
* Keep the JSON from FIBO visible to the system, not intimidating for the user  
* Deliver a working MVP deployed on a DigitalOcean VPS

### Non goals

* Multi user account system or full SaaS billing  
* High scale infrastructure or complex permission model  
* Frame accurate film pre production tool  
* Support for many different aspect ratios beyond the core ones needed  
* Support for exporting to multiple formats beyond basic image and JSON exports

---

## 3. Target users and use cases

### Users

* Indie filmmakers and writers who want a fast previsualization  
* Agencies or creatives who need storyboard like assets for pitches  
* Content creators who want to visualize short scripts or scenes

### Core use cases

* Upload or paste a script, get a first storyboard pass with characters and shots  
* Tweak a character’s appearance and keep it consistent across all existing and future shots  
* Tweak a shot (camera, action, background elements) while maintaining continuity  
* Quickly explore alternative versions of a given shot or sequence

---

## 4. Core concepts

* Project: one storyboard project that contains a script, style, characters and scenes  
* Script: the original user text (story or screenplay)  
* Style: one of four visual styles, applied to all generated images for that project  

  * outline  
  * realistic  
  * 3d  
  * anime  

* Character: a main character with  

  * name (user facing)  
  * description (LLM facing)  
  * reference image url  
  * FIBO structured prompt (JSON)  
  * seed  

* Scene: logical narrative unit (location, time, main action)  
* Shot: single camera shot inside a scene, with  

  * shot description (text)  
  * characters in shot (references to main characters)  
  * FIBO image url  
  * FIBO structured prompt (JSON)  
  * seed  

---

## 5. AI models and tools

### FIBO: image and JSON generation

FIBO is the main image model. It returns an image plus a detailed structured_prompt (JSON) plus a seed. FIBO is used through four backend tools:

* `generate_character`  
  * Input: character description, style, fixed aspect ratio 9:16, white background  
  * Output: character image url, structured_prompt JSON, seed  
  * Use: create initial main characters

* `refine_character`  
  * Input: edit prompt, previous structured_prompt JSON, previous seed  
  * Output: new character image url, new structured_prompt JSON, seed (usually same)  
  * Use: modify a character while keeping identity and style

* `generate_shot_with_refs`  
  * Input: shot description, style, optional reference_image_urls list (main character images), aspect ratio (default 16:9)  
  * Output: shot image url, structured_prompt JSON, seed  
  * Behavior:  
    * If reference_image_urls is empty, FIBO generates the scene from description only  
    * If reference_image_urls has entries, backend passes the first url as reference image to keep character appearance

* `refine_shot_with_refs`  
  * Input: edit prompt, previous structured_prompt JSON, previous seed, optional reference_image_urls  
  * Output: new shot image, updated structured_prompt JSON, seed  
  * Typical usage:  
    * Small edit (background, props, mood) refine with previous JSON plus seed  
    * Larger change that breaks composition regenerate a fresh shot with `generate_shot_with_refs`  

### LLM: GPT 5

GPT 5 is used for all text reasoning and orchestration:

* Extract main characters from the script  
* Break script into scenes and shots  
* Produce camera oriented shot descriptions  
* Decide when to refine or regenerate characters or shots  
* Generate edit prompts for FIBO based on user requests  
* Maintain global continuity at the story level

For refinement, the user does not interact directly with FIBO tools. The agent decides which tool to call and how to construct the prompt and arguments.

---

## 6. AI agents

### Text only agents

* `character_cast_agent`  
  * Input: full script  
  * Output: `CharacterCastAgentOutput` (Pydantic)  
  * Role: detect only main characters, create compact descriptions suitable for image generation and continuity  

* `script_agent`  
  * Input: full script plus list of characters from `character_cast_agent`  
  * Output: `ScriptAgentOutput` (Pydantic)  
  * Role: split story into scenes and shots, assign characters to each shot, create visual shot descriptions

### FIBO aware agents

* `character_agent`  
  * Uses: `generate_character`, `refine_character`  
  * Role: keep visual continuity of characters across the project  
  * Decides when to refine vs regenerate based on requested changes

* `shot_agent`  
  * Uses: `generate_shot_with_refs`, `refine_shot_with_refs`  
  * Role: maintain shot continuity while applying user edits  
  * Decides when a shot can be refined versus when it must be regenerated from scratch

All agents use structured outputs, so the backend can trust the shape of the data and feed it directly into the UI or into FIBO tools.

---

## 7. Storyboard generation flow

High level logic from story to storyboard:

1. User pastes or uploads script and selects style (outline, realistic, 3d, anime)  
2. Backend calls  

   * `character_cast_agent` on the script  
   * `script_agent` with script plus character list  

3. Backend now has  

   * Canonical list of main characters  
   * Canonical list of scenes and shots with character assignments  

4. Character generation  

   * For each main character, call `generate_character` with character description and chosen style  
   * Store for each character  

     * name  
     * image url  
     * structured_prompt JSON  
     * seed  

5. Shot generation  

   * For each shot, build a shot prompt using style and shot description  
   * If one or more main characters appear in the shot, pass at least one relevant reference_image_url  
   * Call `generate_shot_with_refs` sequentially per scene  
   * Store per shot  

     * image url  
     * structured_prompt JSON  
     * seed  

6. UI rendering  

   * For each scene, show a grid of shots with  

     * image (or placeholder if not generated yet)  
     * short shot description  
     * tags with participating characters  

   * Provide text areas for  

     * AI generated shot description  
     * user notes or directions  

7. Editing flow  

   * When user edits a character  

     * UX sends edit request to backend  
     * `character_agent` decides refine vs regenerate  
     * Backend calls FIBO tool accordingly, updates stored JSON, seed and image url  
     * Future shots can use the updated character reference image  

   * When user edits a shot  

     * UX sends edit request to backend with free text request plus shot id  
     * `shot_agent` receives current structured_prompt JSON and seed  
     * Agent decides  

       * refine existing shot with `refine_shot_with_refs` (small changes)  
       * regenerate the shot with `generate_shot_with_refs` (large changes, new characters)  

---

## 8. Styles

Style is selected once per project and cached for all generations.


STYLE_MAP = {
    "outline": (
        "black and white storyboard frame, clean line art, minimal shading, "
        "simple shapes, clear silhouettes, like a classic storyboard sketch"
    ),
    "realistic": (
        "highly realistic cinematic frame, natural lighting, realistic materials and skin, "
        "film still quality"
    ),
    "3d": (
        "high quality 3D animation still, soft stylized characters, detailed materials, "
        "similar to Pixar style"
    ),
    "anime": (
        "anime style frame, clean line art, cel shaded colors, expressive faces, "
        "dynamic lighting"
    ),
}


# Backend Responsibilities for Style

- Store chosen style in project state  
- Inject style text into prompts for:
  - generate_character  
  - generate_shot_with_refs  
- Preserve style when calling all refinement tools  

---

# 9. UI Pages

## 1. Script Input Page
- Script text area  
- Style selector: outline, realistic, 3d, anime  
- On submit:
  - Run `character_cast_agent`  
  - Run `script_agent`  
  - Redirect to Characters Page  

## 2. Characters Page
- Display all main characters  
- Allow:
  - Regeneration  
  - Refinement  
- Store:
  - image_url  
  - structured JSON  
  - seed  

## 3. Storyboard Page
- Scene navigation  
- Shot grid (4–6 per screen)  
- Generate missing images  
- Refine or regenerate shot images  
- Add user notes / directions  

---

# 10. Data and Storage (MVP)

Use **in-memory storage** keyed by session ID.

Stored items:
- script  
- style  
- characters:  
  - image_url  
  - structured JSON  
  - seed  
- scenes + shots:  
  - shot descriptions  
  - images  
  - JSON  
  - seeds  

---

# 11. Important Files

### Backend (in `/backend/`)

#### `agent_prompts.py`
Contains prompts for:
- `character_cast_agent`
- `script_agent`
- `character_agent`
- `shot_agent`

#### `agent_structured_outputs.py`
Pydantic models for:
- `CharacterCastAgentOutput`
- `ScriptAgentOutput`
- (Optional) structured outputs for `character_agent` and `shot_agent`

#### `agent_tools.py`
Tools that wrap FIBO’s API:
- `generate_character`
- `refine_character`
- `generate_shot_with_refs`
- `refine_shot_with_refs`

---

### Notebooks (in project root)

- `bria_fibo_utilities.ipynb`  
  How to call and test FIBO tools

- `llm_agents_tests.ipynb`  
  How to call text-only agents (character_cast and script_agent)

---

### Documentation

- `progress.md`  
  What’s done, what needs testing, next step

- `ROADMAP.md`  
  Sequence of tasks required to build the MVP. Go step by step.


- `docs/agent_instructions.md`  
  Detailed explanation of all workflows for FIBO usage

- `.env`  
  Stores all required API keys (never publish or commit) but you may need to read it in order to use those keys for production.

---

# 12. System Architecture

- **Backend:** FastAPI  
- **Frontend:** Any modern JS framework  
- **Endpoints:**  
  - Script ingestion  
  - Character generation  
  - Shot generation  
  - Editing / refinement  

---

# 13. Deployment

- Deploy backend + frontend on a **DigitalOcean VPS**  
- Load configuration from `.env`  
- Use **Nginx** as a reverse proxy  
- Optional: enable HTTPS with Certbot  

---

# 14. Open Questions

- Should each page show **4 or 6 shots**?  
- Should we allow inserting shots mid-scene in the MVP?  
- How to display JSON safely without intimidating users?  
- How much temporary in-memory storage is safe for a hackathon demo?  

## Project Structure
```
/backend/
  agent_prompts.py
  agent_structured_outputs.py
  agent_tools.py

/docs/
  prd.md
  agent_instructions.md
  progress.md (empty)
  ROADMAP.md (high-level steps)
  AGENTS.md (roles of all agents)

.env (API keys, ignored)

Notebooks in project root:
  bria_fibo_utilities.ipynb (FIBO tools usage reference)
  llm_agents_tests.ipynb (text-only agent usage reference)
```