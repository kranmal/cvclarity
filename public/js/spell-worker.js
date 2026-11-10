// Spell-check worker: keeps the dictionary off the main thread so the page never freezes.
importScripts("https://cdn.jsdelivr.net/npm/typo-js@1.2.4/typo.js");

const SOURCES = {
  "en-GB": "https://cdn.jsdelivr.net/npm/dictionary-en-gb@2.4.0",
  "en-US": "https://cdn.jsdelivr.net/npm/dictionary-en@3.2.0",
};

let dict = null;
let lang = "";

async function init(l) {
  lang = l;
  dict = null;
  try {
    const base = SOURCES[l] || SOURCES["en-GB"];
    const [aff, dic] = await Promise.all(
      ["index.aff", "index.dic"].map((f) =>
        fetch(`${base}/${f}`).then((r) => {
          if (!r.ok) throw new Error(`dictionary ${r.status}`);
          return r.text();
        })
      )
    );
    dict = new Typo(l.replace("-", "_"), aff, dic);
    postMessage({ type: "ready", lang });
  } catch (err) {
    postMessage({ type: "failed", lang, error: String(err && err.message) });
  }
}

const norm = (w) => w.replace(/’/g, "'").replace(/'s$/i, "");

function handle(m) {
  if (m.type === "init") return init(m.lang);
  if (!dict) return;
  if (m.type === "check") {
    const results = m.words.map((w) => {
      const n = norm(w);
      return [w, dict.check(n) || dict.check(n.toLowerCase())];
    });
    postMessage({ type: "checked", lang, results });
  } else if (m.type === "suggest") {
    let suggestions = [];
    try {
      suggestions = dict.suggest(norm(m.word).toLowerCase(), 4);
    } catch {
      /* no suggestions */
    }
    postMessage({ type: "suggested", lang, word: m.word, suggestions });
  }
}

// Messages are handled strictly in order, so checks wait for the dictionary to load.
let chain = Promise.resolve();
onmessage = (e) => {
  chain = chain.then(() => handle(e.data)).catch(() => {});
};
