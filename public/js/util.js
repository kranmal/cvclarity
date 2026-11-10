export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

export const uid = () => Math.random().toString(36).slice(2, 10);

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

let toastTimer;
export function toast(msg) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
}

export const wordCount = (t) => (String(t || "").match(/[A-Za-z0-9][A-Za-z0-9'’%&+#./-]*/g) || []).length;

export const getPath = (obj, path) => path.reduce((o, k) => (o == null ? o : o[k]), obj);
export function setPath(obj, path, value) {
  const last = path[path.length - 1];
  const parent = getPath(obj, path.slice(0, -1));
  if (parent != null) parent[last] = value;
}

export const toPath = (s) => String(s).split(".").map((k) => (/^\d+$/.test(k) ? Number(k) : k));

export const plural =(n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
