// Spelling and grammar checking. Runs entirely in the browser.
import { kindOf } from "./model.js";
import { getPath, setPath } from "./util.js";
import { SKILLS } from "./ats.js";

/* ---------- dictionary worker ---------- */

let worker = null;
let lang = "";
let status = "idle"; // loading | ready | failed
const known = new Map(); // "lang:word" -> true/false
const sugg = new Map(); // "lang:word" -> [suggestions]
const asked = new Set();
let onChange = () => {};
export const setProofListener = (fn) => (onChange = fn);

function ensureWorker(l) {
  if (worker && lang === l) return;
  if (worker) worker.terminate();
  lang = l;
  status = "loading";
  asked.clear();
  try {
    worker = new Worker(new URL("./spell-worker.js", import.meta.url));
  } catch {
    status = "failed";
    return;
  }
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.lang !== lang) return;
    if (m.type === "ready") status = "ready";
    else if (m.type === "failed") status = "failed";
    else if (m.type === "checked") for (const [w, ok] of m.results) known.set(`${lang}:${w}`, ok);
    else if (m.type === "suggested") sugg.set(`${lang}:${m.word}`, m.suggestions);
    onChange();
  };
  worker.onerror = () => {
    status = "failed";
    onChange();
  };
  worker.postMessage({ type: "init", lang: l });
}

/* ---------- what gets checked ---------- */

export function unitsOf(cv) {
  const u = [];
  if (cv.title) u.push({ path: ["title"], label: "Headline", text: cv.title, kind: "heading" });
  cv.sections.forEach((s, si) => {
    const k = kindOf(s.type);
    if (k === "text") {
      if (s.text) u.push({ path: ["sections", si, "text"], label: s.title, text: s.text, kind: "para" });
    } else if (k === "list") {
      s.list.forEach((t, li) => u.push({ path: ["sections", si, "list", li], label: s.title, text: t, kind: "list" }));
    } else {
      s.items.forEach((it, ii) => {
        const base = ["sections", si, "items", ii];
        const label = it.heading || s.title;
        const ended = Boolean(it.date) && !/present|current|now|ongoing|to date/i.test(it.date);
        if (it.heading) u.push({ path: [...base, "heading"], label, text: it.heading, kind: "heading" });
        if (it.sub) u.push({ path: [...base, "sub"], label, text: it.sub, kind: "heading" });
        if (it.text) u.push({ path: [...base, "text"], label, text: it.text, kind: "para" });
        it.bullets.forEach((b, bi) => u.push({ path: [...base, "bullets", bi], label, text: b, kind: "bullet", ended }));
      });
    }
  });
  return u;
}

const ALLOW = new Set([
  ...SKILLS,
  ..."cvclarity linkedin github gitlab onboarding offboarding upskilling upskill kpi kpis okr okrs roadmap roadmaps backlog workflow workflows dataset datasets stakeholder stakeholders timeline timelines ecommerce inbox onsite hons msc bsc phd mba gcse gcses btec nvq cipd acca cima wms sku skus saas api apis ui ux app apps email emails online website websites username login admin covid etc ltd plc inc hoc annum rata via proactively proactive scalable scalability dashboards dashboard frontend backend fullstack devops microservice microservices repo repos chatbot chatbots analytics omnichannel multichannel signposting timeboxed wireframes wireframe prototyped rota rotas payroll helpdesk".split(
    " "
  ),
]);

function spellTokens(u) {
  if (u.kind === "heading") return [];
  const out = [];
  for (const chunk of u.text.matchAll(/\S+/g)) {
    if (/[@/\\\d]|www\.|\.(com|co|org|net|io|uk)\b/i.test(chunk[0])) continue;
    for (const m of chunk[0].matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)*/g)) {
      const word = m[0];
      const index = chunk.index + m.index;
      if (word.length < 3 || word === word.toUpperCase() || /[a-z][A-Z]/.test(word)) continue;
      if (/^[A-Z]/.test(word) && u.kind !== "list") {
        const before = u.text.slice(0, index).trimEnd();
        if (before && !/[.!?:]$/.test(before)) continue; // mid-sentence capital: treat as a name
      }
      out.push({ word, index });
    }
  }
  return out;
}

function properWords(cv) {
  const set = new Set();
  const take = (t) => (String(t || "").match(/[A-Za-z]+/g) || []).forEach((w) => /^[A-Z]/.test(w) && set.add(w.toLowerCase()));
  take(cv.name);
  take(cv.contact.location);
  cv.sections.forEach((s) => s.items.forEach((it) => take(it.sub)));
  return set;
}

/* ---------- grammar and style rules ---------- */

const matchCase = (src, rep) => (src === src.toUpperCase() && src.length > 1 ? rep.toUpperCase() : /^[A-Z]/.test(src) ? rep[0].toUpperCase() + rep.slice(1) : rep);

const CONFUSIONS = [
  [/\b(could|should|would|must|might) of\b/gi, (m) => `${m[1]} have`, "Use “have”, not “of”."],
  [/\balot\b/gi, () => "a lot", "“A lot” is two words."],
  [/\bmanger(s?)\b/gi, (m) => `manager${m[1]}`, "A “manger” is a feeding trough. Did you mean “manager”?"],
  [/\bpubic\b/gi, () => "public", "Did you mean “public”?"],
  [/\bcostumers?\b/gi, (m) => m[0].toLowerCase().replace("costumer", "customer"), "Did you mean “customer”?"],
  [/\b(more|less|better|rather|other|greater|fewer|higher|lower|faster) then\b/gi, (m) => `${m[1]} than`, "Use “than” for comparisons."],
  [/\bprinciple (engineer|consultant|analyst|designer|developer|architect|scientist|officer|investigator)\b/gi, (m) => `principal ${m[1]}`, "The job title is “principal”."],
  [/\b(this|my|current|previous|the) roll\b/gi, (m) => `${m[1]} role`, "A job is a “role”."],
  [/\bresponsible of\b/gi, () => "responsible for", "The phrase is “responsible for”."],
  [/\bect\b\.?/gi, () => "etc.", "The abbreviation is “etc.”"],
  [/\bthere (team|company|business|customers|clients|staff|needs|goals)\b/gi, (m) => `their ${m[1]}`, "Use “their” for belonging."],
  [/\b(\w+) years experience\b/gi, (m) => `${m[1]} years' experience`, "Add an apostrophe: “years' experience” (or “years of experience”)."],
  [/\bfast paced\b/gi, () => "fast-paced", "Hyphenate “fast-paced” before a noun."],
  [/\bday to day\b/gi, () => "day-to-day", "Hyphenate “day-to-day” before a noun."],
];

const UK_US = [
  ["colour", "color"], ["behaviour", "behavior"], ["labour", "labor"], ["favour", "favor"], ["honour", "honor"], ["neighbour", "neighbor"], ["endeavour", "endeavor"],
  ["catalogue", "catalog"], ["travelled", "traveled"], ["travelling", "traveling"], ["modelling", "modeling"], ["modelled", "modeled"], ["cancelled", "canceled"],
  ["labelled", "labeled"], ["counselling", "counseling"], ["defence", "defense"], ["centre", "center"], ["centres", "centers"], ["centred", "centered"],
  ["theatre", "theater"], ["fibre", "fiber"], ["enrolment", "enrollment"], ["fulfil", "fulfill"], ["skilful", "skillful"], ["programme", "program"], ["programmes", "programs"],
];
const IZE = /\b(organi|optimi|speciali|prioriti|standardi|moderni|minimi|maximi|recogni|utili|summari|centrali|digiti|customi|finali|visuali|authori|categori|emphasi|familiari|formali|generali|mobili|normali|personali|rationali|reorgani|stabili|strategi|synchroni|capitali|characteri|commerciali|computeri|economi|globali|harmoni|incentivi|initiali|locali|moneti|revolutioni|subsidi)([sz])(e|ed|es|ing|ation|ations|er|ers)\b/gi;
const ANALY = /\banaly([sz])(e|ed|ing)\b/gi;

const IRREGULAR = { lead: "led", run: "ran", build: "built", write: "wrote", oversee: "oversaw", drive: "drove", grow: "grew", win: "won", sell: "sold", teach: "taught", hold: "held", make: "made", take: "took", bring: "brought", begin: "began", undertake: "undertook", deal: "dealt", meet: "met", keep: "kept", find: "found", give: "gave", speak: "spoke", plan: "planned", ship: "shipped", spend: "spent", send: "sent", buy: "bought", put: "put", set: "set", cut: "cut" };
const REGULAR = "manage develop create design deliver coordinate support maintain provide ensure prepare work assist help train monitor review produce organise organize analyse analyze implement improve process handle report liaise negotiate conduct perform supervise serve answer resolve schedule order track test update collaborate communicate present research recruit operate mentor coach direct execute generate identify increase reduce launch own partner supply respond carry apply";
export const pastOf = (v) => IRREGULAR[v] || (v.endsWith("e") ? v + "d" : /[^aeiou]y$/.test(v) ? v.slice(0, -1) + "ied" : v + "ed");
const PRESENT = new Set([...REGULAR.split(" "), ...Object.keys(IRREGULAR)].filter((v) => pastOf(v) !== v));

const AN_OK = /^(hour|honest|honour|honor|heir|mba|msc|hr|html|nhs|sql|sme|ftse|fmcg|seo|rfp|rfi|nvq|sla|mvp|hnd|hnc|x-ray|[fhlmnrsx]\b)/i;
const A_OK = /^(uni|use|user|usu|util|one|once|euro|eu\b|ubiq|uk\b|us\b|usa\b|u-)/i;

function rules(u, l) {
  const out = [];
  const t = u.text;
  const add = (index, word, kind, rule, message, ...suggestions) => out.push({ index, length: word.length, word, kind, rule, message, suggestions });
  const prose = u.kind === "para" || u.kind === "bullet";

  for (const [re, fix, msg] of CONFUSIONS) for (const m of t.matchAll(re)) add(m.index, m[0], "grammar", "confusion", msg, matchCase(m[0], fix(m)));

  // Spelling variant for the chosen language.
  const uk = l !== "en-US";
  const swap = (m, pos) => {
    const ch = m[0][pos];
    const isZ = ch.toLowerCase() === "z";
    if (uk !== isZ) return;
    const rep = isZ ? (ch === "Z" ? "S" : "s") : ch === "S" ? "Z" : "z";
    add(m.index, m[0], uk ? "style" : "spelling", "variant", uk ? "US spelling. Most UK employers expect “-ise”." : "UK spelling. US English uses “-ize”.", m[0].slice(0, pos) + rep + m[0].slice(pos + 1));
  };
  for (const m of t.matchAll(IZE)) swap(m, m[1].length);
  for (const m of t.matchAll(ANALY)) swap(m, 5);
  for (const [ukw, usw] of UK_US) {
    const [bad, good] = uk ? [usw, ukw] : [ukw, usw];
    if (uk && (bad === "program" || bad === "programs")) continue; // "program" is correct for software
    for (const m of t.matchAll(new RegExp(`\\b${bad}(s|ed|ing|ful|ite|ites)?\\b`, "gi")))
      add(m.index, m[0], "spelling", "variant", uk ? "US spelling." : "UK spelling.", matchCase(m[0], good + (m[1] || "")));
  }

  if (!prose) return out;

  for (const m of t.matchAll(/\b([A-Za-z]+)\s+\1\b/gi)) if (!/^(had|that)$/i.test(m[1])) add(m.index, m[0], "grammar", "repeat", "Repeated word.", m[1]);
  for (const m of t.matchAll(/ {2,}/g)) add(m.index, m[0], "grammar", "spaces", "Extra space.", " ");
  for (const m of t.matchAll(/\s+([,;:!?]|\.(?!\w))/g)) add(m.index, m[0], "grammar", "space-before", "No space before punctuation.", m[1]);
  for (const m of t.matchAll(/([A-Za-z])([,;])([A-Za-z])/g)) add(m.index, m[0], "grammar", "space-after", "Add a space after the punctuation.", `${m[1]}${m[2]} ${m[3]}`);
  for (const m of t.matchAll(/(^|\s)i(?=\s|['’]|$)/g)) add(m.index + m[1].length, "i", "grammar", "lower-i", "“I” is always a capital.", "I");
  for (const m of t.matchAll(/\ba\s+([aeio][A-Za-z-]*|u[A-Za-z-]*)/gi))
    if (!A_OK.test(m[1]) && /^a$/i.test(m[0][0])) add(m.index, m[0], "grammar", "a-an", "Use “an” before a vowel sound.", `${matchCase(m[0][0], "an")} ${m[1]}`);
  for (const m of t.matchAll(/\ban\s+([b-df-hj-np-tv-z][A-Za-z-]*)/gi)) if (!AN_OK.test(m[1])) add(m.index, m[0], "grammar", "a-an", "Use “a” before a consonant sound.", `${matchCase(m[0][0], "a")} ${m[1]}`);
  for (const m of t.matchAll(/!+/g)) add(m.index, m[0], "style", "exclaim", "Avoid exclamation marks in a CV.", ".");

  if (/^[a-z][a-z]/.test(t)) add(0, t[0], "grammar", "capital", "Start with a capital letter.", t[0].toUpperCase());
  for (const m of t.matchAll(/([a-z]{3}[.!?])\s+([a-z])/g)) if (!/\b(etc|e\.g|i\.e)\.$/i.test(m[1])) add(m.index + m[0].length - 1, m[2], "grammar", "capital", "Start the sentence with a capital letter.", m[2].toUpperCase());

  if (u.kind === "bullet" && u.ended) {
    const m = t.match(/^[A-Za-z]+/);
    if (m) {
      const w = m[0].toLowerCase();
      const base = PRESENT.has(w) ? w : w.endsWith("s") && PRESENT.has(w.slice(0, -1)) ? w.slice(0, -1) : null;
      if (base) add(0, m[0], "grammar", "tense", "This role has ended, so use the past tense.", matchCase(m[0], pastOf(base)));
    }
  }
  return out;
}

function bulletStops(units, issues) {
  const bullets = units.filter((u) => u.kind === "bullet" && u.text.trim().length > 3);
  const withStop = bullets.filter((u) => /\.\s*$/.test(u.text));
  if (!withStop.length || withStop.length === bullets.length) return;
  const useStops = withStop.length > bullets.length / 2;
  for (const u of bullets) {
    const has = /\.\s*$/.test(u.text);
    if (has === useStops) continue;
    const end = u.text.trimEnd().length;
    issues.push(
      useStops
        ? { u, index: end, length: 0, word: "", kind: "style", rule: "bullet-stop", message: "Most of your bullet points end with a full stop. This one does not.", suggestions: ["."] }
        : { u, index: end - 1, length: 1, word: ".", kind: "style", rule: "bullet-stop", message: "Most of your bullet points have no full stop. Be consistent.", suggestions: [""] }
    );
  }
}

/* ---------- the check ---------- */

export function proofread(cv, { lang: l = "en-GB", ignored = [], personalDict = [] } = {}) {
  ensureWorker(l);
  const units = unitsOf(cv);
  const proper = properWords(cv);
  const personal = new Set(personalDict.map((w) => w.toLowerCase()));
  const issues = [];
  const toCheck = new Set();
  const toSuggest = new Set();

  for (const u of units) {
    const found = rules(u, l);
    for (const tok of spellTokens(u)) {
      const lw = tok.word.toLowerCase().replace(/’/g, "'");
      if (ALLOW.has(lw) || proper.has(lw) || personal.has(lw)) continue;
      if (found.some((f) => tok.index < f.index + f.length && f.index < tok.index + tok.word.length)) continue;
      const key = `${l}:${tok.word}`;
      if (!known.has(key)) {
        toCheck.add(tok.word);
        continue;
      }
      if (known.get(key)) continue;
      const s = sugg.get(key);
      if (!s) toSuggest.add(tok.word);
      found.push({
        index: tok.index,
        length: tok.word.length,
        word: tok.word,
        kind: "spelling",
        rule: "spell",
        message: `“${tok.word}” is not in the ${l === "en-US" ? "US" : "UK"} English dictionary.`,
        suggestions: s ? s.map((x) => matchCase(tok.word, x)) : null,
      });
    }
    found.sort((a, b) => a.index - b.index);
    for (const f of found) issues.push({ ...f, u });
  }
  bulletStops(units, issues);

  if (worker && status !== "failed") {
    const words = [...toCheck].filter((w) => !asked.has("c:" + w));
    if (words.length) {
      words.forEach((w) => asked.add("c:" + w));
      worker.postMessage({ type: "check", words });
    }
    for (const w of toSuggest) {
      if (asked.has("s:" + w)) continue;
      asked.add("s:" + w);
      worker.postMessage({ type: "suggest", word: w });
    }
  }

  const skip = new Set(ignored);
  const list = issues
    .map(({ u, ...i }) => ({ ...i, path: u.path, label: u.label, text: u.text, id: `${i.rule}|${i.word.toLowerCase()}|${u.path.join(".")}` }))
    .filter((i) => !skip.has(i.id));
  return { issues: list, spellReady: status === "ready", loading: status === "loading" || (status === "ready" && toCheck.size > 0), failed: status === "failed", lang: l };
}

/** Replaces the flagged text with the chosen correction. */
export function applyIssue(cv, issue, replacement) {
  const text = getPath(cv, issue.path);
  if (typeof text !== "string") return false;
  let i = issue.index;
  if (text.substr(i, issue.length) !== issue.word) {
    i = issue.word ? text.indexOf(issue.word) : -1;
    if (i < 0) return false;
  }
  setPath(cv, issue.path, text.slice(0, i) + replacement + text.slice(i + issue.length));
  return true;
}

/** Used by the AI proofreader: swaps an exact phrase wherever it first appears. */
export function applyPhrase(cv, original, replacement) {
  for (const u of unitsOf(cv)) {
    const i = u.text.indexOf(original);
    if (i < 0) continue;
    setPath(cv, u.path, u.text.slice(0, i) + replacement + u.text.slice(i + original.length));
    return true;
  }
  return false;
}
