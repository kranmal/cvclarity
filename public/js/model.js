// The CV data model shared by the parser, checks, editor, templates and exports.
import { uid } from "./util.js";

export const SECTION_LABELS = {
  summary: "Professional Summary",
  experience: "Work Experience",
  education: "Education",
  skills: "Skills",
  projects: "Projects",
  certifications: "Certifications",
  awards: "Awards",
  volunteering: "Volunteering",
  languages: "Languages",
  interests: "Interests",
  publications: "Publications",
  references: "References",
  other: "Additional Information",
};

// How a section's content is stored: free text, a list of short entries, or dated items.
export const kindOf = (type) =>
  type === "summary" || type === "references" ? "text" : ["skills", "languages", "interests"].includes(type) ? "list" : "items";

const STANDARD = {
  summary: ["summary", "professional summary", "personal statement", "profile", "professional profile", "personal profile", "career summary", "executive summary", "objective", "career objective"],
  experience: ["experience", "work experience", "professional experience", "employment history", "employment", "work history", "career history", "relevant experience"],
  education: ["education", "education and qualifications", "qualifications", "academic background", "education and training", "academic qualifications"],
  skills: ["skills", "key skills", "technical skills", "core skills", "core competencies", "skills and competencies", "areas of expertise", "skills and expertise", "it skills"],
  projects: ["projects", "key projects", "personal projects", "selected projects"],
  certifications: ["certifications", "certificates", "licences and certifications", "licenses and certifications", "professional development", "training", "courses", "training and certifications"],
  awards: ["awards", "achievements", "honours", "honors", "awards and achievements", "key achievements", "honours and awards"],
  volunteering: ["volunteering", "volunteer experience", "voluntary work", "voluntary experience", "volunteer work"],
  languages: ["languages"],
  interests: ["interests", "hobbies", "hobbies and interests", "interests and hobbies"],
  publications: ["publications"],
  references: ["references", "referees"],
  other: ["additional information", "other information", "memberships", "professional memberships"],
};

// Creative headings an ATS is unlikely to map to the right field.
const NON_STANDARD = {
  "about me": "summary",
  "who i am": "summary",
  "my story": "summary",
  "a bit about me": "summary",
  "where ive worked": "experience",
  "my journey": "experience",
  "career journey": "experience",
  "what ive done": "experience",
  "my experience": "experience",
  "where i studied": "education",
  schooling: "education",
  "my education": "education",
  toolbox: "skills",
  "my toolbox": "skills",
  "what im good at": "skills",
  superpowers: "skills",
  "tech stack": "skills",
  "my skills": "skills",
  "things i love": "interests",
  "outside work": "interests",
};

const HEADING_INDEX = new Map();
for (const [type, titles] of Object.entries(STANDARD)) for (const t of titles) HEADING_INDEX.set(t, { type, nonStandard: false });
for (const [t, type] of Object.entries(NON_STANDARD)) HEADING_INDEX.set(t, { type, nonStandard: true });

export const normHeading = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Returns {type, nonStandard} when a line is a recognised section heading, else null. */
export function classifyHeading(line) {
  const s = String(line || "").trim();
  if (!s || s.length > 42) return null;
  return HEADING_INDEX.get(normHeading(s)) || null;
}

export const newItem = (over = {}) => ({ id: uid(), heading: "", sub: "", date: "", bullets: [], text: "", ...over });
export const newSection = (type, title) => ({
  id: uid(),
  title: title || SECTION_LABELS[type] || "Section",
  type,
  nonStandard: false,
  text: "",
  list: [],
  items: [],
});
export const emptyCV = () => ({
  name: "",
  title: "",
  contact: { email: "", phone: "", location: "", links: [] },
  headerExtra: [],
  sections: [newSection("summary"), newSection("experience"), newSection("education"), newSection("skills")],
});

/** Fill in anything missing so every part of the app can rely on the shape. */
export function normaliseCV(cv) {
  const out = { ...emptyCV(), ...cv };
  out.contact = { email: "", phone: "", location: "", links: [], ...(cv.contact || {}) };
  out.contact.links = (out.contact.links || []).filter(Boolean);
  out.headerExtra = out.headerExtra || [];
  out.sections = (cv.sections || []).map((s) => ({
    ...newSection(s.type || "other", s.title),
    ...s,
    id: s.id || uid(),
    list: (s.list || []).filter(Boolean),
    items: (s.items || []).map((it) => newItem({ ...it, id: it.id || uid(), bullets: (it.bullets || []).filter(Boolean) })),
  }));
  return out;
}

export const sectionsOf = (cv, type) => cv.sections.filter((s) => s.type === type);

/** Every bullet with enough context to describe and edit it. */
export function allBullets(cv, types = ["experience", "projects", "volunteering"]) {
  const out = [];
  cv.sections.forEach((s, si) => {
    if (!types.includes(s.type)) return;
    s.items.forEach((it, ii) =>
      it.bullets.forEach((b, bi) => out.push({ text: b, path: ["sections", si, "items", ii, "bullets", bi], section: s, item: it }))
    );
  });
  return out;
}

export function cvToText(cv) {
  const L = [];
  if (cv.name) L.push(cv.name);
  if (cv.title) L.push(cv.title);
  const c = cv.contact;
  const contact = [c.email, c.phone, c.location, ...(c.links || [])].filter(Boolean).join(" | ");
  if (contact) L.push(contact);
  for (const x of cv.headerExtra || []) L.push(x);
  for (const s of cv.sections) {
    L.push("", s.title.toUpperCase());
    const kind = kindOf(s.type);
    if (kind === "text") L.push(s.text);
    else if (kind === "list") L.push(s.list.join(", "));
    else
      for (const it of s.items) {
        const head = [it.heading, it.sub].filter(Boolean).join(", ");
        if (head || it.date) L.push([head, it.date].filter(Boolean).join(" | "));
        if (it.text) L.push(it.text);
        for (const b of it.bullets) L.push("- " + b);
      }
  }
  return L.join("\n").trim();
}

export const SAMPLE_TEXT = `Jordan Ellis
Operations Manger
jordan.ellis@example.com | Leeds, UK
Date of birth: 14 March 1990

About Me
I am a hard-working team player and results-driven self-starter with over eight years experience in operations and logistics. I am passionate about improving processes and i thrive in a fast paced enviroment.

Where I've Worked
Operations Manger, Northgate Distribution Ltd
Jan 2020 - Present
• Responsible for managing the the day to day running of a regional warehouse
• Helped to introduce a new stock managment system which improved accuracy.
• Worked on reducing delivery delays across the region and liaising with a number of different carriers and suppliers in order to make sure that orders were arriving on time and that customers were being kept informed at every stage of the process
• Manage a team of supervisors and warehouse staff
• Duties included preparing weekly reports for senior managment

Logistics Coordinator, Harrow & Finch Retail
03/2017 – 12/2019
• Responsible for scheduling deliveries for 40 stores.
• Recieved the regional employee of the year award in 2018
• Assisted with supplier negotiations
• Tasked with training new starters

Warehouse Team Leader, Calder Freight
2014 - 2017
• Led a shift team of 12 and acheived a 15% reduction in picking errors
• Helped with stock takes

Education
BA (Hons) Business Management, University of Leeds
2011 - 2014

Toolbox
Excel, SAP, Stakeholder management, Forecasting, Leadership, Communication

References
References available upon request`;
