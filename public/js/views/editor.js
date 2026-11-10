// Editor: template and colour, your details, sections, and a live preview of the download.
import { state, ctx } from "../store.js";
import { esc, $ } from "../util.js";
import { SECTION_LABELS, kindOf, classifyHeading, newItem, newSection } from "../model.js";
import { TEMPLATES, ACCENTS, renderCV } from "../templates.js";

const input = (label, path, value, { placeholder = "", type = "text", cls = "" } = {}) =>
  `<label class="field ${cls}"><span>${label}</span><input type="${type}" data-path="${path}" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off"></label>`;
const area = (label, path, value, { placeholder = "", rows = 3, as = "", hint = "" } = {}) =>
  `<label class="field"><span>${label}${hint ? ` <em>${hint}</em>` : ""}</span><textarea data-path="${path}" ${as ? `data-as="${as}"` : ""} rows="${rows}" placeholder="${esc(placeholder)}">${esc(value)}</textarea></label>`;

function design() {
  return `<section class="card">
    <h3>Template</h3>
    <div class="tpl-grid">
      ${Object.entries(TEMPLATES)
        .map(
          ([id, t]) => `<button class="tpl ${state.template === id ? "on" : ""}" data-action="set-template" data-id="${id}" aria-pressed="${state.template === id}">
            <span class="tpl-thumb tpl-thumb-${id}" style="--accent:${esc(state.accent)}"><i></i><i></i><b></b><i></i><i></i><b></b><i></i></span>
            <strong>${t.name}</strong><small>${t.blurb}</small>
          </button>`
        )
        .join("")}
    </div>
    <div class="swatches"><span class="label">Accent colour</span>
      ${ACCENTS.map((a) => `<button class="swatch ${state.accent === a.color ? "on" : ""}" style="background:${a.color}" data-action="set-accent" data-color="${a.color}" title="${a.name}" aria-label="${a.name}" aria-pressed="${state.accent === a.color}"></button>`).join("")}
    </div>
    <p class="muted small">All three templates are single-column with real text and standard headings, so an ATS can read them.</p>
  </section>`;
}

function details(cv) {
  return `<section class="card">
    <h3>Your details</h3>
    <div class="grid2">
      ${input("Full name", "name", cv.name, { placeholder: "Jordan Ellis" })}
      ${input("Headline (job title)", "title", cv.title, { placeholder: "Operations Manager" })}
      ${input("Email", "contact.email", cv.contact.email, { type: "email", placeholder: "you@example.com" })}
      ${input("Phone", "contact.phone", cv.contact.phone, { placeholder: "07700 900123" })}
      ${input("Location", "contact.location", cv.contact.location, { placeholder: "Leeds, UK" })}
      ${input("Links", "contact.links", cv.contact.links.join(", "), { placeholder: "linkedin.com/in/yourname" }).replace("<input", '<input data-as="list"')}
    </div>
    ${
      cv.headerExtra.length
        ? `<p class="label">Other lines found at the top of your CV</p>
           <ul class="extras">${cv.headerExtra.map((x, i) => `<li><span>${esc(x)}</span><button class="btn btn-sm btn-ghost" data-action="del-extra" data-i="${i}">Remove</button></li>`).join("")}</ul>
           <p class="muted small">These are not included in your download.</p>`
        : ""
    }
  </section>`;
}

function itemCard(it, si, ii, type) {
  const p = `sections.${si}.items.${ii}`;
  const edu = type === "education";
  return `<div class="item">
    <div class="grid2">
      ${input(edu ? "Qualification" : "Job title or name", `${p}.heading`, it.heading, { placeholder: edu ? "BA (Hons) Business Management" : "Operations Manager" })}
      ${input(edu ? "School or university" : "Employer or organisation", `${p}.sub`, it.sub, { placeholder: edu ? "University of Leeds" : "Northgate Distribution Ltd" })}
      ${input("Dates", `${p}.date`, it.date, { placeholder: "Jan 2020 – Present" })}
      <div class="field field-btn"><button class="btn btn-sm btn-ghost" data-action="del-item" data-s="${si}" data-i="${ii}">Remove entry</button></div>
    </div>
    ${area("Bullet points", `${p}.bullets`, it.bullets.join("\n"), { as: "lines", rows: Math.max(3, it.bullets.length + 1), hint: "one per line", placeholder: "Led a team of 12 and cut picking errors by 15%" })}
    ${it.text ? area("Description", `${p}.text`, it.text, { rows: 2 }) : ""}
  </div>`;
}

function sectionCard(s, si) {
  const k = kindOf(s.type);
  const n = state.cv.sections.length;
  let body;
  if (k === "text") body = area("Text", `sections.${si}.text`, s.text, { rows: 5 });
  else if (k === "list") body = area("Entries", `sections.${si}.list`, s.list.join(", "), { as: "list", rows: 3, hint: "separate with commas", placeholder: "Excel, SAP, Forecasting" });
  else body = s.items.map((it, ii) => itemCard(it, si, ii, s.type)).join("") + `<button class="btn btn-sm" data-action="add-item" data-s="${si}">Add entry</button>`;
  return `<section class="card section-card">
    <div class="section-head">
      <label class="field grow"><span>Section heading</span><input data-path="sections.${si}.title" value="${esc(s.title)}"></label>
      <label class="field"><span>Type</span><select data-change="set-type" data-s="${si}">${Object.entries(SECTION_LABELS).map(([t, l]) => `<option value="${t}" ${t === s.type ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <div class="section-tools">
        <button class="icon-btn" data-action="move-section" data-s="${si}" data-dir="-1" ${si === 0 ? "disabled" : ""} aria-label="Move section up" title="Move up">↑</button>
        <button class="icon-btn" data-action="move-section" data-s="${si}" data-dir="1" ${si === n - 1 ? "disabled" : ""} aria-label="Move section down" title="Move down">↓</button>
        <button class="icon-btn danger" data-action="del-section" data-s="${si}" aria-label="Delete section" title="Delete section">✕</button>
      </div>
    </div>
    <p class="heading-warn" data-warn="${si}" ${s.nonStandard ? "" : "hidden"}>An ATS may not recognise this heading. Try “${esc(SECTION_LABELS[s.type])}”.</p>
    ${body}
  </section>`;
}

export function render() {
  const cv = state.cv;
  return `<div class="editor">
    <div class="editor-form">
      ${design()}
      ${details(cv)}
      ${cv.sections.map(sectionCard).join("")}
      <section class="card add-section">
        <label class="field grow"><span>Add a section</span><select id="newSectionType">${Object.entries(SECTION_LABELS).map(([t, l]) => `<option value="${t}">${l}</option>`).join("")}</select></label>
        <button class="btn" data-action="add-section">Add section</button>
      </section>
    </div>
    <aside class="editor-preview">
      <div class="preview-bar">
        <div><strong>Live preview</strong> <span class="muted small">What you see is what you download</span></div>
        <div class="row">
          <button class="btn btn-sm btn-primary" data-action="download" data-format="pdf">PDF</button>
          <button class="btn btn-sm" data-action="download" data-format="docx">Word</button>
        </div>
      </div>
      <div class="preview-wrap" id="previewWrap"><div class="page" id="preview"></div></div>
    </aside>
  </div>`;
}

let observer;
function fit() {
  const wrap = $("#previewWrap");
  const page = $("#preview");
  if (wrap && page && wrap.clientWidth) page.style.zoom = Math.min(1, wrap.clientWidth / 794);
}

export function refresh() {
  const page = $("#preview");
  if (page) page.innerHTML = renderCV(state.cv, { template: state.template, accent: state.accent });
}

export function mount() {
  refresh();
  fit();
  if (observer) observer.disconnect();
  observer = new ResizeObserver(fit);
  observer.observe($("#previewWrap"));
}

/** Called by app.js after a data-path input changes. */
export function onInput(el, path) {
  if (path[0] === "sections" && path[2] === "title") {
    const s = state.cv.sections[path[1]];
    const h = classifyHeading(el.value);
    s.nonStandard = !!el.value.trim() && (!h || h.nonStandard);
    const warn = $(`[data-warn="${path[1]}"]`);
    if (warn) warn.hidden = !s.nonStandard;
  }
}

const done = () => ctx.recompute();

export const actions = {
  "set-template"(el) {
    state.template = el.dataset.id;
    state.useTemplate = true;
    done();
  },
  "set-accent"(el) {
    state.accent = el.dataset.color;
    done();
  },
  "set-type"(el) {
    const s = state.cv.sections[el.dataset.s];
    const old = SECTION_LABELS[s.type];
    s.type = el.value;
    if (!s.title || s.title === old || s.nonStandard) (s.title = SECTION_LABELS[s.type]), (s.nonStandard = false);
    done();
  },
  "add-section"() {
    const s = newSection($("#newSectionType").value);
    if (kindOf(s.type) === "items") s.items.push(newItem());
    state.cv.sections.push(s);
    done();
  },
  "del-section"(el) {
    const s = state.cv.sections[el.dataset.s];
    if (!confirm(`Delete the “${s.title}” section?`)) return;
    state.cv.sections.splice(el.dataset.s, 1);
    done();
  },
  "move-section"(el) {
    const i = Number(el.dataset.s);
    const j = i + Number(el.dataset.dir);
    const list = state.cv.sections;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    done();
  },
  "add-item"(el) {
    state.cv.sections[el.dataset.s].items.push(newItem());
    done();
  },
  "del-item"(el) {
    state.cv.sections[el.dataset.s].items.splice(el.dataset.i, 1);
    done();
  },
  "del-extra"(el) {
    state.cv.headerExtra.splice(el.dataset.i, 1);
    done();
  },
};
