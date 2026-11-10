// ATS report: overall score, category scores, what to fix first, and what the software read.
import { state, derived, ctx } from "../store.js";
import { esc, plural } from "../util.js";
import { verdict } from "../ats.js";
import { kindOf } from "../model.js";

const ICON = { pass: "✓", warn: "!", fail: "✕", info: "i" };
export const tone = (s) => (s >= 80 ? "good" : s >= 55 ? "ok" : "bad");

export function ring(score, size = 150) {
  const r = 54;
  const c = 2 * Math.PI * r;
  return `<svg class="ring ${tone(score)}" width="${size}" height="${size}" viewBox="0 0 128 128" role="img" aria-label="ATS score ${score} out of 100">
    <circle cx="64" cy="64" r="${r}" fill="none" stroke-width="11" class="ring-bg"/>
    <circle cx="64" cy="64" r="${r}" fill="none" stroke-width="11" stroke-linecap="round" class="ring-fg" stroke-dasharray="${(c * score) / 100} ${c}" transform="rotate(-90 64 64)"/>
    <text x="64" y="66" text-anchor="middle" class="ring-num">${score}</text>
    <text x="64" y="86" text-anchor="middle" class="ring-of">out of 100</text>
  </svg>`;
}

const fixBtn = (f) => (f ? `<button class="btn btn-sm" data-action="fix" ${f.tab ? `data-tab="${esc(f.tab)}"` : `data-do="${esc(f.action)}"`}>${esc(f.label)}</button>` : "");

const checkRow = (c) => `<li class="check ${c.status}">
  <span class="ico" aria-hidden="true">${ICON[c.status]}</span>
  <div class="check-body"><strong>${esc(c.title)}</strong><p>${esc(c.detail)}</p></div>
  ${fixBtn(c.fix)}
</li>`;

function parsedPanel(cv) {
  const row = (k, v) => `<tr><th>${k}</th><td>${v ? esc(v) : `<span class="missing">Not found</span>`}</td></tr>`;
  const sections = cv.sections
    .map((s) => {
      const k = kindOf(s.type);
      const n = k === "text" ? (s.text ? "text" : "empty") : k === "list" ? plural(s.list.length, "entry", "entries") : plural(s.items.length, "entry", "entries");
      return `<span class="chip ${s.nonStandard ? "chip-warn" : ""}">${esc(s.title)} · ${n}</span>`;
    })
    .join("");
  return `<section class="card">
    <h3>How an ATS reads your CV</h3>
    <p class="muted">These are the fields the software would file. Anything missing or wrong here is missing or wrong for the recruiter too.</p>
    <table class="parsed">
      ${row("Name", cv.name)}${row("Headline", cv.title)}${row("Email", cv.contact.email)}${row("Phone", cv.contact.phone)}${row("Location", cv.contact.location)}${row("Links", cv.contact.links.join(", "))}
    </table>
    <p class="label">Sections recognised</p>
    <div class="chips">${sections || `<span class="missing">None found</span>`}</div>
  </section>`;
}

export function render() {
  const a = derived.analysis;
  if (!a) return "";
  const top = a.checks
    .filter((c) => c.status === "fail" || c.status === "warn")
    .sort((x, y) => (x.status === y.status ? y.weight - x.weight : x.status === "fail" ? -1 : 1))
    .slice(0, 5);
  const sig = state.raw.signals || {};

  return `<div class="report">
    <section class="card score-card">
      ${ring(a.score)}
      <div class="score-text">
        <p class="label">ATS score${sig.fileName ? ` · ${esc(sig.fileName)}` : ""}</p>
        <h2>${esc(verdict(a.score))}</h2>
        <p class="counts"><span class="count fail">${a.counts.fail} to fix</span><span class="count warn">${a.counts.warn} to improve</span><span class="count pass">${a.counts.pass} passed</span></p>
        <p class="muted">${a.words} words · ${plural(a.bullets, "bullet point")}. The score updates as you edit.</p>
      </div>
      <div class="cat-bars">
        ${a.categories
          .map(
            (c) => `<a class="cat-bar" href="#cat-${c.id}">
              <span class="cat-name">${esc(c.name)}</span>
              <span class="bar"><i class="${c.score == null ? "" : tone(c.score)}" style="width:${c.score ?? 0}%"></i></span>
              <span class="cat-score">${c.score == null ? "–" : c.score}</span>
            </a>`
          )
          .join("")}
      </div>
    </section>

    <div class="report-grid">
      <div class="report-main">
        ${
          top.length
            ? `<section class="card"><h3>Fix these first</h3><ul class="checks">${top.map(checkRow).join("")}</ul></section>`
            : `<section class="card"><h3>Nothing left to fix</h3><p class="muted">Every check passed. Download your CV and start applying.</p></section>`
        }
        ${a.categories
          .map(
            (c) => `<section class="card" id="cat-${c.id}">
              <div class="card-head"><div><h3>${esc(c.name)}</h3><p class="muted">${esc(c.blurb)}</p></div>${c.score == null ? "" : `<span class="pill ${tone(c.score)}">${c.score}</span>`}</div>
              <ul class="checks">${c.checks.map(checkRow).join("")}</ul>
            </section>`
          )
          .join("")}
      </div>
      <aside class="report-side">
        ${parsedPanel(state.cv)}
        <section class="card">
          <h3>Next steps</h3>
          <div class="stack">
            <button class="btn btn-primary" data-action="go" data-tab="editor">Edit and pick a template</button>
            <button class="btn" data-action="go" data-tab="proof">Check spelling and grammar</button>
          </div>
        </section>
      </aside>
    </div>
  </div>`;
}

export const actions = {
  fix(el) {
    if (el.dataset.do) ctx.fix(el.dataset.do);
    else ctx.go(el.dataset.tab);
  },
};
