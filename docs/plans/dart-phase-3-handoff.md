# Handoff: plan Dart phase 3 with Rohit (planning only)

Written 2026-11-04 by the phase 2 orchestrator session. You are a separate Claude Code session in an Orca tab on the Mac. Rohit will chat with you here to turn the phase 3 outline into a full plan, the same way phase 2 was planned. Wait for Rohit's first message after reading this; don't start writing the plan until he says so.

## Project

1. Orca fork `Interstellar-code/orca` (a clone of the open-source stablyai/orca). Mac checkout: `/Users/rohits/Development/orca`, branch `main`. `origin/main` = `47247967004`.
2. Dart (dartai.com) is a task tracker. Phase 1 (merged, accepted by Rohit 2026-11-03) added a Dart tab to Orca's Tasks page: connect with a token, a flat task list, board and assignee filters.
3. Phase 2 (in progress in another session, do not touch) adds editing from the Dart tab: field pickers, comments, a safe description patch, and a New task dialog. It is built in lanes on the Ubuntu server Orca Ubu 7of9, on unmerged local branches (`dart/phase-2-core`, `-t4b`, `-t5`, `-t6`, `-t7`). Its code is not on `main` yet.

## Read first

1. `docs/plans/dart-phase-3.md`: the phase 3 OUTLINE (66 lines). Goals G1-G7, rough tasks P3-1 to P3-9, later candidates, the phase 4 note, and 7 open questions.
2. `docs/plans/dart-phase-2.md`: the finished phase 2 plan, the model to follow for format and depth. Look at its structure (goal, "What exists" with file:line refs, decisions D1-D13, rules for every worker, tasks T1-T8 each written so it can be pasted as a worker prompt, files owned per task, accept checks, gates, D10 routes). Phase 3 builds on phase 2's contracts (`dart-detail-contracts.ts`, frozen), its write queue, the field editors and the D13 drafts.
3. The design canvas: https://claude.ai/artifact/KQ1KRfMTagC8me6fhvADsb. The top row is phase 2; the bottom row is the phase 3 mockups (board).
4. Note: `docs/` is gitignored, so plan files need `git add -f` when committing.

## How phase 2 was planned (repeat this)

1. Outline, then the open questions answered with Rohit (one at a time, a recommendation for each).
2. A detailed plan: "What exists" read from the code on the base commit (file:line refs, reuse map: the Linear and Jira boards, `IssueBoardColumns.tsx`, the Jira and Linear view-mode storage, the quiet-refresh hooks), decisions numbered D1.., tasks with files owned, accept checks and gates.
3. Mockups on the design canvas, referenced from the plan (design mockups are done by the main session itself, not by subagents).
4. Review rounds: independent reviewers (an OMP lane and Claude Opus) read the plan against the code and Rohit's goals, then fixes between rounds. Phase 2 took 6 rounds. Reviews are separate passes; never self-approve.
5. Routes: Rohit sets the model and effort per task (phase 2's D10). Ask him; don't decide routes for him.
6. Commit the plan to `main` on Rohit's go (`docs(dart): ...`), push only on his go.

## Open questions to work through (from the outline)

1. Saved views: the API has no list of views or dartboard ids. Paste a view URL, type a view title, or skip views? (Outline's pick: dartboards from `/config` now, saved views by pasted URL if Rohit uses views.)
2. Page cap 250 per read versus a workspace with 883 tasks: page to a budget, or require narrowing? (Pick: default scope "mine", up to 4 pages, "first N of M".)
3. Do statuses differ per dartboard?
4. Polling interval and cost (pick: 60 s, paused when hidden, stop on 429).
5. Does `parent_id` work live, and do subtasks also appear in the normal list (dedupe)?
6. Drag across dartboards: not planned (status only). Confirm.
7. Column order via `o=order`: check that it matches the dartai board.

Questions 3, 5 and 7 can only be settled against the real Dart API. The standing rule is no live Dart calls. Ask Rohit whether to run read-only checks or to write them into the plan as checks for his phase 2 hands-on test. Never write to his Dart workspace.

## Rules

1. Planning only. Build nothing, start no lanes or workers, and don't touch the phase 2 run (`run_763acfb25172`), its worktrees on Ubu, or its branches.
2. Edit only `docs/plans/dart-phase-3.md` (and new phase 3 files in `docs/plans/`). Don't edit `docs/plans/dart-phase-2.md`: it has uncommitted corrections owned by the phase 2 session.
3. No commit, push or PR without Rohit's go. Never `git checkout` or `git stash`.
4. Never print or paste the Dart token (`~/.config/dart/header`).
5. Follow `AGENTS.md` (repo rules, `docs/STYLEGUIDE.md` for UI) and Rohit's global `CLAUDE.md` (reply style, plain words, numbered points, no silent workarounds).
6. CodeGraph is indexed here (`.codegraph/`): use `mcp__codegraph__codegraph_explore` before grep or Read when you look up code.
