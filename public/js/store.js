// App state, saved in this browser only (localStorage).
import { debounce } from "./util.js";
import { normaliseCV } from "./model.js";

const KEY = "cvclarity.v1";

const defaults = () => ({
  cv: null,
  raw: { text: "", signals: {} },
  template: "classic",
  accent: "#1F2933",
  lang: "en-GB",
  ignored: [],
  personalDict: [],
  useTemplate: false,
  tab: "report",
  view: "landing",
});

export const state = defaults();

export function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (saved && typeof saved === "object") Object.assign(state, defaults(), saved);
    if (state.cv) state.cv = normaliseCV(state.cv);
    else state.view = "landing";
  } catch {
    /* corrupt or blocked storage: start fresh */
  }
}

const write = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full or blocked: the app still works for this visit */
  }
};
export const save = debounce(write, 300);

/** Clears the CV but keeps the personal dictionary and template choice. */
export function clearCV() {
  const d = defaults();
  Object.assign(state, { cv: null, raw: d.raw, ignored: [], useTemplate: false, tab: "report", view: "landing" });
  write();
}

// Values worked out from the state, never saved.
export const derived = {
  ai: false,
  model: "",
  proof: { issues: [], spellReady: false, loading: true, failed: false },
  analysis: null,
};

// Filled in by app.js so views can call back without circular imports.
export const ctx = {};
