// App shell: landing page actions, tabs, and the wiring between views and state.
import { state, derived, ctx, loadState, save, clearCV } from "./store.js";
import { $, esc, debounce, toast, toPath, setPath } from "./util.js";
import { normaliseCV, emptyCV, SECTION_LABELS, SAMPLE_TEXT } from "./model.js";
import { extractFile, structureCV } from "./parse.js";
import { analyse, PERSONAL } from "./ats.js";
import { proofread, setProofListener } from "./proof.js";
import { exportCV } from "./export.js";
import { aiStatus } from "./ai.js";
import * as report from "./views/report.js";
import * as editor from "./views/editor.js";
import * as proof from "./views/proof.js";

const views = { report, editor, proof };
const TABS = [
  ["report", "ATS report"],
  ["editor", "Editor and templates"],
  ["proof", "Spelling and grammar"],
];
const view = () => views[state.tab] || report;
const panel = () => $("#panel");

/* ---------- rendering ---------- */

function chrome() {
  const a = derived.analysis;
  const badge = { report: a ? a.counts.fail : 0, proof: derived.proof.issues.length };
  $("#tabs").innerHTML = TABS.map(
    ([id, label]) =>
      `<button class="tab ${state.tab === id ? "on" : ""}" role="tab" aria-selected="${state.tab === id}" data-action="go" data-tab="${id}">${label}${badge[id] ? ` <span class="badge badge-alert">${badge[id]}</span>` : ""}</button>`
  ).join("");
  const pill = $("#scorePill");
  pill.className = `pill ${a ? report.tone(a.score) : ""}`;
  pill.textContent = a ? `ATS score ${a.score}` : "";
  $("#cvName").textContent = state.cv ? state.cv.name || "Untitled CV" : "";
  const aiChip = $("#aiChip");
  aiChip.hidden = !derived.ai;
  aiChip.textContent = "AI on";
  aiChip.className = "tag tag-ai";
  aiChip.title = `Using ${derived.model}`;
}

function renderPanel() {
  const p = panel();
  p.oninput = p.ondragstart = p.ondragover = p.ondrop = null;
  p.innerHTML = view().render();
  if (view().mount) view().mount(p);
}

function show() {
  const app = state.view === "app" && !!state.cv;
  $("#landing").hidden = app;
  $("#app").hidden = !app;
  $("#resume").hidden = !state.cv;
}

function compute() {
  derived.proof = proofread(state.cv, { lang: state.lang, ignored: state.ignored, personalDict: state.personalDict });
  derived.analysis = analyse({ cv: state.cv, raw: state.raw, jd: null, proof: derived.proof, useTemplate: state.useTemplate });
}

function recompute({ render = true } = {}) {
  if (!state.cv) return;
  compute();
  save();
  chrome();
  if (render) renderPanel();
  else if (view().refresh) view().refresh();
}

function go(tab) {
  state.tab = views[tab] ? tab : "report";
  save();
  chrome();
  renderPanel();
  window.scrollTo(0, 0);
}

function fix(action) {
  const cv = state.cv;
  if (action === "use-template") {
    state.useTemplate = true;
    toast("Your download now uses an ATS-safe template");
  } else if (action === "fix-headings") {
    for (const s of cv.sections) if (s.nonStandard) (s.title = SECTION_LABELS[s.type]), (s.nonStandard = false);
    toast("Headings changed to standard ones");
  } else if (action === "remove-personal") {
    cv.headerExtra = cv.headerExtra.filter((x) => !PERSONAL.test(x));
    toast("Personal details removed");
  } else if (action === "remove-refs") {
    cv.sections = cv.sections.filter((s) => s.type !== "references");
    toast("References section removed");
  }
  recompute();
}

Object.assign(ctx, { render: renderPanel, recompute, changed: debounce(() => recompute({ render: false }), 250), go, fix });

/* ---------- getting a CV in ---------- */

function enter(tab = "report") {
  state.view = "app";
  state.tab = tab;
  show();
  recompute();
  window.scrollTo(0, 0);
}

function openText(text, signals = {}) {
  if (!text.trim()) throw new Error("No text could be read from that file. If it is a scanned image, an ATS cannot read it either. Export it from Word or Google Docs instead.");
  state.raw = { text, signals };
  state.cv = normaliseCV(structureCV(text));
  state.ignored = [];
  state.useTemplate = false;
  enter();
}

async function openFile(file) {
  if (!file) return;
  toast(`Reading ${file.name}…`);
  try {
    const { text, signals } = await extractFile(file);
    openText(text, signals);
  } catch (err) {
    toast(err.message || "That file could not be read.");
  }
}

/* ---------- actions ---------- */

const own = {
  go: (el) => go(el.dataset.tab),
  upload: () => $("#file").click(),
  sample: () => openText(SAMPLE_TEXT, { fileName: "Sample CV", fileType: "txt" }),
  scratch() {
    state.raw = { text: "", signals: {} };
    state.cv = emptyCV();
    state.ignored = [];
    state.useTemplate = true;
    enter("editor");
  },
  "paste-toggle"() {
    const box = $("#pasteBox");
    box.hidden = !box.hidden;
    if (!box.hidden) $("#pasteText").focus();
  },
  "paste-analyse"() {
    const text = $("#pasteText").value;
    if (text.trim().length < 40) return toast("Paste the full text of your CV first");
    openText(text, { fileName: "Pasted text", fileType: "txt" });
  },
  resume: () => enter(state.tab),
  home() {
    state.view = "landing";
    save();
    show();
    window.scrollTo(0, 0);
  },
  "new-cv"() {
    if (!confirm("Start again with a different CV? Your current CV will be removed from this browser.")) return;
    clearCV();
    show();
    window.scrollTo(0, 0);
  },
  async download(el) {
    const menu = el.closest("details");
    if (menu) menu.open = false;
    await exportCV(state.cv, el.dataset.format, { template: state.template, accent: state.accent });
    toast("Downloaded. No watermark, no charge.");
  },
};
const actions = Object.assign({}, ...Object.values(views).map((v) => v.actions || {}), own);

function call(name, el, e) {
  const fn = actions[name];
  if (!fn) return;
  try {
    const r = fn(el, e);
    if (r && r.catch) r.catch((err) => toast(err.message || "Something went wrong"));
  } catch (err) {
    console.error(err);
    toast(err.message || "Something went wrong");
  }
}

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (el && !el.disabled) call(el.dataset.action, el, e);
  // Close the download menu when clicking elsewhere.
  const menu = $("#downloadMenu");
  if (menu && menu.open && !menu.contains(e.target)) menu.open = false;
});
document.addEventListener("change", (e) => {
  const el = e.target.closest("[data-change]");
  if (el) call(el.dataset.change, el, e);
  if (e.target.id === "file") {
    openFile(e.target.files[0]);
    e.target.value = "";
  }
});
document.addEventListener("submit", (e) => {
  const form = e.target.closest("form[data-submit]");
  if (form) call(form.dataset.submit, form, e);
});
document.addEventListener("input", (e) => {
  const el = e.target;
  if (el.dataset.path) {
    const path = toPath(el.dataset.path);
    let v = el.value;
    if (el.dataset.as === "lines")
      v = v
        .split("\n")
        .map((l) => l.replace(/^\s*[-•*–·▪●]\s*/, "").trim())
        .filter(Boolean);
    else if (el.dataset.as === "list")
      v = v
        .split(/[,\n]/)
        .map((x) => x.trim())
        .filter(Boolean);
    setPath(state.cv, path, v);
    if (view().onInput) view().onInput(el, path);
    ctx.changed();
  } else if (el.dataset.bind) {
    setPath(state, toPath(el.dataset.bind), el.value);
    ctx.changed();
  }
});

// Drag a file anywhere on the landing page's drop zone.
const zone = $("#dropzone");
zone.addEventListener("dragover", (e) => {
  e.preventDefault();
  zone.classList.add("over");
});
zone.addEventListener("dragleave", () => zone.classList.remove("over"));
zone.addEventListener("drop", (e) => {
  e.preventDefault();
  zone.classList.remove("over");
  openFile(e.dataTransfer.files[0]);
});

/* ---------- start ---------- */

loadState();
if (!views[state.tab]) state.tab = "report";
show();
if (state.cv) {
  compute();
  if (state.view === "app") {
    chrome();
    renderPanel();
  }
}

// Dictionary results arrive from the worker a moment after each check.
setProofListener(
  debounce(() => {
    if (!state.cv) return;
    compute();
    if (state.view !== "app") return;
    chrome();
    if (state.tab === "report" || state.tab === "proof") renderPanel();
  }, 120)
);

aiStatus().then((s) => {
  derived.ai = !!s.ai;
  derived.model = s.model || "";
  if (state.view === "app" && state.cv) {
    chrome();
    if (state.tab === "proof") renderPanel();
  }
});

window.addEventListener("error", (e) => console.error("cvclarity:", e.message));
export { esc };
