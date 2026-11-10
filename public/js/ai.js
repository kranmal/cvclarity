// Optional AI proofread. Uses Claude through the local server when a key is set up.
export async function aiStatus() {
  try {
    const r = await fetch("api/status");
    return r.ok ? await r.json() : { ai: false, model: "" };
  } catch {
    return { ai: false, model: "" };
  }
}

export async function ai(task, payload) {
  let r;
  try {
    r = await fetch("api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ task, payload }) });
  } catch {
    throw new Error("Could not reach the cvclarity server. Is it still running?");
  }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `AI request failed (${r.status})`);
  return body.result;
}
