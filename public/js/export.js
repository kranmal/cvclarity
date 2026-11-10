// Downloads: text-based PDF, Word (.docx) and plain text. All made in the browser, no limits.
import { kindOf, cvToText } from "./model.js";
import { download } from "./util.js";
import { TEMPLATES, contactLine, filledSections, tint } from "./templates.js";

const INK = "#1A1A1A";
const GREY = "#444444";

// The built-in PDF fonts cover Western European characters only.
const SWAPS = { "‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-", "…": "...", "•": "-", " ": " ", "→": "->", "‐": "-", "‑": "-", "−": "-" };
const pdfSafe = (s) =>
  String(s || "")
    .replace(/[‘’“”–—…• →‐‑−]/g, (c) => SWAPS[c])
    .replace(/[^\x09\x0A\x20-\x7E¡-ÿ€]/g, "")
    .replace(/€/g, "EUR ");

export const fileBase = (cv) => {
  const n = String(cv.name || "").trim().replace(/[^A-Za-z0-9À-ɏ' -]/g, "").split(/\s+/).filter(Boolean).join("-");
  return n ? `${n}-CV` : "CV";
};

/* ---------- PDF ---------- */

export function buildPdf(cv, { template = "classic", accent = "#1F2933" } = {}) {
  const t = TEMPLATES[template] || TEMPLATES.classic;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const M = 54;
  const W = PW - M * 2;
  let y = M;

  doc.setProperties({ title: `${cv.name || "CV"}${cv.title ? " - " + cv.title : ""}`, author: cv.name || "", creator: "cvclarity" });
  const ensure = (h) => {
    if (y + h > PH - M) {
      doc.addPage();
      y = M;
    }
  };
  const font = (family, style, size, color) => {
    doc.setFont(family, style);
    doc.setFontSize(size);
    doc.setTextColor(color);
  };
  // Draws wrapped text and moves down the page.
  const para = (text, { family = t.body, style = "normal", size = 10.5, color = INK, x = M, w = W, align = "left", lead = 1.38 } = {}) => {
    font(family, style, size, color);
    const lh = size * lead;
    for (const line of doc.splitTextToSize(pdfSafe(text), w)) {
      ensure(lh);
      doc.text(line, align === "center" ? x + w / 2 : x, y + size * 0.92, { align });
      y += lh;
    }
  };

  // Header
  const align = t.align;
  para(cv.name || "Your Name", { family: t.head, style: "bold", size: 22, color: template === "classic" ? INK : accent, align, lead: 1.2 });
  if (cv.title) para(cv.title, { family: t.head, style: "normal", size: 12, color: GREY, align, lead: 1.35 });
  const contact = contactLine(cv).join("  |  ");
  if (contact) {
    y += 2;
    para(contact, { size: 9.5, color: GREY, align });
  }
  if (template === "executive") {
    y += 6;
    doc.setDrawColor(accent);
    doc.setLineWidth(2.5);
    doc.line(M, y, M + W, y);
    y += 4;
  } else if (template === "classic") {
    y += 6;
    doc.setDrawColor(accent);
    doc.setLineWidth(0.75);
    doc.line(M, y, M + W, y);
    y += 2;
  }

  const sectionHeading = (title) => {
    y += 12;
    ensure(64);
    const label = pdfSafe(title).toUpperCase();
    if (t.heading === "band") {
      doc.setFillColor(tint(accent, 0.1));
      doc.rect(M, y, W, 18, "F");
      font(t.head, "bold", 10.5, accent);
      doc.text(label, M + 6, y + 12.6);
      y += 24;
    } else {
      font(t.head, "bold", 11, accent);
      doc.text(label, M, y + 10);
      y += 14.5;
      doc.setDrawColor(t.heading === "rule" ? accent : "#C9CED3");
      doc.setLineWidth(0.75);
      doc.line(M, y, M + W, y);
      y += 6;
    }
  };

  for (const s of filledSections(cv)) {
    sectionHeading(s.title);
    const k = kindOf(s.type);
    if (k === "text") para(s.text);
    else if (k === "list") para(s.list.join(", "));
    else
      s.items.forEach((it, idx) => {
        if (idx) y += 7;
        ensure(40);
        if (it.heading || it.date) {
          font(t.body, "normal", 10.5, GREY);
          const date = pdfSafe(it.date);
          const dw = date ? doc.getTextWidth(date) + 12 : 0;
          if (date) doc.text(date, M + W, y + 10.5 * 0.92, { align: "right" });
          if (it.heading) para(it.heading, { style: "bold", w: W - dw });
          else y += 10.5 * 1.38;
        }
        if (it.sub) para(it.sub, { style: "italic", color: GREY });
        if (it.text) para(it.text);
        if (it.bullets.length) y += 1.5;
        for (const b of it.bullets) {
          ensure(14.5);
          // A real bullet character, so software reading the PDF sees where each point starts.
          font(t.body, "normal", 10.5, INK);
          doc.text("\u2022", M + 3, y + 10.5 * 0.92);
          para(b, { x: M + 14, w: W - 14 });
          y += 1.5;
        }
      });
  }
  return doc;
}

/* ---------- Word ---------- */

export async function buildDocx(cv, { template = "classic", accent = "#1F2933" } = {}) {
  const t = TEMPLATES[template] || TEMPLATES.classic;
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, TabStopType, BorderStyle, LevelFormat, ShadingType } = window.docx;
  const fontOf = (f) => (f === "times" ? "Times New Roman" : "Arial");
  const bodyFont = fontOf(t.body);
  const headFont = fontOf(t.head);
  const hex = (c) => c.replace("#", "");
  const align = t.align === "center" ? AlignmentType.CENTER : AlignmentType.LEFT;
  const RIGHT = 9638; // text width of A4 with 2 cm margins, in twentieths of a point

  const kids = [];
  kids.push(new Paragraph({ alignment: align, spacing: { after: 40 }, children: [new TextRun({ text: cv.name || "Your Name", bold: true, size: 44, font: headFont, color: hex(template === "classic" ? INK : accent) })] }));
  if (cv.title) kids.push(new Paragraph({ alignment: align, spacing: { after: 40 }, children: [new TextRun({ text: cv.title, size: 24, font: headFont, color: hex(GREY) })] }));
  const contact = contactLine(cv).join("  |  ");
  kids.push(
    new Paragraph({
      alignment: align,
      spacing: { after: 120 },
      border: template === "modern" ? undefined : { bottom: { style: BorderStyle.SINGLE, size: template === "executive" ? 20 : 6, color: hex(accent), space: 6 } },
      children: [new TextRun({ text: contact, size: 19, color: hex(GREY) })],
    })
  );

  for (const s of filledSections(cv)) {
    kids.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        shading: t.heading === "band" ? { type: ShadingType.CLEAR, color: "auto", fill: hex(tint(accent, 0.1)) } : undefined,
        border: t.heading === "band" ? undefined : { bottom: { style: BorderStyle.SINGLE, size: 6, color: t.heading === "rule" ? hex(accent) : "C9CED3", space: 2 } },
        children: [new TextRun({ text: s.title.toUpperCase() })],
      })
    );
    const k = kindOf(s.type);
    if (k === "text") kids.push(new Paragraph({ children: [new TextRun(s.text)] }));
    else if (k === "list") kids.push(new Paragraph({ children: [new TextRun(s.list.join(", "))] }));
    else
      s.items.forEach((it, idx) => {
        if (it.heading || it.date)
          kids.push(
            new Paragraph({
              keepNext: true,
              spacing: { before: idx ? 140 : 0 },
              tabStops: [{ type: TabStopType.RIGHT, position: RIGHT }],
              children: [new TextRun({ text: it.heading, bold: true }), ...(it.date ? [new TextRun({ text: "\t" + it.date, color: hex(GREY) })] : [])],
            })
          );
        if (it.sub) kids.push(new Paragraph({ keepNext: true, children: [new TextRun({ text: it.sub, italics: true, color: hex(GREY) })] }));
        if (it.text) kids.push(new Paragraph({ children: [new TextRun(it.text)] }));
        for (const b of it.bullets) kids.push(new Paragraph({ numbering: { reference: "cv-bullets", level: 0 }, spacing: { after: 30 }, children: [new TextRun(b)] }));
      });
  }

  const doc = new Document({
    creator: "cvclarity",
    title: `${cv.name || "CV"}`,
    styles: {
      default: { document: { run: { font: bodyFont, size: 21, color: hex(INK) }, paragraph: { spacing: { line: 264 } } } },
      paragraphStyles: [
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: headFont, size: 22, bold: true, color: hex(accent) },
          paragraph: { spacing: { before: 260, after: 100 }, keepNext: true },
        },
      ],
    },
    numbering: {
      config: [{ reference: "cv-bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 240 } } } }] }],
    },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1077, bottom: 1077, left: 1134, right: 1134 } } }, children: kids }],
  });
  return Packer.toBlob(doc);
}

/* ---------- entry point ---------- */

export async function exportCV(cv, format, opts) {
  const base = fileBase(cv);
  if (format === "pdf") {
    if (!window.jspdf) throw new Error("The PDF library did not load. Check your connection and reload.");
    download(buildPdf(cv, opts).output("blob"), `${base}.pdf`);
  } else if (format === "docx") {
    if (!window.docx) throw new Error("The Word library did not load. Check your connection and reload.");
    download(await buildDocx(cv, opts), `${base}.docx`);
  } else {
    download(new Blob([cvToText(cv)], { type: "text/plain;charset=utf-8" }), `${base}.txt`);
  }
}
