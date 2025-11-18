# Storyboard Image Generation Logic (Bria + LLM)

This document explains how the LLM should generate and refine characters and storyboard shots using Bria’s `/image/generate` endpoint.  
It describes all workflows: creating characters, refining them, generating shots, refining shots, and adding new characters.

---

## Core Concept

Every Bria image generation returns three key outputs:

- **image_url**
- **structured_prompt** (JSON)
- **seed**

When refining an image, always pass:

- **edit_prompt** (what changes)
- **previous_structured_prompt** (JSON from last version)
- **seed** (from last version)

This guarantees visual consistency.

---

# 1. Create a Character

### Function
`generate_character(character_description, style)`

### Required Inputs
- `character_description`  
- `style`: `outline`, `realistic`, `3d`, `anime`

### Behavior
- Generates a **9:16** character portrait  
- **White background**  
- Uses the selected style  
- Returns:
  - `image_url`
  - `structured_prompt`
  - `seed`

### Notes for the LLM
- Describe the character clearly.
- Always generate characters *before* generating shots.
- All later refinements will use this character as the base.

---

# 2. Refine a Character

### Function
`refine_character(edit_prompt, previous_structured_prompt, seed)`

### Required Inputs
- `edit_prompt`
- `previous_structured_prompt`
- `seed`

### Behavior
- Makes small updates while keeping identity the same.
- Returns:
  - new `image_url`
  - new `structured_prompt`
  - new `seed`

### Notes for the LLM
- Use this whenever the user wants to tweak a character's appearance.
- Never regenerate a character from scratch unless explicitly asked.

---

# 3. Create a Shot (No Characters)

### Function
`generate_shot_with_refs(shot_description, style, reference_image_urls=None)`

### Required Inputs
- `shot_description`
- `style`
- Leave `reference_image_urls=None`

### Behavior
- Generates a scene shot (typically **16:9**).
- Returns:
  - `image_url`
  - `structured_prompt`
  - `seed`

### Notes for the LLM
- Only use this when a shot has **no characters** or character identity does not matter.

---

# 4. Create a Shot **With Characters**

### Function
`generate_shot_with_refs(shot_description, style, reference_image_urls)`

### Required Inputs
- `shot_description`
- `style`
- `reference_image_urls`: list of URLs for all characters appearing in the shot

### Behavior
- Creates a storyboard shot that adheres to the character design.
- Returns:
  - `image_url`
  - `structured_prompt`
  - `seed`

### Notes for the LLM
- Always mention characters explicitly in the `shot_description`.
- Always pass character images to enforce identity.

---

# 5. Refine a Shot (Small Changes, Same Characters)

### Function
`refine_shot_with_refs(edit_prompt, previous_structured_prompt, seed, reference_image_urls=None)`

### Required Inputs
- `edit_prompt`
- `previous_structured_prompt`
- `seed`
- `reference_image_urls`  
  - Leave `None` unless character identity has drifted.

### Behavior
- Applies localized edits while keeping scene structure.
- Returns:
  - new `image_url`
  - new `structured_prompt`
  - new `seed`

### Notes for the LLM
- Use this for edits like:
  - adding/removing props  
  - changing lighting  
  - modifying background  
  - small adjustments  

- Usually **do not** pass character references for refinements—it works better.

---

# 6. Add New Characters to an Existing Shot

### **Do NOT use refine. Generate a new shot.**

### Function
`generate_shot_with_refs(shot_description, style, reference_image_urls)`

### Required Inputs
- `shot_description`:  
  - Must include all previous elements + new characters  
- `style`
- `reference_image_urls`:  
  - All characters appearing in the new shot (old + new)

### Behavior
- Generates a new shot from scratch with a new seed.
- Returns:
  - `image_url`
  - `structured_prompt`
  - `seed`

### Notes for the LLM
- When adding a new character:
  - Build a **complete** new shot description (include everything previously added).
  - Call `generate_shot_with_refs`, not `refine_shot_with_refs`.

---

# 7. Seed Handling

- Always pass the **same seed** when refining characters or shots.
- When regenerating shots to add characters, a new seed is okay because the updated `structured_prompt` encodes the scene.

---

# Summary for the LLM

- **Create characters** → `generate_character`  
- **Refine characters** → `refine_character`  
- **Create shot without characters** → `generate_shot_with_refs` (no refs)  
- **Create shot with characters** → `generate_shot_with_refs` (with refs)  
- **Refine shot** → `refine_shot_with_refs` (no refs unless identity drifts)  
- **Add characters to an existing shot** → Regenerate using `generate_shot_with_refs` with all character images

Use structured_prompt + seed for all edits.  
This ensures consistency and predictable refinement across the storyboard workflow.

