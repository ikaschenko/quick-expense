const fileSelect = document.getElementById("file");
const levelSelect = document.getElementById("level");
const qInput = document.getElementById("q");
const linesInput = document.getElementById("lines");
const statusEl = document.getElementById("status");
const entriesEl = document.getElementById("entries");

async function getJson(url) {
  const response = await fetch(url, { credentials: "same-origin", headers: { "X-Requested-With": "fetch" } });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || `Request failed (${response.status})`);
  }
  return response.json();
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const escapeDiv = document.createElement("div");

function escapeHtml(value) {
  escapeDiv.textContent = String(value);
  return escapeDiv.innerHTML;
}

async function loadFiles() {
  const { files } = await getJson("/api/admin/logs/files");
  fileSelect.innerHTML = files
    .map((f) => `<option value="${f.name}">${f.name} (${formatSize(f.size)})</option>`)
    .join("");
}

async function loadTail() {
  if (!fileSelect.value) return;
  statusEl.textContent = "Loading…";
  const params = new URLSearchParams({
    file: fileSelect.value,
    level: levelSelect.value,
    q: qInput.value,
    lines: linesInput.value,
  });
  try {
    const { entries } = await getJson(`/api/admin/logs/tail?${params}`);
    entriesEl.innerHTML = entries
      .map((entry) => `<div class="entry ${entry.level || "info"}"><span class="meta">${escapeHtml(entry.timestamp || "")}</span> ${escapeHtml(JSON.stringify(entry))}</div>`)
      .join("");
    statusEl.textContent = `${entries.length} entries`;
  } catch (err) {
    statusEl.textContent = err.message;
    entriesEl.innerHTML = "";
  }
}

document.getElementById("refresh").addEventListener("click", loadTail);
fileSelect.addEventListener("change", loadTail);
levelSelect.addEventListener("change", loadTail);
qInput.addEventListener("keydown", (e) => { if (e.key === "Enter") loadTail(); });

(async function init() {
  try {
    await loadFiles();
    await loadTail();
  } catch (err) {
    statusEl.textContent = err.message;
  }
})();
