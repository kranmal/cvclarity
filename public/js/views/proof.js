// Spelling and grammar: every issue in context, with one-click fixes.
import { state, derived, ctx } from "../store.js";
import { esc, plural, toast } from "../util.js";
import { cvToText } from "../model.js";
import { applyIssue, applyPhrase } from "../proof.js";
import { ai } from "../ai.js";

const KIND = { spelling: "Spelling", grammar: "Grammar", style: "Style" };
let aiIssues = null;
let aiBusy = false;

function context(i) {
  const t = i.text || "";
  const a = Math.max(0, i.index - 48);
  const b = Math.min(t.length, i.index + i.length + 48);
  return `${a ? "…" : ""}${esc(t.slice(a, i.index))}<mark>${esc(t.substr(i.index, i.length))}</mark>${esc(t.slice(i.index + i.length, b))}${b < t.length ? "…" : ""}`;
}

function issueCard(i) {
  const sugg =
    i.suggestions == null
      ? `<span class="muted small">Finding suggestions…</span>`
      : i.suggestions.length
        ? i.suggestions.map((s) => `<button class="chip chip-fix" data-action="apply-issue" data-id="${esc(i.id)}" data-rep="${esc(s)}">${s === "" ? "Remove" : esc(s)}</button>`).join("")
        : `<span class="muted small">No suggestion. Edit it by hand if it is wrong.</span>`;
  return `<li class="issue ${i.kind}">
    <div class="issue-top"><span class="tag tag-${i.kind}">${KIND[i.kind]}</span><span class="muted small">${esc(i.label)}</span></div>
    <p class="issue-context">${context(i)}</p>
    <p class="issue-msg">${esc(i.message)}</p>
    <div class="issue-actions">
      <div class="chips">${sugg}</div>
      <div class="row">
        ${i.kind === "spelling" ? `<button class="btn btn-sm btn-ghost" data-action="add-word" data-word="${esc(i.word)}">Add to dictionary</button>` : ""}
        <button class="btn btn-sm btn-ghost" data-action="ignore-issue" data-id="${esc(i.id)}">Ignore</button>
      </div>
    </div>
  </li>`;
}

const quick = () => derived.proof.issues.filter((i) => i.kind !== "spelling" && i.suggestions && i.suggestions.length === 1);

export function render() {
  const p = derived.proof;
  const by = (k) => p.issues.filter((i) => i.kind === k);
  const n = { spelling: by("spelling").length, grammar: by("grammar").length, style: by("style").length };
  const status = p.failed
    ? `<span class="status bad">Dictionary could not be loaded. Grammar checks still work. Reload to try again.</span>`
    : p.spellReady
      ? `<span class="status good">Dictionary ready</span>`
      : `<span class="status">Loading dictionary…</span>`;
  const q = quick().length;

  return `<div class="proof">
    <section class="card proof-head">
      <div>
        <h3>Spelling and grammar</h3>
        <p class="muted">Checked in your browser as you type. Names, acronyms and technical terms are skipped.</p>
        <p class="counts"><span class="count fail">${plural(n.spelling, "spelling")}</span><span class="count warn">${plural(n.grammar, "grammar")}</span><span class="count info">${plural(n.style, "style")}</span></p>
      </div>
      <div class="proof-tools">
        <div class="seg" role="group" aria-label="Dictionary">
          <button class="${state.lang === "en-GB" ? "on" : ""}" data-action="set-lang" data-lang="en-GB">British English</button>
          <button class="${state.lang === "en-US" ? "on" : ""}" data-action="set-lang" data-lang="en-US">American English</button>
        </div>
        ${status}
        ${q ? `<button class="btn btn-primary btn-sm" data-action="fix-all">Apply ${plural(q, "one-click fix", "one-click fixes")}</button>` : ""}
      </div>
    </section>

    ${
      p.issues.length
        ? `<ul class="issues">${["spelling", "grammar", "style"].flatMap(by).map(issueCard).join("")}</ul>`
        : `<section class="card empty"><div class="big-tick">✓</div><h3>${p.spellReady || p.failed ? "No mistakes found" : "Checking…"}</h3><p class="muted">${p.spellReady ? "Spelling and grammar both look clean." : p.failed ? "Grammar rules passed. Spelling could not be checked." : "The dictionary is still loading."}</p></section>`
    }

    <section class="card">
      <div class="card-head">
        <div><h3>AI deep proofread</h3><p class="muted">A second read by Claude for things rules miss: awkward phrasing, wrong words that are spelt correctly, and tense slips.</p></div>
        ${derived.ai ? `<button class="btn" data-action="ai-proof" ${aiBusy ? "disabled" : ""}>${aiBusy ? "Reading…" : "Run AI proofread"}</button>` : ""}
      </div>
      ${derived.ai ? "" : `<p class="note">AI is switched off. Add your Anthropic API key to the <code>.env</code> file and restart to use this. Everything above works without it.</p>`}
      ${
        aiIssues
          ? aiIssues.length
            ? `<ul class="issues">${aiIssues
                .map(
                  (x, i) => `<li class="issue grammar">
                    <p class="issue-context"><del>${esc(x.original)}</del> → <ins>${esc(x.suggestion)}</ins></p>
                    <p class="issue-msg">${esc(x.reason)}</p>
                    <div class="row"><button class="btn btn-sm btn-primary" data-action="ai-apply" data-i="${i}">Apply</button><button class="btn btn-sm btn-ghost" data-action="ai-dismiss" data-i="${i}">Dismiss</button></div>
                  </li>`
                )
                .join("")}</ul>`
            : `<p class="muted">Claude found nothing else to change.</p>`
          : ""
      }
    </section>

    ${
      state.personalDict.length || state.ignored.length
        ? `<section class="card"><h3>Your dictionary</h3>
            <div class="chips">${state.personalDict.map((w) => `<button class="chip" data-action="del-word" data-word="${esc(w)}" title="Remove from dictionary">${esc(w)} ✕</button>`).join("") || `<span class="muted small">No words added.</span>`}</div>
            ${state.ignored.length ? `<p><button class="btn btn-sm btn-ghost" data-action="clear-ignored">Show ${plural(state.ignored.length, "ignored issue")} again</button></p>` : ""}
          </section>`
        : ""
    }
  </div>`;
}

const find = (id) => derived.proof.issues.find((i) => i.id === id);

export const actions = {
  "apply-issue"(el) {
    const i = find(el.dataset.id);
    if (i && applyIssue(state.cv, i, el.dataset.rep)) ctx.recompute();
    else toast("That text has changed. Check it in the editor.");
  },
  "ignore-issue"(el) {
    state.ignored.push(el.dataset.id);
    ctx.recompute();
  },
  "add-word"(el) {
    const w = el.dataset.word.toLowerCase();
    if (!state.personalDict.includes(w)) state.personalDict.push(w);
    ctx.recompute();
  },
  "del-word"(el) {
    state.personalDict = state.personalDict.filter((w) => w !== el.dataset.word);
    ctx.recompute();
  },
  "clear-ignored"() {
    state.ignored = [];
    ctx.recompute();
  },
  "set-lang"(el) {
    state.lang = el.dataset.lang;
    ctx.recompute();
  },
  "fix-all"() {
    // Work from the end of each piece of text so earlier positions stay valid.
    const list = quick().sort((a, b) => (a.path.join(".") === b.path.join(".") ? b.index - a.index : a.path.join(".") < b.path.join(".") ? -1 : 1));
    let n = 0;
    for (const i of list) if (applyIssue(state.cv, i, i.suggestions[0])) n++;
    ctx.recompute();
    toast(`${plural(n, "fix", "fixes")} applied`);
  },
  async "ai-proof"() {
    aiBusy = true;
    ctx.render();
    try {
      const r = await ai("proofread", { text: cvToText(state.cv) });
      aiIssues = (r.issues || []).filter((x) => x.original && x.suggestion && x.original !== x.suggestion);
    } finally {
      aiBusy = false;
      ctx.render();
    }
  },
  "ai-apply"(el) {
    const x = aiIssues[el.dataset.i];
    if (applyPhrase(state.cv, x.original, x.suggestion)) aiIssues.splice(el.dataset.i, 1);
    else toast("Could not find that exact text. Change it in the editor.");
    ctx.recompute();
  },
  "ai-dismiss"(el) {
    aiIssues.splice(el.dataset.i, 1);
    ctx.render();
  },
};
