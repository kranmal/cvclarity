// ATS and content checks. Every check returns pass / warn / fail with a plain-English reason.
import { allBullets, cvToText, sectionsOf } from "./model.js";
import { wordCount, plural } from "./util.js";

export const ACTION_VERBS = new Set(
  `accelerated achieved acquired adapted administered advised analysed analyzed appointed approved arranged assembled assessed audited automated balanced boosted briefed budgeted built calculated captured chaired championed coached collaborated completed conceived conducted consolidated constructed consulted controlled converted coordinated co-ordinated created cut decreased defined delivered demonstrated deployed designed developed devised diagnosed directed doubled drafted drove earned edited eliminated enabled engineered enhanced ensured established evaluated exceeded executed expanded expedited facilitated forecast forecasted formulated founded generated grew guided halved headed hired identified implemented improved increased initiated inspected installed instructed integrated introduced investigated launched led liaised maintained managed mapped maximised maximized mentored migrated minimised minimized modernised modernized monitored motivated negotiated onboarded operated optimised optimized orchestrated organised organized overhauled oversaw partnered performed piloted pioneered planned prepared presented prioritised prioritized processed procured produced programmed promoted proposed provided published purchased raised rebuilt recommended recruited redesigned reduced refined reorganised reorganized replaced reported represented researched resolved restructured revamped reviewed saved scheduled secured served set shaped simplified sold solved spearheaded standardised standardized steered streamlined strengthened structured supervised supported surpassed taught tested tracked trained transformed translated tripled uncovered unified upgraded validated won wrote`.split(
    /\s+/
  )
);

export const WEAK_PHRASES = ["responsible for", "duties included", "duties include", "helped to", "helped with", "helped", "worked on", "assisted with", "assisted in", "tasked with", "involved in", "in charge of", "participated in", "was required to"];

export const CLICHES = ["team player", "hard-working", "hard working", "hardworking", "results-driven", "results driven", "results-oriented", "detail-oriented", "detail oriented", "self-starter", "self starter", "go-getter", "think outside the box", "synergy", "dynamic", "passionate", "highly motivated", "motivated individual", "fast learner", "quick learner", "excellent communication skills", "works well under pressure", "proven track record", "go above and beyond"];

export const SKILLS = `python java javascript typescript sql nosql html css react angular vue node.js node c# c++ .net php ruby go golang rust swift kotlin scala r matlab sas spss stata excel vba power bi powerbi tableau looker qlik aws azure gcp google cloud docker kubernetes terraform ansible jenkins git github gitlab ci/cd devops linux unix bash api rest graphql microservices agile scrum kanban jira confluence salesforce hubspot sap oracle netsuite workday sage xero quickbooks erp crm etl data analysis data analytics data science machine learning deep learning nlp statistics forecasting modelling financial modelling budgeting accounting bookkeeping payroll auditing ifrs gaap reconciliation variance analysis project management programme management prince2 pmp stakeholder management change management risk management vendor management supplier management procurement supply chain logistics inventory management warehouse management lean six sigma continuous improvement process improvement quality assurance qa testing test automation selenium cypress playwright ux ui figma sketch adobe photoshop illustrator indesign seo sem ppc google analytics google ads content marketing email marketing social media copywriting brand management market research product management roadmap business development account management sales lead generation negotiation customer service customer success client relationship recruitment talent acquisition onboarding employee relations performance management training coaching mentoring leadership team management line management people management communication presentation reporting compliance gdpr health and safety safeguarding nhs clinical patient care teaching curriculum lesson planning cyber security cybersecurity networking active directory itil service desk troubleshooting autocad solidworks cad microsoft office powerpoint word outlook sharepoint teams bilingual fluent strategy strategic planning kpis okrs p&l cost reduction revenue growth b2b b2c saas e-commerce ecommerce`
  .split(/\s+(?=[a-z.&#+/0-9-]+(?:\s|$))/)
  .map((s) => s.trim());

// Multi-word skills are matched as phrases.
const SKILL_PHRASES = [
  "power bi", "google cloud", "data analysis", "data analytics", "data science", "machine learning", "deep learning", "financial modelling", "variance analysis", "project management", "programme management",
  "stakeholder management", "change management", "risk management", "vendor management", "supplier management", "supply chain", "inventory management", "warehouse management", "six sigma", "continuous improvement",
  "process improvement", "quality assurance", "test automation", "google analytics", "google ads", "content marketing", "email marketing", "social media", "brand management", "market research", "product management",
  "business development", "account management", "lead generation", "customer service", "customer success", "client relationship", "talent acquisition", "employee relations", "performance management", "team management",
  "line management", "people management", "health and safety", "patient care", "lesson planning", "cyber security", "active directory", "service desk", "microsoft office", "strategic planning", "cost reduction", "revenue growth",
];
// Words that only mean something as part of a phrase above.
const GENERIC = new Set(
  `and management data analysis analytics science machine learning deep power bi google cloud financial variance project programme stakeholder change risk vendor supplier supply chain inventory warehouse six sigma continuous improvement process quality assurance test automation content email social media brand market research product business development account lead generation customer service success client relationship talent acquisition employee relations performance team line people health safety patient care lesson planning cyber security active directory desk microsoft office strategic cost reduction revenue growth word teams go r node adobe fluent`.split(/\s+/)
);
const SKILL_SET = new Set([...SKILLS.filter((s) => s && !s.includes(" ") && !GENERIC.has(s)), ...SKILL_PHRASES]);

const STOP = new Set(
  `a about above across after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each etc few for from further had has have having he her here hers him his how i if in into is it its itself just like may me more most must my no nor not of off on once only or other our ours out over own per same she should so some such than that the their theirs them then there these they this those through to too under until up us very was we were what when where which while who whom why will with within without would you your yours yourself
  able ability including include includes work working role roles team teams join joining looking seeking ideal candidate candidates successful applicant applicants apply application required requirements requirement essential desirable preferred experience experienced years year strong excellent good great new company business opportunity opportunities position job responsibilities responsibility duties skills skill knowledge using use used well ensure ensuring provide providing support supporting help day days week time full part based across within range high level key make need needs needed want must plus etc salary benefits holiday pension equal employer please click hours competitive offer offers us uk`.split(/\s+/)
);

/* ---------- keyword matching ---------- */

const stem = (w) => {
  let s = w.toLowerCase();
  if (s.length > 5) s = s.replace(/(isation|ization)$/, "ise").replace(/(ising|izing)$/, "ise").replace(/(ised|ized)$/, "ise").replace(/ize$/, "ise");
  if (s.length > 5 && s.endsWith("ing")) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith("ies")) s = s.slice(0, -3) + "y";
  else if (s.length > 4 && s.endsWith("ed")) s = s.slice(0, -2);
  else if (s.length > 4 && s.endsWith("es") && !s.endsWith("ses")) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith("s") && !s.endsWith("ss")) s = s.slice(0, -1);
  if (s.length > 4 && s.endsWith("e")) s = s.slice(0, -1);
  return s;
};
const tokens = (t) => (String(t).toLowerCase().match(/[a-z][a-z0-9+#.&/-]*[a-z0-9+#]|[a-z]/g) || []).map((w) => w.replace(/\.$/, ""));
const stemPhrase = (p) => tokens(p).map(stem).join(" ");

/** Pulls the keywords that matter from a job description and checks them against the CV. */
export function matchKeywords(cvText, jdText) {
  const jdTok = tokens(jdText);
  if (jdTok.length < 15) return null;
  const cvStems = " " + tokens(cvText).map(stem).join(" ") + " ";
  const jdLower = " " + jdTok.join(" ") + " ";

  const found = new Map(); // keyword -> {count, skill}
  const add = (kw, count, skill) => {
    const k = kw.trim();
    if (!k || found.has(k)) return;
    found.set(k, { count, skill });
  };
  const countOf = (phrase) => jdLower.split(" " + phrase + " ").length - 1;

  for (const s of SKILL_SET) {
    const n = countOf(s);
    if (n) add(s, n, true);
  }
  // Frequent phrases and words that are not filler.
  const freq = new Map();
  jdTok.forEach((w, i) => {
    if (!STOP.has(w) && w.length > 2 && !/^\d/.test(w)) freq.set(w, (freq.get(w) || 0) + 1);
    const next = jdTok[i + 1];
    if (next && !STOP.has(w) && !STOP.has(next) && w.length > 2 && next.length > 2) {
      const bg = `${w} ${next}`;
      freq.set(bg, (freq.get(bg) || 0) + 1);
    }
  });
  [...freq.entries()]
    .filter(([k, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, 40)
    .forEach(([k, n]) => {
      // skip single words already covered by a phrase keyword
      if (!k.includes(" ") && [...found.keys()].some((f) => f.includes(" ") && f.split(" ").includes(k))) return;
      add(k, n, false);
    });

  const list = [...found.entries()]
    .map(([keyword, v]) => ({ keyword, ...v, matched: cvStems.includes(" " + stemPhrase(keyword) + " ") }))
    .sort((a, b) => Number(b.skill) - Number(a.skill) || b.count - a.count)
    .slice(0, 36);
  if (!list.length) return null;
  const weight = (k) => (k.skill ? 2 : 1) * Math.min(k.count, 3);
  const total = list.reduce((s, k) => s + weight(k), 0);
  const got = list.filter((k) => k.matched).reduce((s, k) => s + weight(k), 0);
  return {
    percent: Math.round((got / total) * 100),
    matched: list.filter((k) => k.matched),
    missing: list.filter((k) => !k.matched),
    missingSkills: list.filter((k) => !k.matched && k.skill),
  };
}

/* ---------- helpers for content checks ---------- */

const firstWord = (b) => (b.trim().match(/^[A-Za-z-]+/) || [""])[0].toLowerCase();
const hasNumber = (b) => /\d|%|£|\$|€|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|twenty|fifty|hundred|thousand|million)\b/i.test(b);
export const bulletProblems = (b) => {
  const out = [];
  const lower = b.toLowerCase();
  if (WEAK_PHRASES.some((p) => lower.startsWith(p) || lower.includes(" " + p + " "))) out.push("weak opening");
  else if (!ACTION_VERBS.has(firstWord(b))) out.push("no action verb");
  if (!hasNumber(b)) out.push("no figures");
  if (wordCount(b) > 35) out.push("too long");
  if (/\b(I|my|me)\b/.test(b)) out.push("first person");
  return out;
};

function dateStyle(d) {
  const start = d.split(/\s*(?:[-–—]+|\bto\b|\buntil\b)\s*/i)[0].trim();
  if (/^\d{1,2}[/.]\d{4}$/.test(start)) return "numbers (03/2017)";
  if (/^(19|20)\d{2}$/.test(start)) return "year only (2017)";
  if (/^[A-Za-z]{3}\.?,?\s+\d{4}$/.test(start)) return "short month (Mar 2017)";
  if (/^[A-Za-z]{4,},?\s+\d{4}$/.test(start)) return "full month (March 2017)";
  return "other";
}
const startYear = (d) => Number((d.match(/(19|20)\d{2}/) || [0])[0]);
const endYear = (d) => (/present|current|now|ongoing|date/i.test(d) ? 9999 : Number((d.match(/(19|20)\d{2}/g) || [0]).pop()));

export const PERSONAL = /\b(date of birth|d\.?o\.?b\.?|born on|age\s*:|marital status|nationality|national insurance|ni number|gender\s*:|religion|passport number|photo)\b/i;

/* ---------- the analysis ---------- */

export const CATEGORIES = [
  { id: "parsing", name: "ATS parsing", blurb: "Can the software read and file your details?" },
  { id: "format", name: "Structure and layout", blurb: "Length, sections and bullet points" },
  { id: "content", name: "Content quality", blurb: "Impact, wording and accuracy" },
];

export function analyse({ cv, raw, jd, proof, useTemplate }) {
  const checks = [];
  const sig = (raw && raw.signals) || {};
  const text = cvToText(cv);
  const words = wordCount(text);
  const bullets = allBullets(cv);
  const exp = sectionsOf(cv, "experience");
  const expItems = exp.flatMap((s) => s.items);
  const add = (id, cat, weight, status, title, detail, fix) => checks.push({ id, cat, weight, status, title, detail, fix });
  const fixedNote = " You are using an ATS-safe cvclarity template, so the file you download will not have this problem.";

  /* --- parsing --- */
  if (sig.scanned) add("p-text", "parsing", 4, "fail", "No readable text found", "This file looks like a scanned image. An ATS would see a blank page. Rebuild the CV as real text in the editor.", { tab: "editor", label: "Open editor" });
  else add("p-text", "parsing", 4, "pass", "Text can be read", `${words} words were extracted as real text.`);

  if (sig.fileType === "pdf" || sig.fileType === "docx") add("p-file", "parsing", 1, "pass", `File type is ${sig.fileType.toUpperCase()}`, "PDF and DOCX are the two formats every major ATS accepts.");
  else add("p-file", "parsing", 1, "info", "Download as PDF or DOCX", "You pasted text or started from scratch. When you download from here you get a text-based PDF or a DOCX, the two formats every major ATS accepts.");

  if (sig.multiColumn)
    useTemplate
      ? add("p-cols", "parsing", 3, "pass", "Single-column layout", "Your original file used columns." + fixedNote)
      : add("p-cols", "parsing", 3, "fail", "Multi-column layout detected", "Many ATS read straight across the page, so text from two columns gets mixed together. Use a single-column layout.", { action: "use-template", label: "Use ATS-safe template" });
  else add("p-cols", "parsing", 3, "pass", "Single-column layout", "Text runs top to bottom in one column, which is the order an ATS reads it.");

  if (sig.hasTables)
    useTemplate
      ? add("p-tables", "parsing", 2, "pass", "No tables", "Your original file used tables." + fixedNote)
      : add("p-tables", "parsing", 2, "warn", "Tables detected", "Some ATS skip or scramble text inside tables. Keep content in normal paragraphs and bullet points.", { action: "use-template", label: "Use ATS-safe template" });
  else add("p-tables", "parsing", 2, "pass", "No tables", "Content is not locked inside tables.");

  if (sig.hasImages)
    useTemplate
      ? add("p-img", "parsing", 1, "pass", "No images", "Your original file had images." + fixedNote)
      : add("p-img", "parsing", 1, "warn", "Images or graphics detected", "Photos, logos, icons and skill bars are invisible to an ATS, and any text inside them is lost.", { action: "use-template", label: "Use ATS-safe template" });
  else add("p-img", "parsing", 1, "pass", "No images or graphics", "Nothing is hidden inside pictures.");

  const odd = text.match(/[-�]|[☀-➿]|[\u{1F300}-\u{1FAFF}]/gu) || [];
  if (odd.length) add("p-chars", "parsing", 1, "warn", "Unusual symbols found", `${plural(odd.length, "icon or special symbol")} may turn into gibberish when parsed. Use plain text and standard bullets. Downloads from here remove them.`);
  else add("p-chars", "parsing", 1, "pass", "No unusual symbols", "Only standard characters are used.");

  const has = (t) => sectionsOf(cv, t).some((s) => s.text || s.list.length || s.items.length);
  const missing = ["experience", "education", "skills"].filter((t) => !has(t));
  if (!missing.length) add("p-sections", "parsing", 3, "pass", "Key sections found", "Work experience, education and skills were all recognised.");
  else
    add("p-sections", "parsing", 3, missing.includes("experience") ? "fail" : "warn", `Missing section: ${missing.join(", ")}`, "An ATS files your details by section. Add the missing section, or rename its heading to a standard one so it is recognised.", { tab: "editor", label: "Add in editor" });

  const nonStd = cv.sections.filter((s) => s.nonStandard);
  if (nonStd.length)
    add("p-headings", "parsing", 2, "warn", "Non-standard section headings", `${nonStd.map((s) => `“${s.title}”`).join(", ")} may not be recognised. Use the headings an ATS expects, such as “Work Experience”, “Education” and “Skills”.`, { action: "fix-headings", label: "Rename for me" });
  else add("p-headings", "parsing", 2, "pass", "Standard section headings", "Every heading is one an ATS knows how to file.");

  const c = cv.contact;
  cv.name ? add("p-name", "parsing", 2, "pass", "Name found", `Read as “${cv.name}”.`) : add("p-name", "parsing", 2, "fail", "Name not found", "Put your full name on its own line at the very top, as plain text (not in a header, footer or image).", { tab: "editor", label: "Add name" });
  c.email ? add("p-email", "parsing", 3, "pass", "Email address found", c.email) : add("p-email", "parsing", 3, "fail", "Email address not found", "Recruiters can't reach you. If it is in your file, it may be inside a header, footer or text box where an ATS can't see it.", { tab: "editor", label: "Add email" });
  c.phone ? add("p-phone", "parsing", 2, "pass", "Phone number found", c.phone) : add("p-phone", "parsing", 2, "warn", "Phone number not found", "Add a mobile number near the top so it is picked up with your contact details.", { tab: "editor", label: "Add phone" });
  c.location ? add("p-loc", "parsing", 1, "pass", "Location found", c.location) : add("p-loc", "parsing", 1, "warn", "Location not found", "Town or city and country is enough (no full address). Many ATS filter candidates by location.", { tab: "editor", label: "Add location" });
  c.links.some((l) => /linkedin/i.test(l)) ? add("p-link", "parsing", 1, "pass", "LinkedIn profile included", "Written out as text so it survives parsing.") : add("p-link", "parsing", 1, "info", "No LinkedIn link", "Optional, but most recruiters look for one. Write the address out in full rather than hiding it behind an icon.", { tab: "editor", label: "Add link" });

  const dated = expItems.filter((i) => i.date);
  const undated = expItems.filter((i) => !i.date && (i.heading || i.bullets.length));
  const styles = [...new Set(cv.sections.flatMap((s) => s.items).filter((i) => i.date).map((i) => dateStyle(i.date)))];
  if (!expItems.length) add("p-dates", "parsing", 2, "info", "Dates", "No work history to check yet.");
  else if (undated.length) add("p-dates", "parsing", 2, "warn", "Some roles have no dates", `${plural(undated.length, "role")} without dates. An ATS uses dates to work out your years of experience.`, { tab: "editor", label: "Add dates" });
  else if (styles.length > 1) add("p-dates", "parsing", 2, "warn", "Dates are written in different styles", `Found ${styles.join(" and ")}. Pick one style, ideally “Mar 2017 – Dec 2019”, and use it everywhere.`, { tab: "editor", label: "Fix dates" });
  else add("p-dates", "parsing", 2, "pass", "Dates are consistent", "Every role has dates in one style.");

  if (dated.length > 1) {
    const ends = dated.map((i) => endYear(i.date) * 100 + (startYear(i.date) % 100));
    const ordered = ends.every((e, i) => i === 0 || e <= ends[i - 1]);
    ordered ? add("p-order", "parsing", 1, "pass", "Most recent role first", "Work history is in reverse-chronological order.") : add("p-order", "parsing", 1, "warn", "Work history is out of order", "Put your most recent role first. It is what both the ATS and recruiters expect.", { tab: "editor", label: "Reorder" });
  }

  if (sig.fileName && /pdf|docx/.test(sig.fileType)) {
    const base = sig.fileName.replace(/\.[^.]+$/, "");
    const generic = /^(cv|resume|document\d*|untitled|new|final|draft|doc\d*)([ _-]?(final|v?\d+|new|copy|draft))*$/i.test(base);
    generic ? add("p-fname", "parsing", 1, "warn", "File name is generic", `“${sig.fileName}” does not say whose CV it is. Downloads from here are named with your name automatically.`) : add("p-fname", "parsing", 1, "pass", "File name is clear", sig.fileName);
  }

  /* --- structure and layout --- */
  if (words < 250) add("f-length", "format", 2, "warn", "CV is very short", `${words} words. Most strong CVs are 400 to 800 words. Add detail on what you achieved in each role.`, { tab: "editor", label: "Fix in editor" });
  else if (words > 1100 || sig.pages > 2) add("f-length", "format", 2, "warn", "CV is long", `${words} words${sig.pages ? ` over ${sig.pages} pages` : ""}. Aim for two pages at most. Trim older roles to two or three bullet points.`, { tab: "editor", label: "Trim in editor" });
  else add("f-length", "format", 2, "pass", "Length is about right", `${words} words${sig.pages ? ` on ${plural(sig.pages, "page")}` : ""}.`);

  const summary = sectionsOf(cv, "summary").find((s) => s.text);
  const sw = summary ? wordCount(summary.text) : 0;
  if (!summary) add("f-summary", "format", 2, "warn", "No professional summary", "Open with three or four lines saying who you are and what you offer. It is the first thing a recruiter reads.", { tab: "editor", label: "Fix in editor" });
  else if (sw > 110) add("f-summary", "format", 2, "warn", "Summary is too long", `${sw} words. Keep it to 50 to 80 so it gets read.`, { tab: "editor", label: "Fix in editor" });
  else if (sw < 25) add("f-summary", "format", 2, "warn", "Summary is very short", `${sw} words. Aim for 50 to 80.`, { tab: "editor", label: "Fix in editor" });
  else add("f-summary", "format", 2, "pass", "Professional summary included", `${sw} words.`);

  if (expItems.length) {
    const noBullets = expItems.filter((i) => !i.bullets.length);
    noBullets.length ? add("f-bullets", "format", 2, noBullets.length === expItems.length ? "fail" : "warn", "Some roles have no bullet points", `${plural(noBullets.length, "role")} written as paragraphs or left empty. Bullet points are easier for software and people to scan.`, { tab: "editor", label: "Fix in editor" }) : add("f-bullets", "format", 2, "pass", "Bullet points used for every role", `${bullets.length} bullet points in total.`);

    const off = expItems.filter((i) => i.bullets.length && (i.bullets.length > 8 || i.bullets.length < 2));
    off.length ? add("f-bcount", "format", 1, "warn", "Uneven number of bullets", `${plural(off.length, "role")} with fewer than 2 or more than 8 bullet points. Three to six per role works best.`, { tab: "editor", label: "Edit roles" }) : add("f-bcount", "format", 1, "pass", "Sensible number of bullets per role", "Between two and eight for each role.");
  }
  const long = bullets.filter((b) => wordCount(b.text) > 35);
  if (bullets.length) long.length ? add("f-blen", "format", 1, "warn", "Some bullet points are too long", `${plural(long.length, "bullet point")} over 35 words. One or two lines each is the limit.`, { tab: "editor", label: "Fix in editor" }) : add("f-blen", "format", 1, "pass", "Bullet points are concise", "None run past 35 words.");

  const personalLines = [...(cv.headerExtra || []), text].join("\n").match(new RegExp(PERSONAL.source, "gi")) || [];
  if (personalLines.length) add("f-personal", "format", 2, "fail", "Personal details that should not be there", `Found: ${[...new Set(personalLines.map((p) => p.toLowerCase()))].join(", ")}. UK and US employers should not see age, marital status, nationality or a photo, and some reject CVs that include them.`, { action: "remove-personal", label: "Remove them" });
  else add("f-personal", "format", 2, "pass", "No unnecessary personal details", "No date of birth, marital status or similar.");

  const refs = sectionsOf(cv, "references").find((s) => /on request|upon request/i.test(s.text + s.items.map((i) => i.heading + i.text).join(" ")));
  if (refs || /references (are )?available (up)?on request/i.test(text)) add("f-refs", "format", 1, "warn", "“References available on request”", "Employers assume this. The line uses space you could give to an achievement.", { action: "remove-refs", label: "Remove it" });

  const skills = sectionsOf(cv, "skills").flatMap((s) => s.list);
  if (has("skills")) {
    if (skills.length < 6) add("f-skills", "format", 1, "warn", "Skills list is thin", `${plural(skills.length, "skill")} listed. Aim for 8 to 15 that are relevant to the roles you apply for.`, { tab: "editor", label: "Add skills" });
    else if (skills.length > 30) add("f-skills", "format", 1, "warn", "Skills list is too long", `${skills.length} skills listed. Keep the 10 to 20 most relevant.`, { tab: "editor", label: "Trim list" });
    else add("f-skills", "format", 1, "pass", "Skills section is a good size", `${skills.length} skills listed.`);
  }

  /* --- content --- */
  if (bullets.length) {
    const q = Math.round((bullets.filter((b) => hasNumber(b.text)).length / bullets.length) * 100);
    add("c-quant", "content", 3, q >= 40 ? "pass" : q >= 20 ? "warn" : "fail", q >= 40 ? "Achievements are backed by figures" : "Not enough measurable results", `${q}% of bullet points include a number. Aim for at least 40%: money, percentages, team sizes, volumes, time saved.`, q >= 40 ? null : { tab: "editor", label: "Fix in editor" });

    const v = Math.round((bullets.filter((b) => ACTION_VERBS.has(firstWord(b.text))).length / bullets.length) * 100);
    add("c-verbs", "content", 3, v >= 70 ? "pass" : v >= 40 ? "warn" : "fail", v >= 70 ? "Bullets start with action verbs" : "Bullets need stronger openings", `${v}% of bullet points open with a strong action verb such as “Led”, “Reduced” or “Delivered”. Aim for 70% or more.`, v >= 70 ? null : { tab: "editor", label: "Fix in editor" });

    const starts = {};
    bullets.forEach((b) => {
      const w = firstWord(b.text);
      if (w) starts[w] = (starts[w] || 0) + 1;
    });
    const rep = Object.entries(starts).filter(([, n]) => n >= 3);
    rep.length ? add("c-repeat", "content", 1, "warn", "Repeated opening words", `${rep.map(([w, n]) => `“${w}” (${n} times)`).join(", ")}. Vary the verbs to keep it readable.`, { tab: "editor", label: "Fix in editor" }) : add("c-repeat", "content", 1, "pass", "Varied wording", "No opening word is overused.");
  }

  const lower = text.toLowerCase();
  const weak = WEAK_PHRASES.filter((p) => !WEAK_PHRASES.some((o) => o !== p && o.startsWith(p) && lower.includes(o)) || p.includes(" ")).reduce((n, p) => n + (lower.split(p).length - 1), 0);
  const weakCount = bullets.filter((b) => bulletProblems(b.text).includes("weak opening")).length || (weak ? 1 : 0);
  weakCount ? add("c-weak", "content", 2, weakCount >= 3 ? "fail" : "warn", "Passive, duty-style wording", `${plural(weakCount, "bullet point")} use phrases like “responsible for” or “helped with”. They describe a job, not what you achieved.`, { tab: "editor", label: "Fix in editor" }) : add("c-weak", "content", 2, "pass", "Active wording", "No “responsible for” or “duties included”.");

  const pron = (text.match(/\b(I|I'm|I’ve|I've|my|me|myself)\b/g) || []).length;
  pron ? add("c-pron", "content", 1, pron > 2 ? "fail" : "warn", "First-person pronouns", `“I”, “me” or “my” appears ${pron} times. CVs read better without them: “Managed a team of 12”, not “I managed a team of 12”.`, { tab: "editor", label: "Fix in editor" }) : add("c-pron", "content", 1, "pass", "No first-person pronouns", "Written in the implied first person.");

  const cl = CLICHES.filter((p) => lower.includes(p));
  cl.length >= 2 ? add("c-cliche", "content", 1, cl.length >= 4 ? "fail" : "warn", "Clichés and buzzwords", `${cl.map((p) => `“${p}”`).join(", ")}. Recruiters skim past these. Show the quality with an example instead.`, { tab: "editor", label: "Fix in editor" }) : add("c-cliche", "content", 1, "pass", "Free of clichés", cl.length ? `Only one found (“${cl[0]}”).` : "No overused buzzwords.");

  if (proof) {
    const n = proof.issues.filter((i) => i.kind !== "style").length;
    if (proof.loading && !n) add("c-proof", "content", 3, "info", "Checking spelling and grammar", "The dictionary is loading. This updates in a moment.");
    else n ? add("c-proof", "content", 3, n >= 4 ? "fail" : "warn", "Spelling and grammar mistakes", `${plural(n, "possible mistake")} found. A single typo is enough for some recruiters to reject a CV.`, { tab: "proof", label: "Review and fix" }) : add("c-proof", "content", 3, "pass", "No spelling or grammar mistakes found", proof.spellReady ? "Checked against the dictionary and grammar rules." : "Grammar rules passed. Spelling could not be checked (dictionary unavailable).");
  }

  /* --- keywords --- */
  let match = null;
  if (jd && jd.text && jd.text.trim().length > 80) {
    match = matchKeywords(text, jd.text);
    if (match) {
      add("k-match", "keywords", 4, match.percent >= 70 ? "pass" : match.percent >= 45 ? "warn" : "fail", `Keyword match: ${match.percent}%`, `${match.matched.length} of ${match.matched.length + match.missing.length} important terms from the advert appear in your CV. Aim for 70% or more.`, match.percent >= 70 ? null : { tab: "match", label: "See missing keywords" });
      if (jd.title) {
        const t = stemPhrase(jd.title);
        (" " + tokens(text).map(stem).join(" ") + " ").includes(" " + t + " ") ? add("k-title", "keywords", 2, "pass", "Job title appears in your CV", `“${jd.title}” was found. Recruiters often search by exact job title.`) : add("k-title", "keywords", 2, "warn", "Job title not in your CV", `“${jd.title}” does not appear. If it honestly describes you, use it in your headline or summary.`, { tab: "editor", label: "Edit headline" });
      }
      const ms = match.missingSkills.length;
      ms ? add("k-skills", "keywords", 2, ms > 4 ? "fail" : "warn", "Skills from the advert are missing", `${match.missingSkills.slice(0, 8).map((k) => k.keyword).join(", ")}. Add the ones you really have, using the advert's wording.`, { tab: "match", label: "Add skills" }) : add("k-skills", "keywords", 2, "pass", "Named skills are covered", "Every skill we recognised in the advert is in your CV.");
    }
  }

  /* --- scoring --- */
  const pts = { pass: 1, warn: 0.5, fail: 0 };
  const score = (list) => {
    const s = list.filter((c) => c.status in pts && c.weight);
    const total = s.reduce((n, c) => n + c.weight, 0);
    return total ? Math.round((s.reduce((n, c) => n + c.weight * pts[c.status], 0) / total) * 100) : null;
  };
  const categories = CATEGORIES.map((cat) => {
    const list = checks.filter((c) => c.cat === cat.id);
    return { ...cat, score: score(list), checks: list };
  });
  const counts = { pass: 0, warn: 0, fail: 0, info: 0 };
  checks.forEach((c) => counts[c.status]++);
  return { score: score(checks) ?? 0, categories, checks, counts, match, words, bullets: bullets.length };
}

export const verdict = (score) => (score >= 85 ? "Excellent. Ready to send." : score >= 70 ? "Good, with a few things to fix." : score >= 50 ? "Needs work before you apply." : "Likely to be filtered out as it stands.");
