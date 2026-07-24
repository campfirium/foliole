---
name: foliole-t5-repair
description: Diagnose, repair, and verify one failed Foliole T5 quality run from a handoff locator. Use when a Codex Desktop task names a Foliole T5 run ID, failed T5 workflow, nightly remote-quality failure, or asks the visible controller to take over T5 repair.
---

# Foliole T5 Repair

Act as the single visible controller for one complete T5 repair session. Treat the handoff payload as a locator, not as failure evidence. Read the run, repository history, and working tree directly before judging the failure.

## Establish the source of truth

1. Extract the repository, run ID, immutable head SHA, branch, URL, and workspace from the invoking task.
2. Read the complete run with `gh run view <run-id> --repo <repository> --json jobs,conclusion,headBranch,headSha,displayTitle,url` and fetch failed-step logs with `gh run view <run-id> --repo <repository> --log-failed`.
3. If read-only GitHub access requires approval, request only the exact read operation. If the non-interactive handoff cannot surface that approval, state that the controller is waiting for the user to resume this visible task; do not diagnose from the locator alone.
4. Verify that the returned run SHA equals the handoff SHA. Stop on mismatch.
5. Inspect `git status`, the named commit title and body, and the relevant diff or history. Preserve all unrelated dirty changes; never switch, reset, or overwrite the workspace to match the run.

Do not interpret a sandbox network error as expired GitHub authentication. Check authentication only after the same command fails with network access available.

## Triage the complete run

- Inspect every failed job before editing.
- Group failures by shared root cause, platform chain, and overlapping write scope. Do not create one worker per assertion or job.
- Treat the original commit intent as evidence. Do not widen allowlists, flip assertions, weaken quality gates, or clear blockers merely to make checks green.
- Separate unrelated pre-existing failures from failures caused by the target SHA and record the evidence for that distinction.

## Coordinate bounded workers

Use internal collaboration subagents only when the invoking handoff explicitly authorizes them and the project rules permit delegation.

- Create at most one worker for each related root-cause family.
- Give every worker an explicit file or directory ownership boundary, forbidden overlaps, the narrowest validation command, and this return contract: root cause, files changed, validation evidence, blockers.
- Workers may investigate, edit, and iterate within their scope. They must preserve unrelated changes and must not commit, push, trigger hosted quality, create App tasks, or create further workers.
- Run non-overlapping workers concurrently; otherwise sequence them.
- Return related recheck failures to the original worker. Create a new worker only after proving the failure is unrelated.
- Do not finish while a worker is active or an in-scope failure family remains unresolved.

The visible controller owns root-cause judgment, integration, conflict review, final diff review, and all user-facing updates.

## Repair and verify

1. Implement the smallest complete root-cause repair without lowering standards.
2. Run the narrowest relevant local tests first, following repository quality and host-verification rules.
3. Review the integrated diff and confirm that unrelated working-tree changes were not absorbed.
4. Stop for genuine product judgment, missing permission, write-scope expansion, ownership conflict, or an external dependency. A refined hypothesis or intermediate red check is not a stop condition.
5. Obtain explicit user authorization before committing or pushing.
6. Before rechecking, inspect active and pending T5 and Remote Quality runs. Never dispatch while either workflow has a nonterminal run. If a scheduled T5 will validate the authorized repair SHA, use that complete run instead of dispatching Remote Quality.
7. Otherwise run `node scripts/quality/remote-quality.mjs --scope full` from this controller and wait until every job reaches a terminal state. Do not dispatch another T5 workflow as the repair recheck, and do not start a second recheck while the prior one is active.
8. The Remote Quality dispatcher hard-refuses a new run while T5 or Remote Quality is active, and both workflows share a non-canceling concurrency group to close scheduling races. A scheduled T5 skips a duplicate completed full Remote validation for the same SHA. Do not cancel a run merely because one job failed; collect the complete run. Cancel only with explicit user authorization or when the run is deliberately superseded and its remaining evidence is no longer required.
9. Route a related remote red result back to its existing worker and continue until full quality is green or a genuine stop condition is reached.

## Report controller state

Keep delivery and repair status distinct:

- `waiting-for-read-approval`: the visible task exists, but GitHub evidence has not been read.
- `investigating`: complete run evidence is being triaged.
- `repairing`: one or more root-cause families are being repaired.
- `waiting-for-write-approval`: local repair is verified and awaits commit or push authorization.
- `rechecking`: full Remote Quality is running for the authorized immutable SHA.
- `complete`: all in-scope failures are resolved and the full recheck is green.

Never describe `thread created`, `Desktop opened`, or `prompt delivered` as T5 processing progress.
