# Learning Plan — English learning app

Implementation of the `LearningPlan.dc.html` design (see below for the original handoff notes).

## Stack

- `apps/web` — React 19 + TypeScript + Vite + Tailwind v4 SPA (PWA-ready, Capacitor-friendly).
- `apps/server` — Express + TypeScript API that grades the placement test and topic exercises.
- `packages/shared` — types + static content (questions, topics, chunk cards) shared by both.

Grading is provider-agnostic (`GradingProvider` interface in `packages/shared`): a `MockGradingProvider`
(deterministic, no network — used by default in dev) and an `AnthropicGradingProvider` (used by default
in production, or whenever `ANTHROPIC_API_KEY` is set) that calls Claude with a forced tool call to get
structured JSON back. The frontend never talks to the LLM directly — it only calls this app's own
`/api/grade/*` routes, so provider API keys stay server-side.

## Running locally

```bash
npm install
npm run build:shared        # compiles packages/shared once (rerun after editing its src)

npm run dev:server          # http://localhost:8787 — mock grading by default
npm run dev:web             # http://localhost:5173 — proxies /api to the server above
```

To use real Claude grading instead of the mock adapter, copy `apps/server/.env.example` to
`apps/server/.env` and set `ANTHROPIC_API_KEY` (`GRADING_PROVIDER=anthropic` to force it in dev).

`npm run build` builds shared → server → web in order; `npm run typecheck` typechecks all three.

## Known content limitation carried over from the design

The prototype only ever authored full lesson material/exercises for one topic ("Present Perfect vs Past
Simple"); the other 13 syllabus topics exist as titles/categories only. The Topic and Exercises screens
currently show that one authored lesson regardless of which topic is "current" — generating real
per-topic material is a follow-up, not something this pass invented content for.

---

# CODING AGENTS: READ THIS FIRST

This is a **handoff bundle** from Claude Design (claude.ai/design).

A user mocked up designs in HTML/CSS/JS using an AI design tool, then exported this bundle so a coding agent can implement the designs for real.

## What you should do — IMPORTANT

**Read the chat transcripts first.** There are 1 chat transcript(s) in `chats/`. The transcripts show the full back-and-forth between the user and the design assistant — they tell you **what the user actually wants** and **where they landed** after iterating. Don't skip them. The final HTML files are the output, but the chat is where the intent lives.

**Read `project/LearningPlan.dc.html` in full.** The user had this file open when they triggered the handoff, so it's almost certainly the primary design they want built. Read it top to bottom — don't skim. Then **follow its imports**: open every file it pulls in (shared components, CSS, scripts) so you understand how the pieces fit together before you start implementing.

**If anything is ambiguous, ask the user to confirm before you start implementing.** It's much cheaper to clarify scope up front than to build the wrong thing.

## About the design files

The design medium is **HTML/CSS/JS** — these are prototypes, not production code. Your job is to **recreate them pixel-perfectly** in whatever technology makes sense for the target codebase (React, Vue, native, whatever fits). Match the visual output; don't copy the prototype's internal structure unless it happens to fit.

**Don't render these files in a browser or take screenshots unless the user asks you to.** Everything you need — dimensions, colors, layout rules — is spelled out in the source. Read the HTML and CSS directly; a screenshot won't tell you anything they don't.

## Bundle contents

- `README.md` — this file
- `chats/` — conversation transcripts (read these!)
- `project/` — the `English Learning App Design` project files (HTML prototypes, assets, components)
