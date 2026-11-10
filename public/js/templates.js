// CV templates. One definition drives the on-screen preview, the PDF and the Word file,
// so what you see is what you download. All are single-column and ATS-safe.
import { kindOf } from "./model.js";
import { esc } from "./util.js";

export const TEMPLATES = {
  classic: { name: "Classic", blurb: "Traditional serif. Suits law, finance, academia and the public sector.", body: "times", head: "times", align: "center", heading: "rule" },
  modern: { name: "Modern", blurb: "Clean sans-serif. Suits tech, marketing and most office roles.", body: "helvetica", head: "helvetica", align: "left", heading: "accent" },
  executive: { name: "Executive", blurb: "Bold header with shaded headings. Suits senior and management roles.", body: "times", head: "helvetica", align: "left", heading: "band" },
};

export const ACCENTS = [
  { color: "#1F2933", name: "Charcoal" },
  { color: "#1D4E89", name: "Navy" },
  { color: "#0F766E", name: "Teal" },
  { color: "#7A1F3D", name: "Burgundy" },
  { color: "#D85C21", name: "Orange" },
];

export const contactLine = (cv) => [cv.contact.email, cv.contact.phone, cv.contact.location, ...(cv.contact.links || [])].filter(Boolean);

/** Mixes a hex colour with white. amount 0 = white, 1 = the colour. */
export function tint(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.round(255 - (255 - v) * amount);
  return "#" + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => ch(v).toString(16).padStart(2, "0")).join("");
}

/** Sections that actually have something in them. */
export function filledSections(cv) {
  return cv.sections.filter((s) => {
    const k = kindOf(s.type);
    return k === "text" ? s.text.trim() : k === "list" ? s.list.length : s.items.some((i) => i.heading || i.sub || i.text || i.bullets.length);
  });
}

export function renderCV(cv, { template = "classic", accent = "#1F2933" } = {}) {
  const t = TEMPLATES[template] || TEMPLATES.classic;
  const body = filledSections(cv)
    .map((s) => {
      const k = kindOf(s.type);
      let inner;
      if (k === "text") inner = `<p>${esc(s.text)}</p>`;
      else if (k === "list") inner = `<p>${esc(s.list.join(", "))}</p>`;
      else
        inner = s.items
          .map(
            (it) => `<div class="cv-item">
              ${it.heading || it.date ? `<div class="cv-row"><strong>${esc(it.heading)}</strong><span class="cv-date">${esc(it.date)}</span></div>` : ""}
              ${it.sub ? `<div class="cv-sub">${esc(it.sub)}</div>` : ""}
              ${it.text ? `<p>${esc(it.text)}</p>` : ""}
              ${it.bullets.length ? `<ul>${it.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}
            </div>`
          )
          .join("");
      return `<section><h2>${esc(s.title)}</h2>${inner}</section>`;
    })
    .join("");
  const empty = !cv.name && !body ? `<p class="cv-empty">Your CV will appear here as you type.</p>` : "";
  return `<div class="cv tpl-${esc(template)} head-${t.head} body-${t.body}" style="--accent:${esc(accent)};--tint:${tint(accent, 0.1)}">
    <header class="cv-head">
      <h1>${esc(cv.name || "Your Name")}</h1>
      ${cv.title ? `<p class="cv-title">${esc(cv.title)}</p>` : ""}
      <p class="cv-contact">${contactLine(cv).map(esc).join(" &nbsp;|&nbsp; ")}</p>
    </header>
    ${body}${empty}
  </div>`;
}
