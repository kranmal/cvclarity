// cvclarity server: serves the app and proxies the optional AI proofread to Claude.
// The API key stays on this machine (in .env) and is never sent to the browser.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(path.join(here, ".env"));
} catch {
  /* no .env file: AI features stay off */
}

const PORT = Number(process.env.PORT) || 4173;
const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
const PUBLIC = path.join(here, "public");

let Anthropic = null;
let client = null;
if (process.env.ANTHROPIC_API_KEY) {
  try {
    ({ default: Anthropic } = await import("@anthropic-ai/sdk"));
    client = new Anthropic();
  } catch (err) {
    console.warn("AI features are off: run `npm install` first.", err.message);
  }
}

/* ---------- AI tasks ---------- */

const obj = (properties) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const str = { type: "string" };
const strs = { type: "array", items: str };

const SYSTEM = `You are an expert CV proofreader who knows how applicant tracking systems (ATS) read CVs.
Rules:
- Never invent employers, job titles, qualifications, dates or numbers. Where a figure would strengthen a line and none is given, insert a bracketed placeholder such as [X%] or [number] for the person to fill in.
- Write in the same English variant as the CV (default to British English).
- Keep wording plain, specific and free of clichés. Start bullet points with a strong action verb. No first-person pronouns in bullet points.
- Use plain text only: no markdown, no emoji, no special symbols.`;

const TASKS = {
  proofread: {
    effort: "medium",
    schema: obj({
      issues: {
        type: "array",
        items: obj({ original: str, suggestion: str, reason: str }),
      },
    }),
    prompt: (p) =>
      `Proofread this CV text for spelling, grammar, punctuation, tense and clarity problems. Report each problem with the exact original phrase copied character for character (short, at most 12 words), the corrected phrase, and a brief reason. Do not report style preferences or things that are already correct. Return an empty list if there are none.\n\n${p.text}`,
  },
};

async function runTask(task, payload) {
  const t = TASKS[task];
  if (!t) return { status: 400, body: { error: "Unknown task" } };
  if (!client) return { status: 503, body: { error: "AI is not set up. Add ANTHROPIC_API_KEY to the .env file and restart." } };

  try {
    // Server-side fallback: if the main model declines a request, the API
    // re-runs it on Anthropic's recommended fallback model in the same call.
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      output_config: { effort: t.effort, format: { type: "json_schema", schema: t.schema } },
      messages: [{ role: "user", content: t.prompt(payload || {}) }],
    });

    if (response.stop_reason === "refusal") {
      return { status: 422, body: { error: "The AI declined this request. Try rewording the text." } };
    }
    if (response.stop_reason === "max_tokens") {
      return { status: 502, body: { error: "The AI answer was cut off. Try with less text." } };
    }
    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    return { status: 200, body: { result: JSON.parse(text) } };
  } catch (error) {
    if (Anthropic && error instanceof Anthropic.AuthenticationError) {
      return { status: 401, body: { error: "The API key in .env was rejected. Check it and restart." } };
    }
    if (Anthropic && error instanceof Anthropic.RateLimitError) {
      return { status: 429, body: { error: "Rate limited by the AI service. Wait a moment and try again." } };
    }
    if (Anthropic && error instanceof Anthropic.APIError) {
      return { status: 502, body: { error: `AI service error (${error.status ?? "network"}): ${error.message}` } };
    }
    console.error(error);
    return { status: 500, body: { error: "Could not read the AI answer. Try again." } };
  }
}

/* ---------- HTTP ---------- */

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req, limit = 400_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname === "/api/status") {
    return send(res, 200, { ai: Boolean(client), model: client ? MODEL : "" });
  }

  if (url.pathname === "/api/ai") {
    if (req.method !== "POST") return send(res, 405, { error: "POST only" });
    try {
      const { task, payload } = JSON.parse(await readBody(req));
      const out = await runTask(task, payload);
      return send(res, out.status, out.body);
    } catch {
      return send(res, 400, { error: "Bad request" });
    }
  }

  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, { error: "Method not allowed" });
  const rel = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, "Forbidden", "text/plain");
  try {
    const data = await readFile(file);
    send(res, 200, data, MIME[path.extname(file)] || "application/octet-stream");
  } catch {
    send(res, 404, "Not found", "text/plain");
  }
});

server.listen(PORT, () => {
  console.log(`cvclarity is running at http://localhost:${PORT}`);
  console.log(client ? `AI features: on (${MODEL})` : "AI features: off (add ANTHROPIC_API_KEY to .env to switch them on)");
});
