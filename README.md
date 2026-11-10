# cvclarity

A free CV checker. Upload a CV to see how applicant tracking software (ATS) reads it, fix what is flagged, and download it as PDF, Word or plain text.

Live at https://kranmal.github.io/cvclarity/ (the hosted copy has no AI proofread).

## Run it

Needs Node 21 or newer.

```bash
npm install
```

```bash
npm start
```

Then open http://localhost:4173.

## What it does

- **ATS report**: a score out of 100 from checks on file readability, structure and layout, content and impact, and spelling and grammar. Each check says what was found, why it matters and how to fix it.
- **Editor and templates**: edit every section, pick one of three single-column templates (Classic, Modern, Executive) and an accent colour. The preview matches the download.
- **Spelling and grammar**: British or American English, with one-click corrections, a personal dictionary and ignore.
- **Downloads**: PDF, Word (.docx) and plain text, unlimited, with no watermark or sign-up.

It reads PDF, .docx and .txt files, or pasted text. Old .doc files are not supported.

## Privacy

The CV is read, checked and saved in the browser (local storage). Nothing is uploaded to be checked. Fonts, the spelling dictionary and the file-reading libraries load from public CDNs, so the first visit needs an internet connection.

## Optional AI proofread

Everything above works without AI. To add the "Run AI proofread" button on the Spelling and grammar tab:

1. Copy `.env.example` to `.env`.
2. Paste your own Anthropic API key after `ANTHROPIC_API_KEY=`.
3. Restart the server.

When you use it, the CV text is sent to Anthropic's API with your key. The model defaults to `claude-opus-5-5`; set `CLAUDE_MODEL` in `.env` to change it. Server-side fallback is switched on, so if the main model declines a request the API re-runs it on Anthropic's recommended fallback model.

`PORT` in `.env` changes the port.

## Layout

- `server.js`: serves `public/` and the AI proofread endpoint. Only needed locally; the hosted site is `public/` on its own, deployed by `.github/workflows/deploy-pages.yml`.
- `public/index.html`, `public/styles.css`: landing page and app shell.
- `public/js/parse.js`: reads files and splits a CV into sections.
- `public/js/ats.js`: the ATS checks and score.
- `public/js/proof.js`, `public/js/spell-worker.js`: spelling and grammar.
- `public/js/export.js`: PDF, Word and text downloads.
- `public/js/views/`: the three tabs.

The score is guidance based on how ATS software commonly behaves, not a guarantee for any one employer's system.
