# AGENTS.md — Agent Guidelines and Behaviors

This file defines how all AI agents in the Storyboard Maker project must behave.  
Each agent has one responsibility and must not violate role boundaries.

A progress log is maintained in **progress.md**, where we track:
- what was just completed from our **ROADMAP.md**
- what the human or AI must test  
- what the next step is  

All agents must read progress.md before working, to stay aligned with project status.

Also check **ROADMAP.md** to understand where we are at in the project and what are next steps.

## How AI Agents Should Work

### 1. Read project docs first

Before writing code, always read or make sure to understand:

* `docs/prd.md`
* `AGENTS.md` (this file)
* `docs/agent_instructions.md`
* `ROADMAP.md`
* `progress.md`
* Required files in `/backend/`

### 2. Follow the existing structure (unless proposing an improvement)

Repository layout:

/backend/  
    agent_prompts.py  
    agent_structured_outputs.py  
    agent_tools.py  

/docs/  
    prd.md  
    agent_instructions.md  

progress.md  
ROADMAP.md  
AGENTS.md  
.env (ignored)  

Notebooks in root:  
    bria_fibo_utilities.ipynb  
    llm_agents_tests.ipynb  

Agents may change the structure.

### 3. Keep consistency

* Match naming conventions already in the repo  
* Respect existing Pydantic schemas  
* Preserve JSON formats  
* Avoid breaking API signatures  
* Do not silently rewrite core components  

### 4. Update `progress.md`

Every time an AI agent completes a step, update:

* What was done  
* What needs human or AI to review  
* What is next  

This ensures smooth human and AI handoff.

### 5. Ask before major changes

Do not modify, without confirmation:

* FIBO tool interfaces  
* Structured output schemas  
* Core prompt structures  

### 6. Keep code clean

* Modular  
* Commented  
* Type safe  
* FastAPI friendly  
* No random dependencies  
* No hardcoded secrets  

### 7. Never print `.env` or leak keys

### 8. When unsure, propose options

If instructions conflict:

1. Identify the conflict  
2. Give two or three solutions  
3. Wait for approval  


## Git and GitHub Authentication

The agent does not manage credentials.  
Authentication is handled entirely by the local machine through SSH keys.

The agent may safely run Git commands (pull, commit, push) without providing any passwords or tokens, because the environment already contains:

- A configured Git user  
- SSH keys loaded into the ssh-agent  
- A GitHub remote using SSH  

The agent must not attempt to create or modify credentials.


## Summary

`AGENTS.md` defines how AI agents should collaborate in this repo.  
Follow the structure, keep code clean, update progress, and propose improvements clearly.  

Everything else: agents have full freedom to build and optimize the project.


