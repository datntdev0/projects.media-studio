---
name: project-plan
description: Turn a feature request into an implementation plan document under _docs/plan. Use when the user asks to plan a feature, write a plan, design an approach before coding, or continue a plan series (e.g. "library part 6"). Reads the design mockups and the existing code, then writes the plan file. It plans only — it does not implement.
---

# Writing an implementation plan

The output is one markdown file in `_docs/plan/`. Nothing else changes: no source
file is edited, no dependency installed. The plan is finished when the file is
written and the user has read the summary.

## 1. Understand what is being asked

Read the request, then find what it is drawn from.

- The mockups are in `_docs/design/*.dc.html` — one per screen, and every feature
  in this repo comes from one. Grep it for the buttons, dialogs and labels the
  feature needs, and cite them by line number. If the request has no mockup, say
  so in the plan rather than inventing a screen.
- If the feature continues a series, read the previous part in `_docs/plan/`
  first. It carries the decisions this part inherits and the limits this part may
  be about to fix.
- Read `.claude/rules/*.md`. The plan has to fit the layering it describes.

Ask the user only where two readings would produce materially different plans —
scope boundaries, or which of two mechanisms to build on. Decide the rest.

## 2. Scan the codebase

Never plan against a guess about what exists. Before writing a line:

- Find the module the feature lands in — `backend/src/<feature>/` and the flat
  `AppX*` components in `frontend/app/components/`.
- Read the entities, DTOs and repositories the feature touches. Names and shapes
  in the plan must match what is actually there.
- Look for the plumbing you would otherwise invent: `backend/src/core/`
  (providers, queues, firebase) usually already has it.
- Note every existing caller of anything you propose to change.

Delegate the sweep to `Explore` agents when it spans several areas; read the
handful of decisive files yourself.

## 3. Name the file

`_docs/plan/[area]-<name>.md`, lowercase, snake_case after the bracket:

- a series part: `[library]-part5_export_import_with_zip_file.md`
- a standalone feature: `[auth]-google_firebase_authentication_integration.md`

`area` is the module — `library`, `scraping`, `notify`, `auth`. Continuing a
series means the next unused part number.

## 4. Write it

Follow this outline. Every existing plan uses it; keep it recognisable.

```markdown
# <Area> — Part <n>: <what it does, in plain words>

Source design: `_docs/design/<file>.dc.html` — the elements it comes from, with line numbers.

## Goal of design

Two or three paragraphs: what the previous part left, what this part adds, and why now.

**In scope** — a bulleted list, one line per deliverable, endpoints written as `POST /path`.

**Out of scope — deliberately** — a `| Deferred | Why |` table. The "why" is the point.

### Decisions taken

A `| Question | Decision |` table. Each decision is a choice with an alternative that was
rejected, and the row says which and why.

## Contracts

The exact shapes, before any prose about building them — entities, endpoints, DTOs,
frontend types, storage/database rules. Each under its own `###` heading naming the file
it lives in. TypeScript blocks for shapes, a table for endpoints
(`| Method | Path | Body | Answers |`).

## Shape of the system

A `mermaid` flowchart of the pieces and the traffic between them, then a paragraph on what
it shows. Add `### The flow — <case>` sections for anything asynchronous, stepped through
in order.

## Step 1 — <what it delivers>

One step per shippable slice, in build order. Each opens with a `| File | What it is |`
table listing every file the step creates or changes, then prose on the parts that are not
obvious from the table. Pseudocode is fine; a full implementation is not.

## Known limits

What this deliberately does not handle, and what breaks first at scale. Bold the claim,
then explain in prose. Be honest — this section is what makes the plan trustworthy.

## Running it locally

The commands that prove it works: `pnpm dev:infrastructure`, `pnpm seed:firebase`,
`pnpm dev`, the specific `pnpm --filter @media-studio/backend run test -- <pattern>` lines,
then `pnpm lint && pnpm typecheck`.
```

Vary it where the feature demands — a plan with no async flow needs no flow
section — but do not drop `Decisions taken`, `Contracts`, `Known limits` or the
step tables.

## How to write

- Every file named with its real path. Every symbol named as it will be spelled.
- Say what was decided, not what could be decided. No "we could either".
- Prefer a table to a list where there are two columns of information.
- Prose in full sentences, at the width of the existing plans. No bullet soup.
- Keep the repo's rules: managers hold the rules, controllers only route, DTO
  changes mean `pnpm generate:api`, the frontend reaches the API only through
  `useApiClient()`.
- Follow `.claude/rules/0.planning.md` — the plan is for the simple version. An
  abstraction with one caller does not belong in it.

## Finish

Write the file, then report to the user: the path, the steps in one line each,
and any question the plan had to assume an answer to. Do not start implementing.
