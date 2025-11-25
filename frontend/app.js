const state = {
  sessionId: null,
  style: "realistic",
  script: "",
  characters: [],
  scenes: [],
  characterAssets: [],
  shots: [],
};

const els = {
  backendUrl: document.getElementById("backend-url"),
  pingButton: document.getElementById("ping-backend"),
  health: document.getElementById("health-status"),
  scriptForm: document.getElementById("script-form"),
  scriptInput: document.getElementById("script-input"),
  styleSelect: document.getElementById("style-select"),
  ingestBtn: document.getElementById("ingest-btn"),
  sessionPill: document.getElementById("session-pill"),
  characterList: document.getElementById("character-list"),
  generateCharacters: document.getElementById("generate-characters"),
  sceneList: document.getElementById("scene-list"),
  generateShots: document.getElementById("generate-shots"),
  shotGrid: document.getElementById("shot-grid"),
  toast: document.getElementById("toast"),
};

const setToast = (message, tone = "info") => {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.className = `toast ${tone}`;
  setTimeout(() => {
    els.toast.classList.add("hidden");
  }, 2600);
  requestAnimationFrame(() => els.toast.classList.remove("hidden"));
};

const backendBase = () => els.backendUrl.value.replace(/\/$/, "");

const asJson = async (res) => {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed with status ${res.status}`);
  }
  return res.json();
};

const postJson = (path, body) =>
  fetch(`${backendBase()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(asJson);

const setSession = (sessionId) => {
  state.sessionId = sessionId;
  els.sessionPill.textContent = sessionId ? `Session: ${sessionId}` : "No session yet";
  els.generateCharacters.disabled = !sessionId;
  els.generateShots.disabled = !sessionId;
};

const renderCharacters = () => {
  const container = els.characterList;
  if (!state.characters.length) {
    container.innerHTML = `<p class="muted">Run script ingestion to see characters.</p>`;
    container.classList.add("empty-state");
    return;
  }
  container.classList.remove("empty-state");
  const assetMap = new Map(state.characterAssets.map((c) => [c.name, c]));
  container.innerHTML = state.characters
    .map((c) => {
      const asset = assetMap.get(c.name);
      const imgBlock = asset
        ? `<div class="image-frame"><img src="${asset.image_url}" alt="${c.name}" /></div>`
        : `<div class="image-frame"><span class="muted small">No image yet</span></div>`;
      const description = c.character_description || asset?.description || "No description";
      const seedBadge = asset ? `<span class="badge">seed ${asset.seed}</span>` : "";
      return `<article class="card">
        ${imgBlock}
        <div class="stack">
          <div class="actions" style="justify-content: space-between;">
            <h3>${c.name}</h3>
            ${seedBadge}
          </div>
          <textarea class="char-edit" data-name="${c.name}" placeholder="Character prompt">${description}</textarea>
          <div class="actions" style="justify-content: flex-end;">
            <button class="ghost character-save" type="button" data-name="${c.name}">Save Prompt</button>
          </div>
        </div>
      </article>`;
    })
    .join("");
};

const renderScenes = () => {
  const container = els.sceneList;
  if (!state.scenes.length) {
    container.innerHTML = `<p class="muted">Ingest a script to see scenes and shots.</p>`;
    container.classList.add("empty-state");
    return;
  }
  container.classList.remove("empty-state");
  container.innerHTML = state.scenes
    .map(
      (scene) => `<div class="card">
        <div class="actions" style="justify-content: space-between;">
          <div>
            <p class="eyebrow">Scene ${scene.scene_number}</p>
            <h3>${scene.scene_title}</h3>
          </div>
          <span class="badge">${scene.shots.length} shots</span>
        </div>
        <div class="stack">
          ${scene.shots
            .map(
              (shot) => `<div class="stack">
                <div class="actions" style="justify-content: space-between;">
                  <strong>Shot ${shot.shot_number}</strong>
                  <div class="tag-row">
                    ${shot.characters_in_shot.map((ch) => `<span class="tag">${ch}</span>`).join("")}
                  </div>
                </div>
                <textarea class="shot-edit" data-scene="${scene.scene_number}" data-shot="${shot.shot_number}" placeholder="Shot description">${shot.shot_description}</textarea>
                <div class="actions" style="justify-content: flex-end;">
                  <button class="ghost shot-save" type="button" data-scene="${scene.scene_number}" data-shot="${shot.shot_number}">Save Shot Prompt</button>
                </div>
              </div>`
            )
            .join("")}
        </div>
      </div>`
    )
    .join("");
};

const renderShots = () => {
  const container = els.shotGrid;
  if (!state.scenes.length) {
    container.innerHTML = `<p class="muted">Generate shots to see the storyboard.</p>`;
    container.classList.add("empty-state");
    return;
  }
  container.classList.remove("empty-state");

  const shotMap = new Map(state.shots.map((s) => [`${s.scene_number}-${s.shot_number}`, s]));
  container.innerHTML = state.scenes
    .flatMap((scene) =>
      scene.shots.map((shot) => {
        const asset = shotMap.get(`${scene.scene_number}-${shot.shot_number}`);
        const imgBlock = asset
          ? `<div class="image-frame"><img src="${asset.image_url}" alt="Scene ${scene.scene_number} shot ${shot.shot_number}"/></div>`
          : `<div class="image-frame"><span class="muted small">Not generated yet</span></div>`;
        const description = asset?.shot_description || shot.shot_description;
        const characters = asset?.characters_in_shot || shot.characters_in_shot || [];
        const seedBadge = asset ? `<span class="badge">seed ${asset.seed}</span>` : "";
        const promptSnippet = asset?.raw_structured_prompt
          ? `<details class="small muted"><summary>JSON prompt</summary><pre class="small muted" style="white-space: pre-wrap;">${asset.raw_structured_prompt}</pre></details>`
          : "";
        return `<article class="card" data-scene="${scene.scene_number}" data-shot="${shot.shot_number}">
          <div class="actions" style="justify-content: space-between;">
            <div>
              <p class="eyebrow">Scene ${scene.scene_number}</p>
              <h3>Shot ${shot.shot_number}</h3>
            </div>
            ${seedBadge}
          </div>
          ${imgBlock}
          <p class="muted small">${description}</p>
          <div class="tag-row">
            ${characters.map((ch) => `<span class="tag">${ch}</span>`).join("")}
          </div>
          ${promptSnippet}
          <div class="editor">
            <textarea placeholder="Describe the change. The agent will refine or regenerate automatically." class="edit-text"></textarea>
            <button class="ghost edit-btn" type="button" data-scene="${scene.scene_number}" data-shot="${shot.shot_number}">Send Edit</button>
          </div>
        </article>`;
      })
    )
    .join("");
};

const setLoading = (el, loading, label) => {
  if (!el) return;
  if (loading) {
    el.dataset.restore = el.textContent;
    if (label) el.textContent = label;
  } else if (el.dataset.restore) {
    el.textContent = label || el.dataset.restore;
    delete el.dataset.restore;
  }
  el.disabled = loading;
};

els.pingButton.addEventListener("click", async () => {
  els.health.textContent = "checking...";
  try {
    const res = await fetch(`${backendBase()}/health`);
    const json = await asJson(res);
    const parts = [json.status, json.environment].filter(Boolean).join(" · ");
    els.health.textContent = parts || "ok";
    els.health.classList.remove("pill-muted");
    setToast("Backend reachable");
  } catch (err) {
    els.health.textContent = "offline";
    els.health.classList.add("pill-muted");
    setToast(err.message || "Ping failed", "error");
  }
});

els.scriptForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const script = els.scriptInput.value.trim();
  const style = els.styleSelect.value;
  if (!script) {
    setToast("Please paste a script first.", "error");
    return;
  }
  setLoading(els.ingestBtn, true, "Ingesting...");
  try {
    const data = await postJson("/script", { script, style });
    state.script = data.script;
    state.style = data.style;
    state.characters = data.characters || [];
    state.scenes = data.scenes || [];
    state.characterAssets = [];
    state.shots = [];
    setSession(data.session_id);
    renderCharacters();
    renderScenes();
    renderShots();
    setToast("Script ingested. Ready to generate.");
  } catch (err) {
    setToast(err.message || "Failed to ingest script", "error");
  } finally {
    setLoading(els.ingestBtn, false, "Ingest Script");
  }
});

els.generateCharacters.addEventListener("click", async () => {
  if (!state.sessionId) {
    setToast("Create a session first.", "error");
    return;
  }
  setLoading(els.generateCharacters, true, "Generating...");
  try {
    const data = await postJson("/characters/generate", { session_id: state.sessionId });
    state.characterAssets = data.characters || [];
    renderCharacters();
    setToast("Characters generated.");
  } catch (err) {
    setToast(err.message || "Failed to generate characters", "error");
  } finally {
    setLoading(els.generateCharacters, false);
    els.generateCharacters.textContent = "Generate Characters";
  }
});

els.generateShots.addEventListener("click", async () => {
  if (!state.sessionId) {
    setToast("Create a session first.", "error");
    return;
  }
  setLoading(els.generateShots, true, "Generating...");
  try {
    const data = await postJson("/shots/generate", { session_id: state.sessionId });
    state.shots = data.shots || [];
    renderShots();
    setToast("Shots generated.");
  } catch (err) {
    setToast(err.message || "Failed to generate shots", "error");
  } finally {
    setLoading(els.generateShots, false);
    els.generateShots.textContent = "Generate Shots";
  }
});

els.characterList.addEventListener("click", async (e) => {
  const btn = e.target.closest(".character-save");
  if (!btn) return;
  const name = btn.dataset.name;
  const card = btn.closest(".card");
  const textarea = card.querySelector(".char-edit");
  const character_description = textarea.value.trim();
  if (!character_description) {
    setToast("Character prompt cannot be empty.", "error");
    return;
  }
  btn.disabled = true;
  btn.textContent = "Saving...";
  try {
    const data = await postJson("/characters/update", {
      session_id: state.sessionId,
      name,
      character_description,
    });
    state.characters = data.characters || state.characters;
    // Drop cached asset for this character to avoid stale image
    state.characterAssets = state.characterAssets.filter((c) => c.name !== name);
    renderCharacters();
    renderShots();
    setToast(`Saved prompt for ${name}. Regenerate to see changes.`);
  } catch (err) {
    setToast(err.message || "Failed to save character prompt", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Save Prompt";
  }
});

els.sceneList.addEventListener("click", async (e) => {
  const btn = e.target.closest(".shot-save");
  if (!btn) return;
  const { scene, shot } = btn.dataset;
  const container = btn.closest(".stack");
  const textarea = container.querySelector(".shot-edit");
  const shot_description = textarea.value.trim();
  if (!shot_description) {
    setToast("Shot prompt cannot be empty.", "error");
    return;
  }
  btn.disabled = true;
  btn.textContent = "Saving...";
  try {
    const data = await postJson("/shots/update", {
      session_id: state.sessionId,
      scene_number: Number(scene),
      shot_number: Number(shot),
      shot_description,
    });
    state.scenes = data.scenes || state.scenes;
    // Remove stale generated asset for this shot
    state.shots = state.shots.filter(
      (s) => !(s.scene_number === Number(scene) && s.shot_number === Number(shot))
    );
    renderScenes();
    renderShots();
    setToast(`Saved prompt for scene ${scene}, shot ${shot}. Regenerate shots to see changes.`);
  } catch (err) {
    setToast(err.message || "Failed to save shot prompt", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Save Shot Prompt";
  }
});

els.shotGrid.addEventListener("click", async (e) => {
  const btn = e.target.closest(".edit-btn");
  if (!btn) return;
  const { scene, shot } = btn.dataset;
  const card = btn.closest(".card");
  const textArea = card.querySelector(".edit-text");
  const userRequest = textArea.value.trim();
  if (!userRequest) {
    setToast("Add an edit request first.", "error");
    return;
  }
  btn.disabled = true;
  btn.textContent = "Sending...";
  try {
    const data = await postJson("/shots/edit", {
      session_id: state.sessionId,
      scene_number: Number(scene),
      shot_number: Number(shot),
      user_request: userRequest,
    });
    // Update shot asset in place so the grid stays in sync.
    state.shots = state.shots.filter(
      (s) => !(s.scene_number === data.shot.scene_number && s.shot_number === data.shot.shot_number)
    );
    state.shots.push(data.shot);
    renderShots();
    setToast(`Shot ${shot} updated (${data.decision}).`);
  } catch (err) {
    setToast(err.message || "Edit failed", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Send Edit";
  }
});

// Initial render
renderCharacters();
renderScenes();
renderShots();
