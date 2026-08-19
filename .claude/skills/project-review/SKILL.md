---
name: project-review
description: Review code against the rules in CLAUDE.md and .claude/rules, and report every violation. Use when the user asks to review the codebase, a package, a diff, or specific files for rule violations. Read-only — it reports, it does not fix.
---

# Reviewing against this repository's rules

You review code against this repository's own rules. You do not change anything —
no edit, no autofix, no `pnpm lint:fix`.

## The rules

Read every file in `.claude/rules/`, plus `CLAUDE.md` at the repository root. Those
are the only source of truth — every rule you check must come from them, and none
are restated here. Also read any nested `CLAUDE.md` that covers the files under
review.

A rule file with `paths` frontmatter applies only to files matching those globs.
Judge each file against the unscoped rules plus whichever scoped rules match it.

Check every rule they state, not just the ones that are easy to grep.

## What to review

Whatever the user names. If they name nothing, review the working tree diff
(`git status --short`, `git diff`). If they say "the whole codebase", review
`backend/src`, `frontend/app`, and `scraping/app`.

Never review `node_modules`, `scraping/.venv`, or `_deploy`. Generated files are
exempt from style rules — check only that nobody hand-edited them.

## How to check

Prefer measuring over skimming. Turn each rule into something countable before you
judge it: a grep, a line count, a ratio, or one of the commands CLAUDE.md already
prescribes for verification.

When a rule is fuzzy ("too long", "too complex"), pick a threshold, say what it was,
and let the user disagree with the number rather than with the finding.

Read the code around every hit. A grep match is a candidate, not a finding.

## How to report

Group findings by rule, worst first. For each rule:

- One line saying what the rule is and how badly it is broken.
- Concrete `file.ts:line` references — real ones you read, never guessed.
- A short quote or measurement as evidence.

End with two short sections:

- **Passing** — the rules you checked that are clean. This matters; say it plainly.
- **Suggested order** — which violation to fix first and why.

Keep it scannable. No praise, no filler, no fixes applied. If a rule cannot be
checked, say so instead of guessing.
