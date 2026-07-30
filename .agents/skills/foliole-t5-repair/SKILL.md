---
name: foliole-t5-repair
description: Diagnose, locally repair, verify, and commit one failed Foliole T5 quality sample from a handoff locator, then audit why local quality did not catch each failure and open separate visible tasks for confirmed local gate coverage gaps. Use when a Codex Desktop task names a Foliole T5 run ID, failed T5 workflow, nightly remote-quality failure, or asks the visible controller to take over T5 repair.
---

# Foliole T5 Repair

Act as the single visible controller for the local repair of one failed T5 sample. Treat the handoff payload as a locator, not as failure evidence. Read the run, repository history, and working tree directly before judging the failure. T5 is a rolling health stream: this task owns the failures observed in its run, not remote branch publication or a fixed-SHA full-green campaign.

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
5. Resolve every root-cause family exposed by the observed run. Keep iterating locally until each reproducible original failure is green or a genuine stop condition is reached.
6. An automated T5 monitor handoff that identifies the run and states that the handoff is only a locator carries standing authorization to create one local commit containing only the verified in-scope repair. Use `$commit-note`; do not absorb unrelated dirty files or hunks. For other invocations, obtain explicit commit authorization.
7. Never push, dispatch Remote Quality, dispatch another T5, freeze `dev`, or wait for a later hosted run from this repair task. Normal development publication will eventually carry the local commit to remote `dev`; the next scheduled T5 is a separate rolling health sample and may create a new repair task.
8. Complete the repair lane when all failures from this observed run are locally resolved, risk-matched local validation is green, the integrated diff is clean, and the scoped repair is committed locally.

## Audit local detection after repair

Treat prevention as a separate post-commit lane that does not block repair completion. Begin it only after the immediate repair is locally verified and committed. Do not analyze local coverage or create coverage tasks while the root cause or repair diff is unsettled. The visible controller owns the audit; do not ask a repair worker to judge whether its own failure should have been caught locally.

1. For every resolved root-cause family, identify the narrow local command that reproduces it and trace whether normal changed-file, fast-quality, pre-push, or host-specific routing would have run that command for the target diff.
2. Classify the result as exactly one of:
   - `local-validation-missed`: the correct local command and route existed, but the required targeted validation was not run.
   - `local-gate-coverage-gap`: a stable mechanical check existed or should exist, but routine local routing could not select it for the triggering files.
   - `hosted-only-by-design`: the failure depends on an OS, runner, service, credential, or remote state that the local workflow cannot faithfully provide.
   - `pre-existing-or-external`: the target SHA did not create the failure and local coverage is not the relevant cause.
3. Record the counterfactual evidence: the triggering files, the check that should have caught them, the route that skipped them, and why the comparison case stayed green. Do not label a gap from timing alone or from a broad gate that happened not to be run.
4. When `local-gate-coverage-gap` is confirmed, create a separate visible Codex Desktop task to close it. Use `create_thread`, the saved Foliole project, and the `local` environment; never request a default worktree. Group gaps that share one checker or routing root cause, and create at most one task per non-overlapping coverage family.
5. Give each coverage task the immutable run URL and SHA, raw failed checks, the counterfactual evidence, ownership limited to checker/routing/contract-test files, forbidden product-repair files, and this acceptance contract: the triggering diff now selects the intended local check and a regression test locks that route. The task must not commit, push, or dispatch hosted quality without authorization in that task.
6. Wait for successful task creation and initial progress when the tool is available; task creation alone is not evidence that the gap is fixed. Do not open a coverage task for `local-validation-missed`, `hosted-only-by-design`, or `pre-existing-or-external`; report the evidence instead.
7. If task creation is unavailable, report the prevention lane as `waiting-for-task-creation` and finish the repair task. Do not fold prevention implementation into the completed repair.

An explicit invocation of `$foliole-t5-repair` includes authorization for these bounded local-coverage tasks. If the skill was triggered implicitly, obtain user authorization before creating them. Coverage tasks are user-owned sibling tasks, not internal workers; the visible controller must not absorb or stage their changes.

## Report controller state

Keep delivery and repair status distinct:

- `waiting-for-read-approval`: the visible task exists, but GitHub evidence has not been read.
- `investigating`: complete run evidence is being triaged.
- `repairing`: one or more root-cause families are being repaired.
- `committing`: the locally verified repair is being isolated and committed.
- `auditing-local-coverage`: the local repair commit exists and the post-repair local-detection audit is running.
- `complete`: all failures observed in the run are locally resolved, risk-matched local validation is green, and the scoped repair is committed locally.

Track the prevention lane separately as `auditing`, `not-a-gap`, `task-created`, or `waiting-for-task-creation`. Prevention status never blocks repair state `complete`.

Never describe `thread created`, `Desktop opened`, or `prompt delivered` as T5 processing progress.
