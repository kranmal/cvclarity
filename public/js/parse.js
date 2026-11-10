// Reads a CV file in the browser (nothing is uploaded) and turns its text into structured data.
import { classifyHeading, newItem, newSection, normaliseCV, kindOf } from "./model.js";

const PDF_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

/* ---------- file extraction ---------- */

export async function extractFile(file) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const signals = { fileName: file.name, fileType: ext, pages: 0, multiColumn: false, hasTables: false, hasImages: false, scanned: false };
  let text = "";
  if (ext === "pdf") text = await extractPdf(await file.arrayBuffer(), signals);
  else if (ext === "docx") text = await extractDocx(await file.arrayBuffer(), signals);
  else if (ext === "txt" || ext === "md") text = await file.text();
  else if (ext === "doc") throw new Error("Old .doc files can't be read. Save it as .docx or PDF and try again.");
  else throw new Error("Use a PDF, DOCX or TXT file.");
  return { text: tidy(text), signals };
}

export async function extractPdf(buffer, signals = {}) {
  const pdfjs = window.pdfjsLib;
  if (!pdfjs) throw new Error("The PDF reader did not load. Check your internet connection and reload.");
  pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER;
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  signals.pages = doc.numPages;
  const out = [];
  let columnLines = 0;
  let totalLines = 0;

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = content.items
      .filter((i) => i.str && i.str.trim())
      .map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: i.height || 10 }));

    // Group text runs into lines by vertical position.
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    for (const it of items) {
      const line = lines.find((l) => Math.abs(l.y - it.y) < Math.max(2.5, it.h * 0.35));
      if (line) line.items.push(it);
      else lines.push({ y: it.y, items: [it] });
    }
    for (const line of lines) {
      line.items.sort((a, b) => a.x - b.x);
      let str = "";
      let prevEnd = null;
      const segments = [];
      let seg = "";
      for (const it of line.items) {
        const gap = prevEnd == null ? 0 : it.x - prevEnd;
        if (prevEnd != null && gap > 28) {
          segments.push(seg);
          seg = "";
          str += "   ";
        } else if (prevEnd != null && gap > 1.2 && !str.endsWith(" ") && !it.str.startsWith(" ")) str += " ";
        str += it.str;
        seg += it.str;
        prevEnd = it.x + it.w;
      }
      segments.push(seg);
      totalLines++;
      // Two long runs of text side by side means columns (a short right-hand run is usually just a date).
      if (segments.length > 1 && segments[0].trim().length > 22 && segments[segments.length - 1].trim().length > 22) columnLines++;
      out.push(str.trim());
    }
    out.push("");

    try {
      const ops = await page.getOperatorList();
      const OPS = pdfjs.OPS;
      if (ops.fnArray.some((f) => f === OPS.paintImageXObject || f === OPS.paintJpegXObject || f === OPS.paintInlineImageXObject)) signals.hasImages = true;
    } catch {
      /* image detection is best effort */
    }
  }
  signals.multiColumn = columnLines >= 6 && columnLines / Math.max(totalLines, 1) > 0.12;
  const text = out.join("\n");
  signals.scanned = text.replace(/\s/g, "").length < 150;
  return text;
}

async function extractDocx(buffer, signals) {
  if (!window.mammoth) throw new Error("The Word reader did not load. Check your internet connection and reload.");
  const { value: html } = await window.mammoth.convertToHtml({ arrayBuffer: buffer });
  const dom = new DOMParser().parseFromString(html, "text/html");
  signals.hasTables = !!dom.querySelector("table");
  signals.hasImages = !!dom.querySelector("img");
  const lines = [];
  dom.body.querySelectorAll("p, h1, h2, h3, h4, h5, h6, li").forEach((el) => {
    if (el.tagName !== "LI" && el.closest("li")) return;
    const t = el.textContent.replace(/\s+/g, " ").trim();
    if (!t) return;
    lines.push(el.tagName === "LI" ? "• " + t : t);
  });
  return lines.join("\n");
}

const tidy = (t) =>
  String(t || "")
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/* ---------- structuring ---------- */

const MON = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const D1 = `(?:${MON}\\.?,?\\s+)?(?:19|20)\\d{2}|\\d{1,2}[/.]\\d{4}`;
const DATE_RANGE = new RegExp(`\\(?\\b(?:${D1})\\s*(?:[-–—]+|\\bto\\b|\\buntil\\b)\\s*(?:${D1}|present|current|now|ongoing|date)\\b\\)?`, "i");
const DATE_SINGLE = new RegExp(`\\(?\\b(?:${MON}\\.?,?\\s+)?(?:19|20)\\d{2}\\)?\\s*$`, "i");
const BULLET = /^\s*(?:[•·●◦▪■□‣⁃➢➤►✓✔*○∙]|[-–—](?=\s)|o(?=\s{1,3}[A-Z]))\s*/;

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE = /(?:\+|\(|\b)\d[\d\s().-]{8,16}\d\b/;
const LINK = /(?:https?:\/\/|www\.)[^\s|,]+|\b(?:linkedin\.com|github\.com|gitlab\.com|behance\.net|dribbble\.com)\/[^\s|,]+|\b[a-z0-9-]+\.(?:com|co\.uk|io|dev|me|net|org)(?:\/[^\s|,]*)?/gi;

function extractDate(line) {
  let m = line.match(DATE_RANGE);
  if (!m && line.length < 90) m = line.match(DATE_SINGLE);
  if (!m) return null;
  const date = m[0].replace(/^\(|\)$/g, "").trim();
  const rest = (line.slice(0, m.index) + " " + line.slice(m.index + m[0].length))
    .replace(/\s+/g, " ")
    .replace(/^[\s|,:·•–—-]+|[\s|,:·•–—(-]+$/g, "")
    .trim();
  return { date, rest };
}

function splitHeading(it) {
  if (it.sub || !it.heading) return;
  const m = it.heading.match(/^(.{3,}?)(?:\s+[|·•–—]\s+|\s+-\s+|\s+at\s+|\s+@\s+|,\s+)(.{2,})$/);
  if (m) {
    it.heading = m[1].trim();
    it.sub = m[2].trim();
  }
}

function parseItems(lines) {
  const items = [];
  let cur = null;
  let prevLen = 0;
  const start = (over) => {
    cur = newItem(over);
    items.push(cur);
    return cur;
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (BULLET.test(line)) {
      (cur || start()).bullets.push(line.replace(BULLET, "").trim());
    } else {
      const lastBullet = cur && cur.bullets.length ? cur.bullets[cur.bullets.length - 1] : null;
      const d = lastBullet != null && /^[a-z(]/.test(line) ? null : extractDate(line);
      if (d) {
        if (cur && !cur.date && !cur.bullets.length && !cur.text) {
          cur.date = d.date;
          if (d.rest && !cur.heading) cur.heading = d.rest;
          else if (d.rest) cur.sub = cur.sub ? `${cur.sub}, ${d.rest}` : d.rest;
        } else start({ heading: d.rest, date: d.date });
      } else if (cur && !cur.heading && !cur.bullets.length) cur.heading = line;
      else if (lastBullet != null && (/^[a-z(]/.test(line) || (prevLen > 72 && !/[.!?]$/.test(lastBullet)))) {
        cur.bullets[cur.bullets.length - 1] = `${lastBullet} ${line}`;
      } else if (cur && !cur.bullets.length && !cur.text && !cur.sub && line.length < 90 && !/[.!?]$/.test(line)) cur.sub = line;
      else if (line.length < 80 && !/[.!?]$/.test(line)) start({ heading: line });
      else if (cur) cur.text = cur.text ? `${cur.text} ${line}` : line;
      else start({ text: line });
    }
    prevLen = line.length;
  }
  items.forEach(splitHeading);
  return items;
}

function parseList(lines) {
  return lines
    .join("\n")
    .split(/[,;|•·●▪\n]+/)
    .map((s) => s.replace(BULLET, "").replace(/^[A-Za-z &/]{2,28}:\s*/, "").replace(/[.\s]+$/, "").trim())
    .filter((s) => s && s.length < 60);
}

export function structureCV(text) {
  const lines = tidy(text)
    .split("\n")
    .map((l) => l.replace(/\s{3,}/g, "   ").trim());
  const cv = { name: "", title: "", contact: { email: "", phone: "", location: "", links: [] }, headerExtra: [], sections: [] };

  // Split into header + sections.
  const header = [];
  let section = null;
  const bodies = new Map();
  for (const line of lines) {
    const h = line && !BULLET.test(line) ? classifyHeading(line.replace(/:$/, "")) : null;
    if (h) {
      section = newSection(h.type, line.replace(/:$/, "").trim());
      section.nonStandard = h.nonStandard;
      cv.sections.push(section);
      bodies.set(section, []);
    } else if (section) bodies.get(section).push(line);
    else if (line) header.push(line);
  }

  // No headings recognised at all: keep the name line, put the rest in one section.
  let headerLines = header;
  if (!cv.sections.length) {
    headerLines = header.slice(0, 4);
    section = newSection("other", "Other");
    section.nonStandard = true;
    cv.sections.push(section);
    bodies.set(section, header.slice(4));
  }

  for (const [s, body] of bodies) {
    const kind = kindOf(s.type);
    const content = body.filter((l) => l.trim());
    if (kind === "text") s.text = content.map((l) => l.replace(BULLET, "")).join(" ").replace(/\s+/g, " ").trim();
    else if (kind === "list") s.list = parseList(content);
    else s.items = parseItems(content);
  }

  // Header: name, headline, contact details.
  const headerText = headerLines.join("\n");
  const allText = lines.join("\n");
  cv.contact.email = (headerText.match(EMAIL) || allText.match(EMAIL) || [""])[0];
  const phone = (headerText.replace(EMAIL, "").match(PHONE) || [""])[0];
  if (phone.replace(/\D/g, "").length >= 10 && !/^(19|20)\d{2}\s*[-–]/.test(phone)) cv.contact.phone = phone.trim();
  cv.contact.links = [...new Set((headerText.replace(new RegExp(EMAIL.source, "g"), " ").match(LINK) || []).map((l) => l.replace(/[.,;]+$/, "")))];

  const used = new Set();
  const isPlain = (s) => !/[@\d]|https?:|www\.|\.com\b/i.test(s);
  const segments = [];
  headerLines.forEach((line, li) =>
    line.split(/\s*[|•·●]\s*|\s{3,}/).forEach((seg) => {
      const s = seg.trim();
      if (s) segments.push({ s, li });
    })
  );
  const nameSeg = segments.find(({ s }) => isPlain(s) && /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’. -]+$/.test(s) && s.split(/\s+/).length >= 2 && s.split(/\s+/).length <= 5);
  if (nameSeg) {
    cv.name = nameSeg.s;
    used.add(nameSeg);
  }
  const locSeg = segments.find(
    (seg) =>
      !used.has(seg) &&
      isPlainLoc(seg.s) &&
      (/^[A-Z][A-Za-zÀ-ÿ'’. -]+,\s*[A-Za-zÀ-ÿ'’. -]+(?:\s+[A-Z]{1,2}\d[\dA-Z]?\s*\d[A-Z]{2})?$/.test(seg.s) || /\b[A-Z]{1,2}\d[\dA-Z]?\s*\d[A-Z]{2}\b/.test(seg.s))
  );
  if (locSeg) {
    cv.contact.location = locSeg.s;
    used.add(locSeg);
  }
  const titleSeg = segments.find((seg) => !used.has(seg) && nameSeg && seg.li > nameSeg.li - 1 && seg !== nameSeg && isPlain(seg.s) && !/:/.test(seg.s) && seg.s.split(/\s+/).length <= 8);
  if (titleSeg) {
    cv.title = titleSeg.s;
    used.add(titleSeg);
  }
  for (const seg of segments) {
    if (used.has(seg)) continue;
    const s = seg.s;
    if (EMAIL.test(s) || s === cv.contact.phone || (cv.contact.phone && s.includes(cv.contact.phone))) continue;
    if (cv.contact.links.some((l) => s.includes(l))) continue;
    if (/^(curriculum vitae|cv|resume|résumé)$/i.test(s)) continue;
    cv.headerExtra.push(s);
  }
  return normaliseCV(cv);
}

const isPlainLoc = (s) => !/[@]|https?:|www\.|\.com\b/i.test(s) && !/\d{5,}/.test(s.replace(/\s/g, "").replace(/[A-Z]{1,2}\d[\dA-Z]?\d[A-Z]{2}/, ""));
