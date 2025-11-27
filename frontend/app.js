const state = {
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
  editTarget: null,
  lockedEdits: new Set(), // legacy lock; no longer used for agent locking
  shotAgentPending: new Set(),
  charLoading: new Set(),
  shotLoading: new Set(),
  shotRefineLoading: new Set(),
};

const els = {
  backendUrl: document.getElementById("backend-url"),
  pingButton: document.getElementById("ping-backend"),
  health: document.getElementById("health-status"),
  scriptForm: document.getElementById("script-form"),
  scriptInput: document.getElementById("script-input"),
  styleSelect: document.getElementById("style-select"),
  ingestBtn: document.getElementById("ingest-btn"),
  ingestStatus: document.getElementById("ingest-status"),
  sessionPill: document.getElementById("session-pill"),
  characterList: document.getElementById("character-list"),
  generateCharacters: document.getElementById("generate-characters"),
  sceneList: document.getElementById("scene-list"),
  generateShots: document.getElementById("generate-shots"),
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
  if (!sessionId && els.ingestStatus) els.ingestStatus.textContent = "";
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
      const imgBlock = asset
        ? `<div class="image-wrapper">
             <div class="image-frame portrait">
               <img src="${asset.image_url}" alt="${c.name}" />
             </div>
             <div class="image-actions">
               <a class="icon-btn" title="Download" href="${asset.image_url}" download target="_blank" rel="noreferrer"><span class="glyph">⤓</span></a>
               <button class="icon-btn maximize-char" title="View larger" data-name="${c.name}"><span class="glyph">⤢</span></button>
             </div>
           </div>`
        : `<div class="image-frame portrait ${loading ? "loading" : ""}">
             ${loading ? "" : `<span class="muted small">Not generated yet</span>`}
           </div>`;
      const description = c.character_description || asset?.description || "No description";
      const seedBadge = asset ? `<span class="badge">seed ${asset.seed}</span>` : "";
      const readOnlyAttr = ""; // always editable
      const buttons = `<div class="actions" style="justify-content: flex-end; gap: 8px;">
             <button class="primary char-generate" type="button" data-name="${c.name}">Generate this character</button>
           </div>`;
      return `<article class="card">
        ${imgBlock}
        <div class="stack">
          <div class="actions" style="justify-content: space-between;">
            <h3>${c.name}</h3>
            ${seedBadge}
          </div>
          <textarea class="char-edit" data-name="${c.name}" placeholder="Character prompt" ${readOnlyAttr}>${description}</textarea>
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

  const shotMap = new Map(state.shots.map((s) => [`${s.scene_number}-${s.shot_number}`, s]));
  container.innerHTML = state.scenes
    .flatMap((scene) =>
      scene.shots.map((shot) => {
        const asset = shotMap.get(`${scene.scene_number}-${shot.shot_number}`);
        const key = `${scene.scene_number}:${shot.shot_number}`;
        const isLoading = state.shotLoading.has(key);
        const isRefineLoading = state.shotRefineLoading.has(key);
        const showPlaceholder = isRefineLoading || (!asset && isLoading);
        const imgBlock = `<div class="image-wrapper">
          <div class="image-frame shot-lg ${showPlaceholder ? "loading" : ""}" data-scene="${scene.scene_number}" data-shot="${shot.shot_number}">
            ${
              showPlaceholder
                ? ""
                : asset
                  ? `<img src="${asset.image_url}" alt="Scene ${scene.scene_number} shot ${shot.shot_number}"/>`
                  : `<span class="muted small">Not generated yet</span>`
            }
          </div>
          <div class="image-actions">
            ${
              asset
                ? `<a class="icon-btn" title="Download" href="${asset.image_url}" download target="_blank" rel="noreferrer"><span class="glyph">⤓</span></a>
                   <button class="icon-btn maximize" title="View larger" data-scene="${scene.scene_number}" data-shot="${shot.shot_number}"><span class="glyph">⤢</span></button>`
                : ""
            }
          </div>
          <div class="tooltip">Ask AI Agent to refine ✨</div>
        </div>`;
        const description = shot.shot_description;
        const characters = asset?.characters_in_shot || shot.characters_in_shot || [];
        const seedBadge = asset ? `<span class="badge">seed ${asset.seed}</span>` : "";
        const promptSnippet = asset?.raw_structured_prompt
          ? `<details class="small muted"><summary>JSON prompt</summary><pre class="small muted" style="white-space: pre-wrap;">${asset.raw_structured_prompt}</pre></details>`
          : "";
        const isEditing = state.shotEditing.has(key) || !asset;
        const locked = state.shotAgentPending.has(key);
        const readOnlyAttr = locked ? "readonly" : asset && !isEditing ? "readonly" : "";
        const buttons = isEditing
          ? `<div class="actions" style="justify-content: flex-end; gap: 8px;">
               ${asset ? `<button class="ghost shot-cancel" type="button" data-scene="${scene.scene_number}" data-shot="${shot.shot_number}">Cancel</button>` : ""}
               <button class="primary shot-generate" type="button" data-scene="${scene.scene_number}" data-shot="${shot.shot_number}">Generate this shot</button>
             </div>`
          : `<div class="actions" style="justify-content: flex-end;">
               <button class="ghost shot-edit-toggle" type="button" data-scene="${scene.scene_number}" data-shot="${shot.shot_number}">Edit</button>
             </div>`;
        return `<article class="card" data-scene="${scene.scene_number}" data-shot="${shot.shot_number}">
          <div class="actions" style="justify-content: space-between;">
            <div>
              <p class="eyebrow">Scene ${scene.scene_number}</p>
              <h3>Shot ${shot.shot_number}</h3>
            </div>
            ${seedBadge}
          </div>
          ${imgBlock}
          <textarea class="shot-edit" data-scene="${scene.scene_number}" data-shot="${shot.shot_number}" placeholder="Shot description" ${readOnlyAttr}>${description}</textarea>
          <div class="tag-row">
            ${characters.map((ch) => `<span class="tag">${ch}</span>`).join("")}
          </div>
          ${promptSnippet}
          ${buttons}
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

const closeLightbox = () => {
  els.lightboxBackdrop.classList.remove("show");
  els.lightboxImage.src = "";
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
  if (els.ingestStatus) els.ingestStatus.textContent = "Ingesting script…";
  setLoading(els.ingestBtn, true, "Ingesting...");
  try {
    const data = await postJson("/script", { script, style });
    state.script = data.script;
    state.style = data.style;
    state.characters = data.characters || [];
    state.characterBaseline = Object.fromEntries(state.characters.map((c) => [c.name, c.character_description]));
    state.scenes = data.scenes || [];
    state.shotBaseline = Object.fromEntries(
      (data.scenes || []).flatMap((scene) =>
        scene.shots.map((shot) => [`${scene.scene_number}:${shot.shot_number}`, shot.shot_description])
      )
    );
    state.shotEditing = new Set(
      (data.scenes || []).flatMap((scene) => scene.shots.map((shot) => `${scene.scene_number}:${shot.shot_number}`))
    );
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
    if (els.ingestStatus) els.ingestStatus.textContent = "";
    setLoading(els.ingestBtn, false, "Ingest Script");
  }
});

els.generateCharacters.addEventListener("click", async () => {
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
  setLoading(els.generateCharacters, true, "Generating...");
  document.querySelectorAll(".char-generate").forEach((btn) => (btn.disabled = true));
  try {
    const targets = state.characters.map((c) => c.name);
    state.charLoading = new Set(targets);
    renderCharacters();
    await Promise.all(
      targets.map(async (name) => {
        const data = await postJson("/characters/generate", {
          session_id: state.sessionId,
          character_names: [name],
        });
        const asset = (data.characters || [])[0];
        if (asset) {
          const others = state.characterAssets.filter((c) => c.name !== name);
          state.characterAssets = [...others, asset];
          state.charLoading.delete(name);
          renderCharacters();
        }
      })
    );
    renderShots();
    setToast("Characters generated.");
  } catch (err) {
    setToast(err.message || "Failed to generate characters", "error");
  } finally {
    state.charLoading.clear();
    setLoading(els.generateCharacters, false);
    document.querySelectorAll(".char-generate").forEach((btn) => (btn.disabled = false));
    els.generateCharacters.textContent = "Generate Characters";
  }
});

els.generateShots.addEventListener("click", async () => {
  if (!state.sessionId) {
    setToast("Create a session first.", "error");
    return;
  }
  const shotAreas = Array.from(document.querySelectorAll(".shot-edit"));
  try {
    await Promise.all(
      shotAreas.map((el) =>
        postJson("/shots/update", {
          session_id: state.sessionId,
          scene_number: Number(el.dataset.scene),
          shot_number: Number(el.dataset.shot),
          shot_description: el.value.trim(),
        })
      )
    );
    shotAreas.forEach((el) => {
      const key = `${el.dataset.scene}:${el.dataset.shot}`;
      state.shotBaseline[key] = el.value.trim();
    });
  } catch (err) {
    setToast(err.message || "Failed to sync shot prompts before generation", "error");
    return;
  }
  setLoading(els.generateShots, true, "Generating...");
  els.generateShots.disabled = true;
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
    els.generateShots.disabled = false;
    setLoading(els.generateShots, false);
    els.generateShots.textContent = "Generate Shots";
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
      });
      const others = state.characterAssets.filter((c) => c.name !== name);
      state.characterAssets = [...others, ...(data.characters || [])];
      state.charLoading.delete(name);
      renderCharacters();
      renderShots();
      setToast(`Generated ${name}.`);
    } catch (err) {
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
                ? { ...sh, shot_description: data.shot.shot_description }
                : sh
            ),
          }
        : sc
    );
    state.shotBaseline[key] = data.shot.shot_description;
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
  const imgFrame = e.target.closest(".image-frame.shot-lg");
  if (imgFrame) {
    const sceneNum = Number(imgFrame.dataset.scene);
    const shotNum = Number(imgFrame.dataset.shot);
    const key = `${sceneNum}:${shotNum}`;
    if (state.shotAgentPending.has(key)) return;
    openEditModal(sceneNum, shotNum);
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

  const editBtn = e.target.closest(".shot-edit-toggle");
  if (editBtn) {
    const key = `${editBtn.dataset.scene}:${editBtn.dataset.shot}`;
    if (state.shotAgentPending.has(key)) return;
    state.shotEditing.add(key);
    renderShots();
    const card = editBtn.closest(".card");
    const textarea = card?.querySelector(".shot-edit");
    if (textarea) {
      textarea.removeAttribute("readonly");
      textarea.focus();
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
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
    const sceneNum = Number(genShotBtn.dataset.scene);
    const shotNum = Number(genShotBtn.dataset.shot);
    const key = `${sceneNum}:${shotNum}`;
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
      await postJson("/shots/update", {
        session_id: state.sessionId,
        scene_number: sceneNum,
        shot_number: shotNum,
        shot_description,
      });
      state.shotBaseline[key] = shot_description;
      const data = await postJson("/shots/generate_one", {
        session_id: state.sessionId,
        scene_number: sceneNum,
        shot_number: shotNum,
      });
      state.shots = state.shots.filter(
        (s) => !(s.scene_number === data.shot.scene_number && s.shot_number === data.shot.shot_number)
      );
      state.shots.push(data.shot);
      state.shotEditing.delete(key);
      state.shotLoading.delete(key);
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

// Initial render
renderCharacters();
renderScenes();
renderShots();
