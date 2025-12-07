const initialState = () => ({
  backendUrl: "http://localhost:8000",
  sessionId: null,
  style: "realistic",
  script: "",
  characters: [],
  scenes: [],
  characterAssets: [],
  shots: [],
  characterBaseline: {},
  shotBaseline: {},
  shotEditing: new Set(),
  charEditing: new Set(),
  editTarget: null,
  lockedEdits: new Set(), // legacy lock; no longer used for agent locking
  shotAgentPending: new Set(),
  charLoading: new Set(),
  shotLoading: new Set(),
  shotRefineLoading: new Set(),
  shotBulkGenerating: false,
  charErrors: {},
  briaToken: "",
  openaiToken: "",
});

const SAMPLE_SCRIPT = `A restless wind swept across the flat Kansas prairie as young Dorothy Gale stepped out onto the worn wooden porch of her aunt's farmhouse, Toto trotting at her heels with alert, curious eyes. The fading sun cast long shadows over the endless fields, making the distant horizon feel both familiar and impossibly far away. Inside, Aunt Em moved quietly through the kitchen, pausing now and then to glance at the trembling windowpanes as the gusts grew sharper by the minute. Yet Dorothy lingered outside, hugging Toto close as the wind tugged at her hair and something unspoken stirred in her chest, a sense that the ordinary world around her was shifting by the second. The camera stayed with her on that creaking porch, the calm before a storm none of them had yet named.`;

const state = initialState();

const CACHE_KEY = "storyboard-cache-v1";
let isHydrating = false;

const els = {
  scriptForm: document.getElementById("script-form"),
  scriptInput: document.getElementById("script-input"),
  keysWarning: document.getElementById("keys-warning"),
  styleOptions: document.getElementById("style-options"),
  ingestBtn: document.getElementById("ingest-btn"),
  ingestStatus: document.getElementById("ingest-status"),
  sessionPill: document.getElementById("session-pill"),
  resetSession: document.getElementById("reset-session"),
  briaTokenInput: document.getElementById("bria-token"),
  openaiTokenInput: document.getElementById("openai-token"),
  saveKeys: document.getElementById("save-keys"),
  apiKeysForm: document.getElementById("api-keys-form"),
  characterList: document.getElementById("character-list"),
  generateCharacters: document.getElementById("generate-characters"),
  sceneList: document.getElementById("scene-list"),
  generateShotsAll: document.getElementById("generate-shots-all"),
  shotGrid: document.getElementById("shot-grid"),
  toast: document.getElementById("toast"),
  editModal: document.getElementById("edit-modal-backdrop"),
  editModalLabel: document.getElementById("edit-modal-label"),
  editModalTitle: document.getElementById("edit-modal-title"),
  editModalText: document.getElementById("edit-modal-text"),
  editModalSend: document.getElementById("edit-modal-send"),
  editModalClose: document.getElementById("edit-modal-close"),
  lightboxBackdrop: document.getElementById("lightbox-backdrop"),
  lightboxImage: document.getElementById("lightbox-image"),
  lightboxClose: document.getElementById("lightbox-close"),
  loadSampleScript: document.getElementById("load-sample-script"),
};

const allCharactersReady = () => {
  if (!state.characters.length) return false;
  const readyCount = state.characterAssets.filter((c) => !!c.image_url).length;
  return readyCount >= state.characters.length;
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

const backendBase = () => state.backendUrl.replace(/\/$/, "");

const setStyle = (style) => {
  state.style = style;
  if (!els.styleOptions) return;
  els.styleOptions.querySelectorAll(".style-option").forEach((btn) => {
    const isActive = btn.dataset.style === style;
    btn.classList.toggle("selected", isActive);
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
};

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

const saveCache = () => {
  if (isHydrating) return;
  try {
    const payload = {
      backendUrl: state.backendUrl,
      sessionId: state.sessionId,
      style: state.style,
      script: state.script,
      characters: state.characters,
      scenes: state.scenes,
      characterAssets: state.characterAssets,
      shots: state.shots,
      // API keys are intentionally NOT cached
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch (e) {
    // ignore cache errors
  }
};

const updateIngestLock = () => {
  const keysReady = !!state.openaiToken && !!state.briaToken;
  if (els.scriptInput) {
    els.scriptInput.disabled = !keysReady;
  }
  if (els.keysWarning) {
    els.keysWarning.style.display = keysReady ? "none" : "block";
  }
  if (els.ingestBtn) {
    if (state.sessionId) {
      els.ingestBtn.disabled = true;
      els.ingestBtn.textContent = "Ingested";
    } else {
      els.ingestBtn.disabled = !keysReady;
      els.ingestBtn.textContent = keysReady ? "Ingest Script" : "Add API keys to ingest";
    }
  }
};

const loadCache = () => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    isHydrating = true;
    state.backendUrl = data.backendUrl || state.backendUrl;
    state.sessionId = data.sessionId || null;
    state.style = data.style || state.style;
    state.script = data.script || "";
    state.characters = data.characters || [];
    state.characterAssets = data.characterAssets || [];
    state.shots = data.shots || [];
    state.characterBaseline = Object.fromEntries(
      (state.characters || []).map((c) => [c.name, c.character_description])
    );
    if (els.scriptInput && state.script) {
      els.scriptInput.value = state.script;
    }
    setStyle(state.style);
    if (state.sessionId) setSession(state.sessionId);
    syncScenesState(data.scenes || [], data.shot_assets || data.shots || [], { forceEditingAll: true });
    renderCharacters();
    renderScenes();
    renderShots();
    updateIngestLock();
    return true;
  } catch (e) {
    return false;
  } finally {
    isHydrating = false;
  }
};

const setSession = (sessionId) => {
  state.sessionId = sessionId;
  els.sessionPill.textContent = sessionId ? `Session: ${sessionId}` : "No session yet";
  if (els.resetSession) {
    els.resetSession.style.display = sessionId ? "inline-flex" : "none";
  }
  if (els.loadSampleScript) {
    els.loadSampleScript.disabled = !!sessionId;
    els.loadSampleScript.title = sessionId ? "Reset session to load a new sample script." : "";
  }
  if (els.generateCharacters) els.generateCharacters.disabled = !sessionId;
  if (els.generateShotsAll) els.generateShotsAll.disabled = !sessionId || !allCharactersReady() || state.shotBulkGenerating;
  if (!sessionId && els.ingestStatus) els.ingestStatus.textContent = "";
  saveCache();
  updateIngestLock();
};

const syncScenesState = (scenes, shotAssets, { forceEditingAll = false } = {}) => {
  if (Array.isArray(shotAssets)) {
    state.shots = shotAssets;
  }
  state.scenes = scenes || [];
  state.shotBaseline = Object.fromEntries(
    state.scenes.flatMap((scene) =>
      scene.shots.map((shot) => [`${scene.scene_number}:${shot.shot_number}`, shot.shot_description])
    )
  );

  const validKeys = new Set();
  const assetKeys = new Set((state.shots || []).map((s) => `${s.scene_number}:${s.shot_number}`));
  state.scenes.forEach((scene) => {
    scene.shots.forEach((shot) => {
      const key = `${scene.scene_number}:${shot.shot_number}`;
      validKeys.add(key);
    });
  });

  // Prune transient state to existing shots only
  state.shotLoading = new Set([...state.shotLoading].filter((k) => validKeys.has(k)));
  state.shotRefineLoading = new Set([...state.shotRefineLoading].filter((k) => validKeys.has(k)));
  state.shotAgentPending = new Set([...state.shotAgentPending].filter((k) => validKeys.has(k)));

  const nextEditing = new Set();
  state.scenes.forEach((scene) => {
    scene.shots.forEach((shot) => {
      const key = `${scene.scene_number}:${shot.shot_number}`;
      if (forceEditingAll || !assetKeys.has(key) || state.shotEditing.has(key)) {
        nextEditing.add(key);
      }
    });
  });
  state.shotEditing = nextEditing;
  saveCache();
};

const applyShotUpdateResponse = (data, options) => {
  if (!data) return;
  if (data.scenes) {
    syncScenesState(data.scenes, data.shot_assets, options);
  } else if (Array.isArray(data.shot_assets)) {
    state.shots = data.shot_assets;
  }
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
      const loading = state.charLoading.has(c.name);
      const warn = state.charErrors?.[c.name];
      const isEditing = state.charEditing.has(c.name) || !asset;
      const imgBlock = loading
        ? `<div class="image-frame portrait loading"></div>`
        : asset
          ? `<div class="image-wrapper">
               <div class="image-frame portrait">
                 <img src="${asset.image_url}" alt="${c.name}" />
               </div>
               <div class="image-actions">
                 <a class="icon-btn download-btn" title="Download" href="${asset.image_url}" data-filename="${encodeURIComponent(
                   `${c.name}.png`
                 )}"><span class="glyph">⤓</span></a>
                 <button class="icon-btn maximize-char" title="View larger" data-name="${c.name}"><span class="glyph">⤢</span></button>
               </div>
             </div>`
          : `<div class="image-frame portrait">
               <span class="muted small">Not generated yet</span>
             </div>`;
      const description = c.character_description || asset?.description || "No description";
      const seedBadge = asset ? `<span class="badge">seed ${asset.seed}</span>` : "";
      const readOnlyAttr = loading ? "readonly" : isEditing ? "" : "readonly";
      const buttons = isEditing
        ? `<div class="actions" style="justify-content: flex-end; gap: 8px;">
             ${asset ? `<button class="ghost char-cancel" type="button" data-name="${c.name}" ${loading ? "disabled" : ""}>Cancel</button>` : ""}
             <button class="primary char-generate" type="button" data-name="${c.name}" ${loading ? "disabled" : ""}>${loading ? "Generating..." : "Generate this character"}</button>
           </div>`
        : `<div class="actions" style="justify-content: flex-end; gap: 8px;">
             <button class="ghost char-edit-toggle" type="button" data-name="${c.name}" ${loading ? "disabled" : ""}>Edit</button>
           </div>`;
      return `<article class="card">
        ${imgBlock}
        <div class="stack">
          <div class="actions" style="justify-content: space-between;">
            <h3>${c.name}</h3>
            ${seedBadge}
          </div>
          <textarea class="char-edit ${isEditing ? "editing" : "readonly"}" data-name="${c.name}" placeholder="Character prompt" ${readOnlyAttr}>${description}</textarea>
          ${warn ? `<div class="warning">Generation failed: ${warn}</div>` : ""}
          ${buttons}
        </div>
      </article>`;
    })
    .join("");
};

const renderScenes = () => {
  // Scenes panel is no longer used; hide it.
  const panel = els.sceneList?.closest("section");
  if (panel) panel.style.display = "none";
};

const renderShots = () => {
  const container = els.shotGrid;
  if (!state.scenes.length) {
    container.innerHTML = `<p class="muted">Generate shots to see the storyboard.</p>`;
    container.classList.add("empty-state");
    return;
  }
  container.classList.remove("empty-state");
  if (els.generateShotsAll) {
    const hasEmptyShot = state.scenes.some((scene) =>
      scene.shots.some((shot) => !shot.shot_description?.trim())
    );
    els.generateShotsAll.disabled =
      !state.sessionId || !allCharactersReady() || state.shotBulkGenerating || hasEmptyShot;
  }
  const shotMap = new Map(state.shots.map((s) => [`${s.scene_number}-${s.shot_number}`, s]));
  const charactersReady = allCharactersReady();

  const renderCard = (scene, shot, isLast) => {
    const asset = shotMap.get(`${scene.scene_number}-${shot.shot_number}`);
    const key = `${scene.scene_number}:${shot.shot_number}`;
    const isLoading = state.shotLoading.has(key);
    const isRefineLoading = state.shotRefineLoading.has(key);
    const showPlaceholder = isRefineLoading || (!asset && isLoading);
    const hasText = !!shot.shot_description?.trim();
    const imgBlock = `<div class="image-wrapper">
      <div class="image-frame shot-lg ${showPlaceholder ? "loading" : ""}" data-scene="${scene.scene_number}" data-shot="${shot.shot_number}">
        ${
          showPlaceholder
            ? ""
            : asset
              ? `<img src="${asset.image_url}" alt="Scene ${scene.scene_number} shot ${shot.shot_number}"/>
                 <div class="image-actions">
                   <a class="icon-btn download-btn" title="Download" href="${asset.image_url}" data-filename="${encodeURIComponent(
                     `scene-${scene.scene_number}-shot-${shot.shot_number}.png`
                   )}"><span class="glyph">⤓</span></a>
                   <button class="icon-btn maximize" title="View larger" data-scene="${scene.scene_number}" data-shot="${shot.shot_number}"><span class="glyph">⤢</span></button>
                 </div>`
              : `<span class="muted small">Not generated yet</span>`
        }
      </div>
      <div class="tooltip">Ask AI Agent to refine ✨</div>
    </div>`;
    const description = shot.shot_description || "";
    const characters = asset?.characters_in_shot || shot.characters_in_shot || [];
    const seedBadge = asset ? `<span class="badge">seed ${asset.seed}</span>` : "";
    const promptSnippet = asset?.raw_structured_prompt
      ? `<details class="small muted"><summary>JSON prompt</summary><pre class="small muted" style="white-space: pre-wrap;">${asset.raw_structured_prompt}</pre></details>`
      : "";
    const isEditing = state.shotEditing.has(key) || !asset;
    const locked = state.shotAgentPending.has(key);
    const loadingShot = state.shotLoading.has(key);
    const readOnlyAttr = locked ? "readonly" : asset && !isEditing ? "readonly" : "";
    const textClass = `shot-edit ${isEditing ? "editing" : "readonly"}`;
    const genDisabled = !hasText || !charactersReady || state.shotBulkGenerating || loadingShot;
    const genLabel = loadingShot ? "Generating..." : "Generate this shot";
    const buttons = isEditing
      ? `<div class="actions" style="justify-content: flex-end; gap: 8px;">
           ${asset ? `<button class="ghost shot-cancel" type="button" data-scene="${scene.scene_number}" data-shot="${shot.shot_number}">Cancel</button>` : ""}
           <button class="primary shot-generate" type="button" data-scene="${scene.scene_number}" data-shot="${shot.shot_number}" ${genDisabled ? "disabled" : ""}>${genLabel}</button>
         </div>`
      : `<div class="actions" style="justify-content: flex-end;">
           <button class="ghost shot-edit-toggle" type="button" data-scene="${scene.scene_number}" data-shot="${shot.shot_number}" ${state.shotBulkGenerating ? "disabled" : ""}>Edit</button>
         </div>`;
    return `<div class="shot-card-wrap">
      <button class="adder-fab shot-add-btn" type="button" data-scene="${scene.scene_number}" data-shot="${shot.shot_number}" data-position="before" title="Add shot before">
        <span class="adder-plus">+</span>
      </button>
      <article class="card" data-scene="${scene.scene_number}" data-shot="${shot.shot_number}">
      <div class="actions" style="justify-content: space-between;">
        <div>
          <p class="eyebrow">Scene ${scene.scene_number}</p>
          <h3>Shot ${shot.shot_number}</h3>
        </div>
        ${seedBadge}
      </div>
      ${imgBlock}
      <textarea class="${textClass}" data-scene="${scene.scene_number}" data-shot="${shot.shot_number}" placeholder="Shot description" ${readOnlyAttr}>${description}</textarea>
      <div class="tag-row">
        ${characters.map((ch) => `<span class="tag">${ch}</span>`).join("")}
      </div>
      ${promptSnippet}
      ${buttons}
    </article>
    </div>`;
  };

  container.innerHTML = state.scenes
    .map((scene) => {
      const shotRow = scene.shots.map((shot, idx) => renderCard(scene, shot, idx === scene.shots.length - 1));
      const endAddCard = `<button class="card adder-card shot-add-btn" type="button" data-scene="${scene.scene_number}" data-shot="${scene.shots.length + 1}" data-position="before" title="Add shot after last">
        <span class="adder-plus">+</span>
        <span class="muted small">Add shot</span>
      </button>`;
      return `<div class="scene-block">
        <div class="scene-block-head">
          <div>
            <p class="eyebrow">Scene ${scene.scene_number}</p>
            <h3>${scene.scene_title || ""}</h3>
          </div>
          <span class="muted small">${scene.shots.length} shot${scene.shots.length === 1 ? "" : "s"}</span>
        </div>
        <div class="shot-grid-row">${shotRow.join("")}${endAddCard}</div>
      </div>`;
    })
    .join("");
};

const addShotAt = async (sceneNumber, targetShotNumber, position = "before") => {
  if (!state.sessionId) {
    setToast("Create a session first.", "error");
    return;
  }
  const shot_number = position === "after" ? Number(targetShotNumber) + 1 : Number(targetShotNumber);
  try {
    const data = await postJson("/shots/update", {
      session_id: state.sessionId,
      scene_number: Number(sceneNumber),
      shot_number,
      shot_description: "",
      insert_before: true,
    });
    applyShotUpdateResponse(data);
    renderShots();
    setToast("New shot added. Write a prompt or ask the agent.");
  } catch (err) {
    setToast(err.message || "Failed to add shot", "error");
  }
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

const openEditModal = (scene, shot) => {
  const key = `${scene}:${shot}`;
  if (state.shotAgentPending.has(key)) return;
  state.editTarget = { scene, shot };
  const asset = state.shots.find((s) => s.scene_number === scene && s.shot_number === shot);
  const shotData =
    asset ||
    state.scenes
      .find((s) => s.scene_number === scene)
      ?.shots.find((sh) => sh.shot_number === shot);
  els.editModalLabel.textContent = `Scene ${scene} • Shot ${shot}`;
  els.editModalTitle.textContent = "Ask AI Agent to refine";
  els.editModalText.value = "";
  els.editModal.classList.add("show");
  els.editModalText.focus();
};

const closeEditModal = () => {
  state.editTarget = null;
  els.editModal.classList.remove("show");
};

const openLightbox = (src, alt) => {
  if (!src) return;
  els.lightboxImage.src = src;
  els.lightboxImage.alt = alt || "Preview";
  els.lightboxBackdrop.classList.add("show");
};

const triggerDownload = async (url, filename = "image.png") => {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
  } catch (err) {
    setToast(err.message || "Download failed", "error");
  }
};

const clearCacheAndReset = () => {
  localStorage.removeItem(CACHE_KEY);
  const fresh = initialState();
  Object.keys(state).forEach((k) => {
    state[k] = fresh[k];
  });
  if (els.scriptInput) {
    els.scriptInput.value = "";
    els.scriptInput.disabled = false;
  }
  if (els.ingestBtn) {
    els.ingestBtn.disabled = !state.openaiToken || !state.briaToken;
    els.ingestBtn.textContent = state.openaiToken && state.briaToken ? "Ingest Script" : "Add API keys to ingest";
  }
  setStyle(state.style);
  setSession(null);
  renderCharacters();
  renderScenes();
  renderShots();
};

const closeLightbox = () => {
  els.lightboxBackdrop.classList.remove("show");
  els.lightboxImage.src = "";
};

const loadSampleIntoForm = () => {
  if (!els.scriptInput || state.sessionId) return;
  if (els.scriptInput.value.trim()) {
    const replace = window.confirm("Replace the current script with the sample script?");
    if (!replace) return;
  }
  const sample = SAMPLE_SCRIPT.trim();
  els.scriptInput.value = sample;
  state.script = sample;
  saveCache();
  setToast("Loaded sample script. You can ingest it now.");
  if (!els.scriptInput.disabled) {
    els.scriptInput.focus();
  }
};

els.scriptForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!state.openaiToken || !state.briaToken) {
    setToast("Enter API keys first.", "error");
    return;
  }
  const script = els.scriptInput.value.trim();
  const style = state.style;
  if (!script) {
    setToast("Please paste a script first.", "error");
    return;
  }
  if (els.ingestStatus) els.ingestStatus.textContent = "Ingesting script…";
  setLoading(els.ingestBtn, true, "Ingesting...");
  try {
    const data = await postJson("/script", { script, style, openai_api_key: state.openaiToken || undefined });
    state.script = data.script;
    setStyle(data.style || style);
    state.characters = data.characters || [];
    state.characterBaseline = Object.fromEntries(state.characters.map((c) => [c.name, c.character_description]));
    state.charEditing = new Set();
    state.charErrors = {};
    state.charLoading = new Set();
    state.characterAssets = [];
    state.shots = [];
    syncScenesState(data.scenes || [], [], { forceEditingAll: true });
    saveCache();
    setSession(data.session_id);
    if (els.scriptInput) {
      els.scriptInput.disabled = true;
    }
    if (els.ingestBtn) {
      els.ingestBtn.disabled = true;
      els.ingestBtn.textContent = "Ingested";
    }
    renderCharacters();
    renderScenes();
    renderShots();
    setToast("Script ingested. Ready to generate.");
  } catch (err) {
    setToast(err.message || "Failed to ingest script", "error");
  } finally {
    if (els.ingestStatus) els.ingestStatus.textContent = "";
    setLoading(els.ingestBtn, false, "Ingest Script");
  }
});

if (els.styleOptions) {
  els.styleOptions.addEventListener("click", (e) => {
    const btn = e.target.closest(".style-option");
    if (!btn) return;
    const selectedStyle = btn.dataset.style;
    if (selectedStyle) setStyle(selectedStyle);
  });
  setStyle(state.style);
}

els.briaTokenInput?.addEventListener("input", (e) => {
  state.briaToken = e.target.value.trim();
});

els.openaiTokenInput?.addEventListener("input", (e) => {
  state.openaiToken = e.target.value.trim();
});

els.resetSession?.addEventListener("click", () => {
  const confirmReset = window.confirm(
    "Starting a new script will clear all current scenes, shots, and images. Continue?"
  );
  if (!confirmReset) return;
  clearCacheAndReset();
});

els.loadSampleScript?.addEventListener("click", () => {
  if (state.sessionId) {
    setToast("Start a new script to load the sample.", "error");
    return;
  }
  loadSampleIntoForm();
});

els.apiKeysForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  const openai = (els.openaiTokenInput?.value || "").trim();
  const bria = (els.briaTokenInput?.value || "").trim();
  if (!openai || !bria) {
    setToast("Enter both API keys to continue.", "error");
    return;
  }
  state.openaiToken = openai;
  state.briaToken = bria;
  updateIngestLock();
  setToast("API keys saved for this session.");
});

els.generateCharacters.addEventListener("click", async () => {
  if (!state.openaiToken || !state.briaToken) {
    setToast("Enter API keys first.", "error");
    return;
  }
  if (!state.sessionId) {
    setToast("Create a session first.", "error");
    return;
  }
  const textareas = Array.from(document.querySelectorAll(".char-edit"));
  try {
    await Promise.all(
      textareas.map((el) =>
        postJson("/characters/update", {
          session_id: state.sessionId,
          name: el.dataset.name,
          character_description: el.value.trim(),
        })
      )
    );
    textareas.forEach((el) => {
      state.characterBaseline[el.dataset.name] = el.value.trim();
    });
  } catch (err) {
    setToast(err.message || "Failed to sync prompts before generation", "error");
    return;
  }
  const assetMap = new Map(state.characterAssets.map((c) => [c.name, c]));
  const targets = state.characters
    .map((c) => c.name)
    .filter((name) => !assetMap.get(name)?.image_url);

  if (!targets.length) {
    setToast("All characters are already generated.", "info");
    return;
  }

  setLoading(els.generateCharacters, true, "Generating...");
  document.querySelectorAll(".char-generate").forEach((btn) => (btn.disabled = true));
  try {
    state.charLoading = new Set(targets);
    renderCharacters();
    await Promise.all(
      targets.map(async (name) => {
        try {
          const data = await postJson("/characters/generate", {
            session_id: state.sessionId,
            character_names: [name],
            bria_api_token: state.briaToken || undefined,
          });
          const asset = (data.characters || [])[0];
          if (asset) {
            const others = state.characterAssets.filter((c) => c.name !== name);
            state.characterAssets = [...others, asset];
            state.charErrors[name] = undefined;
            state.charEditing.delete(name);
            saveCache();
          }
        } catch (err) {
          state.charErrors[name] = err.message || "Generation failed.";
        } finally {
          state.charLoading.delete(name);
          renderCharacters();
        }
      })
    );
    renderShots();
    const failed = Object.entries(state.charErrors || {}).filter(([, msg]) => msg);
    if (failed.length) {
      setToast(`Some characters failed: ${failed.map(([n]) => n).join(", ")}`, "error");
    } else {
      setToast("Characters generated.");
    }
    saveCache();
  } catch (err) {
    setToast(err.message || "Failed to generate characters", "error");
  } finally {
    state.charLoading.clear();
    setLoading(els.generateCharacters, false);
    document.querySelectorAll(".char-generate").forEach((btn) => (btn.disabled = false));
    els.generateCharacters.textContent = "Generate Characters";
  }
});

els.generateShotsAll?.addEventListener("click", async () => {
  if (!state.openaiToken || !state.briaToken) {
    setToast("Enter API keys first.", "error");
    return;
  }
  if (!state.sessionId) {
    setToast("Create a session first.", "error");
    return;
  }
  if (!allCharactersReady()) {
    setToast("Generate all characters first.", "error");
    return;
  }
  const shotAreas = Array.from(document.querySelectorAll(".shot-edit"));
  const missing = shotAreas.filter((el) => !el.value.trim());
  if (missing.length) {
    setToast("Add text to every shot before generating.", "error");
    return;
  }
  try {
    await Promise.all(
      shotAreas.map(async (el) => {
        const data = await postJson("/shots/update", {
          session_id: state.sessionId,
          scene_number: Number(el.dataset.scene),
          shot_number: Number(el.dataset.shot),
          shot_description: el.value.trim(),
        });
        applyShotUpdateResponse(data);
      })
    );
    shotAreas.forEach((el) => {
      const key = `${el.dataset.scene}:${el.dataset.shot}`;
      state.shotBaseline[key] = el.value.trim();
    });
  } catch (err) {
    setToast(err.message || "Failed to sync shot prompts before generation", "error");
    return;
  }
  setLoading(els.generateShotsAll, true, "Generating...");
  els.generateShotsAll.disabled = true;
  state.shotBulkGenerating = true;
  renderShots();
  const allShots = state.scenes.flatMap((scene) =>
    scene.shots.map((shot) => ({ scene: scene.scene_number, shot: shot.shot_number }))
  );
  try {
    for (const item of allShots) {
      const key = `${item.scene}:${item.shot}`;
      state.shotLoading.add(key);
      renderShots();
      const data = await postJson("/shots/generate_one", {
        session_id: state.sessionId,
        scene_number: item.scene,
        shot_number: item.shot,
        bria_api_token: state.briaToken || undefined,
      });
      state.shots = state.shots.filter(
        (s) => !(s.scene_number === data.shot.scene_number && s.shot_number === data.shot.shot_number)
      );
      state.shots.push(data.shot);
      // lock prompt once generated
      state.shotEditing.delete(`${item.scene}:${item.shot}`);
      state.shotLoading.delete(key);
      renderShots();
    }
    setToast("Shots generated.");
  } catch (err) {
    setToast(err.message || "Failed to generate shots", "error");
  } finally {
    state.shotLoading.clear();
    state.shotBulkGenerating = false;
    renderShots();
    els.generateShotsAll.disabled = false;
    setLoading(els.generateShotsAll, false);
    els.generateShotsAll.textContent = "Generate all shots";
  }
});

els.characterList.addEventListener("input", (e) => {
  const textarea = e.target.closest(".char-edit");
  if (!textarea) return;
  const name = textarea.dataset.name;
  const val = textarea.value;
  state.characters = state.characters.map((c) =>
    c.name === name ? { ...c, character_description: val } : c
  );
});

els.characterList.addEventListener("click", async (e) => {
  const maxBtn = e.target.closest(".maximize-char");
  if (maxBtn) {
    const name = maxBtn.dataset.name;
    const asset = state.characterAssets.find((c) => c.name === name);
    if (asset?.image_url) openLightbox(asset.image_url, name);
    return;
  }
  const downloadBtn = e.target.closest(".download-btn");
  if (downloadBtn) {
    e.preventDefault();
    const url = downloadBtn.getAttribute("href");
    const filename = decodeURIComponent(downloadBtn.dataset.filename || "image.png");
    triggerDownload(url, filename);
    return;
  }
  const editToggle = e.target.closest(".char-edit-toggle");
  if (editToggle) {
    const name = editToggle.dataset.name;
    state.charEditing.add(name);
    renderCharacters();
    const textarea = document.querySelector(`.char-edit[data-name="${name}"]`);
    if (textarea) {
      textarea.removeAttribute("readonly");
      textarea.classList.add("editing");
      textarea.focus();
      textarea.setSelectionRange(0, 0);
    }
    return;
  }
  const cancelBtn = e.target.closest(".char-cancel");
  if (cancelBtn) {
    const name = cancelBtn.dataset.name;
    const baseline = state.characterBaseline[name] || "";
    state.characters = state.characters.map((c) =>
      c.name === name ? { ...c, character_description: baseline } : c
    );
    state.charEditing.delete(name);
    renderCharacters();
    return;
  }
  const genBtn = e.target.closest(".char-generate");
  if (genBtn) {
    const name = genBtn.dataset.name;
    const card = genBtn.closest(".card");
    const textarea = card.querySelector(".char-edit");
    const character_description = textarea.value.trim();
    if (!character_description) {
      setToast("Character prompt cannot be empty.", "error");
      return;
    }
    genBtn.disabled = true;
    genBtn.textContent = "Generating...";
    state.charLoading.add(name);
    renderCharacters();
    try {
      const updateData = await postJson("/characters/update", {
        session_id: state.sessionId,
        name,
        character_description,
      });
      state.characters = updateData.characters || state.characters;
      state.characterBaseline[name] = character_description;
      const data = await postJson("/characters/generate", {
        session_id: state.sessionId,
        character_names: [name],
        bria_api_token: state.briaToken || undefined,
      });
      const others = state.characterAssets.filter((c) => c.name !== name);
      state.characterAssets = [...others, ...(data.characters || [])];
      state.charErrors[name] = undefined;
      state.charEditing.delete(name);
      saveCache();
      state.charLoading.delete(name);
      renderCharacters();
      renderShots();
      setToast(`Generated ${name}.`);
    } catch (err) {
      state.charErrors[name] = err.message || "Generation failed.";
      renderCharacters();
      setToast(err.message || "Failed to generate character", "error");
    } finally {
      state.charLoading.delete(name);
      genBtn.disabled = false;
      genBtn.textContent = "Generate this character";
    }
  }
});

els.shotGrid.addEventListener("input", (e) => {
  const textarea = e.target.closest(".shot-edit");
  if (!textarea) return;
  const sceneNum = Number(textarea.dataset.scene);
  const shotNum = Number(textarea.dataset.shot);
  const val = textarea.value;
  const key = `${sceneNum}:${shotNum}`;
  state.scenes = state.scenes.map((scene) =>
    scene.scene_number === sceneNum
      ? {
          ...scene,
          shots: scene.shots.map((s) =>
            s.shot_number === shotNum ? { ...s, shot_description: val } : s
          ),
        }
      : scene
  );
  state.shotEditing.add(key);
  const card = textarea.closest("article.card");
  const genBtn = card?.querySelector(".shot-generate");
  if (genBtn) {
    const loading = state.shotLoading.has(key);
    genBtn.disabled = !val.trim() || !allCharactersReady() || state.shotBulkGenerating || loading;
  }
});

els.editModalClose.addEventListener("click", () => {
  closeEditModal();
});

els.editModalSend.addEventListener("click", async () => {
  if (!state.editTarget) return;
  const { scene, shot } = state.editTarget;
  const userRequest = els.editModalText.value.trim();
  if (!userRequest) {
    setToast("Add an edit request first.", "error");
    return;
  }
  els.editModalSend.disabled = true;
  els.editModalText.disabled = true;
  const key = `${scene}:${shot}`;
  state.shotAgentPending.add(key);
  state.shotRefineLoading.add(key);
  renderShots();
  // Close immediately to free space; request continues in background.
  closeEditModal();
    try {
    const data = await postJson("/shots/edit", {
      session_id: state.sessionId,
      scene_number: Number(scene),
      shot_number: Number(shot),
      user_request: userRequest,
      bria_api_token: state.briaToken || undefined,
      openai_api_key: state.openaiToken || undefined,
    });
    state.shots = state.shots.filter(
      (s) => !(s.scene_number === data.shot.scene_number && s.shot_number === data.shot.shot_number)
    );
    state.shots.push(data.shot);
    // Update prompt text area to reflect agent change
    state.scenes = state.scenes.map((sc) =>
      sc.scene_number === Number(scene)
        ? {
            ...sc,
            shots: sc.shots.map((sh) =>
              sh.shot_number === Number(shot)
                ? {
                    ...sh,
                    shot_description: data.shot.shot_description,
                    characters_in_shot: data.shot.characters_in_shot || sh.characters_in_shot,
                  }
                : sh
            ),
          }
        : sc
    );
    state.shotBaseline[key] = data.shot.shot_description;
    saveCache();
    renderShots();
    setToast(`Shot ${shot} updated (${data.decision}).`);
  } catch (err) {
    setToast(err.message || "Edit failed", "error");
  } finally {
    state.shotAgentPending.delete(key);
    state.shotRefineLoading.delete(key);
    els.editModalSend.disabled = false;
    els.editModalText.disabled = false;
    renderShots();
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
    applyShotUpdateResponse(data);
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
  const addBtn = e.target.closest(".shot-add-btn");
  if (addBtn) {
    const sceneNum = Number(addBtn.dataset.scene);
    const shotNum = Number(addBtn.dataset.shot || 0);
    const position = addBtn.dataset.position || "before";
    const target = position === "after" ? shotNum : Math.max(shotNum, 1);
    addShotAt(sceneNum, target, position);
    return;
  }

  const downloadBtn = e.target.closest(".download-btn");
  if (downloadBtn) {
    e.preventDefault();
    const url = downloadBtn.getAttribute("href");
    const filename = decodeURIComponent(downloadBtn.dataset.filename || "image.png");
    triggerDownload(url, filename);
    return;
  }

  const maximizeBtn = e.target.closest(".maximize");
  if (maximizeBtn) {
    const sceneNum = Number(maximizeBtn.dataset.scene);
    const shotNum = Number(maximizeBtn.dataset.shot);
    const asset = state.shots.find(
      (s) => s.scene_number === sceneNum && s.shot_number === shotNum
    );
    if (asset?.image_url) openLightbox(asset.image_url, `Scene ${sceneNum} Shot ${shotNum}`);
    return;
  }

  const imgFrame = e.target.closest(".image-frame.shot-lg");
  if (imgFrame) {
    if (e.target.closest(".icon-btn")) {
      return;
    }
    if (!state.openaiToken || !state.briaToken) {
      setToast("Enter API keys first.", "error");
      return;
    }
    const sceneNum = Number(imgFrame.dataset.scene);
    const shotNum = Number(imgFrame.dataset.shot);
    const key = `${sceneNum}:${shotNum}`;
    if (state.shotBulkGenerating) return;
    if (!allCharactersReady()) {
      setToast("Generate all characters first.", "error");
      return;
    }
    if (state.shotAgentPending.has(key)) return;
    openEditModal(sceneNum, shotNum);
    return;
  }

  const editBtn = e.target.closest(".shot-edit-toggle");
  if (editBtn) {
    const sceneNum = Number(editBtn.dataset.scene);
    const shotNum = Number(editBtn.dataset.shot);
    const key = `${sceneNum}:${shotNum}`;
    if (state.shotAgentPending.has(key)) return;
    state.shotEditing.add(key);
    renderShots();
    const freshTextarea = document.querySelector(
      `article.card[data-scene="${sceneNum}"][data-shot="${shotNum}"] .shot-edit`
    );
    if (freshTextarea) {
      freshTextarea.removeAttribute("readonly");
      freshTextarea.classList.add("editing");
      freshTextarea.focus();
      const start = 0;
      freshTextarea.setSelectionRange(start, start);
    }
    return;
  }

  const cancelBtn = e.target.closest(".shot-cancel");
  if (cancelBtn) {
    const key = `${cancelBtn.dataset.scene}:${cancelBtn.dataset.shot}`;
    const baseline = state.shotBaseline[key] || "";
    state.scenes = state.scenes.map((scene) =>
      scene.scene_number === Number(cancelBtn.dataset.scene)
        ? {
            ...scene,
            shots: scene.shots.map((s) =>
              s.shot_number === Number(cancelBtn.dataset.shot)
                ? { ...s, shot_description: baseline }
                : s
            ),
          }
        : scene
    );
    state.shotEditing.delete(key);
    renderShots();
    return;
  }

  const genShotBtn = e.target.closest(".shot-generate");
  if (genShotBtn) {
    if (!state.openaiToken || !state.briaToken) {
      setToast("Enter API keys first.", "error");
      return;
    }
    const sceneNum = Number(genShotBtn.dataset.scene);
    const shotNum = Number(genShotBtn.dataset.shot);
    const key = `${sceneNum}:${shotNum}`;
    if (state.shotBulkGenerating) return;
    if (!allCharactersReady()) {
      setToast("Generate all characters first.", "error");
      return;
    }
    if (state.shotAgentPending.has(key)) return;
    const card = genShotBtn.closest(".card");
    const textarea = card.querySelector(".shot-edit");
    const shot_description = textarea.value.trim();
    if (!shot_description) {
      setToast("Shot prompt cannot be empty.", "error");
      return;
    }
    genShotBtn.disabled = true;
    genShotBtn.textContent = "Generating...";
    state.shotLoading.add(key);
    renderShots();
    try {
      const updateResp = await postJson("/shots/update", {
        session_id: state.sessionId,
        scene_number: sceneNum,
        shot_number: shotNum,
        shot_description,
      });
      applyShotUpdateResponse(updateResp);
      state.shotBaseline[key] = shot_description;
      const data = await postJson("/shots/generate_one", {
        session_id: state.sessionId,
        scene_number: sceneNum,
        shot_number: shotNum,
        bria_api_token: state.briaToken || undefined,
      });
      state.shots = state.shots.filter(
        (s) => !(s.scene_number === data.shot.scene_number && s.shot_number === data.shot.shot_number)
      );
      state.shots.push(data.shot);
      state.shotEditing.delete(key);
      state.shotLoading.delete(key);
      saveCache();
      renderShots();
      setToast(`Generated scene ${sceneNum} shot ${shotNum}.`);
    } catch (err) {
      setToast(err.message || "Failed to generate shot", "error");
    } finally {
      state.shotLoading.delete(key);
      genShotBtn.disabled = false;
      genShotBtn.textContent = "Generate this shot";
    }
    return;
  }

  const btn = e.target.closest(".edit-btn");
  if (!btn) return;
  const { scene, shot } = btn.dataset;
  openEditModal(Number(scene), Number(shot));
});

// Lightbox handlers
els.lightboxClose.addEventListener("click", () => closeLightbox());
els.lightboxBackdrop.addEventListener("click", (e) => {
  if (e.target === els.lightboxBackdrop) closeLightbox();
});

// Hydrate from cache if available, otherwise render fresh
const hydrated = loadCache();
if (!hydrated) {
  renderCharacters();
  renderScenes();
  renderShots();
}
updateIngestLock();
