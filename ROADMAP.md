# AI Storyboard Maker — Development Roadmap

This roadmap outlines the sequence of tasks required to build the MVP.  
Each step must be completed before moving to the next.

---

## 1. Backend Foundations

### 1.1 Set up project structure
- Create FastAPI backend  
- Add `/backend/agent_prompts.py`, `/backend/agent_structured_outputs.py`, `/backend/agent_tools.py`  
- Load `.env` for API keys  

### 1.2 Implement FIBO tools
- `generate_character`  
- `refine_character`  
- `generate_shot_with_refs`  
- `refine_shot_with_refs`  
- Test with notebooks  

### 1.3 Implement text-only agents
- Create character_cast_agent  
- Create script_agent  
- Validate structured outputs  

---

## 2. Core AI Pipeline

### 2.1 Script ingestion endpoint
- Accept script + style  
- Run character_cast_agent  
- Run script_agent  
- Store results in session memory  

### 2.2 Character generation endpoint
- For each main character run `generate_character`  
- Store:
  - image_url  
  - seed  
  - structured_prompt JSON  

### 2.3 Shot generation endpoint
- For each scene + shot run `generate_shot_with_refs`  
- Pass reference_image_urls when characters are present  
- Store images + JSON + seeds  

---

## 3. Frontend (3 Pages)

### 3.1 Page 1 — Script Input
- Input area  
- Style selection  
- Submit to backend  
- Show spinner  
- Navigate to Characters page  

### 3.2 Page 2 — Characters
- Display each character with:
  - image  
  - description  
- Buttons:
  - Refine  
  - Regenerate  
- Integrate character_agent  

### 3.3 Page 3 — Storyboard
- Scene navigation list  
- Shot grid  
- Buttons:
  - Generate missing images  
  - Refine shot  
  - Regenerate shot  
- Integrate shot_agent  
- Allow adding user notes  

---

## 4. Refinement Flow Integration

### 4.1 Character refinement
- Hook character_agent to the refine_character and generate_character tools  

### 4.2 Shot refinement
- Hook shot_agent to refine_shot_with_refs and generate_shot_with_refs tools  
- Ensure correct use of reference_image_urls  

---

## 5. Session Storage Logic

### 5.1 Implement in-memory session store
- Script  
- Style  
- Characters (images, JSON, seeds)  
- Scenes  
- Shots (images, JSON, seeds)  

### 5.2 Optional: lightweight persistence
- JSON file or SQLite (if needed)  

---

## 6. Testing Phase

### 6.1 Validate tool usage with notebooks
- `llm_agents_tests.ipynb`  
- `bria_fibo_utilities.ipynb`  

### 6.2 Validate end-to-end:
- Script → Characters → Scenes → Shots → Refinements  

### 6.3 Stress test:
- Multiple refine loops  
- Adding a character to an existing scene  
- Style consistency  

---

## 7. Deployment

### 7.1 Backend deployment to DigitalOcean VPS
- Install Python environment  
- Deploy FastAPI  
- Set up Nginx reverse proxy  

### 7.2 Frontend deployment
- Build static files  
- Serve through Nginx or the backend  

### 7.3 Final testing on production environment

---

## 8. Final Demo Prep
- Prepare example scripts  
- Prepare sample outputs in various styles  
- Create quick actions for the hackathon demo  
- Verify refinement flow shows continuity  