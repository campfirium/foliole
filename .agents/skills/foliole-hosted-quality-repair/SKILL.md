---
name: foliole-hosted-quality-repair
description: Diagnose, classify, locally repair, verify, and commit one failed Foliole T5 admission, T6 hosted-quality, or T7 release workflow run from a handoff locator, then audit local gate coverage gaps. Use when a Codex Desktop task names a failed Foliole hosted-quality run ID, T5/T6/T7 workflow, or asks the visible controller to take over a hosted-quality repair.
---

# Foliole Hosted Quality Repair

Act as the single visible controller for one failed hosted-quality run. Treat the handoff as a locator, not as failure or stage evidence. Read the run, repository history, and working tree before judging it. Only scheduled T6 is a rolling health stream; independent T5, manual T6, and T7 runs are exact observed runs with no implied successor.

## Establish the source of truth

1. Extract the repository, stable workflow file, declared `runTier`, run ID, immutable head SHA, branch, URL, and workspace from the task.
2. Read the complete run with `gh run view <run-id> --repo <repository> --json jobs,conclusion,event,headBranch,headSha,displayTitle,url,workflowName` and fetch failed-step logs with `gh run view <run-id> --repo <repository> --log-failed`.
3. If read-only GitHub access requires approval, request only the exact read operation. If the handoff cannot surface approval, set `repairState=waiting-for-read-approval`; do not diagnose from locator fields.
4. Verify that the returned SHA equals the locator SHA. Stop on mismatch.
5. Inspect `git status`, the named commit, and relevant history. Preserve unrelated dirty changes; never switch, reset, or overwrite the workspace to match the run.

Resolve `runTier` from the stable workflow file, not the display name:

- `.github/workflows/t5-baseline-admission.yml` → `T5`
- `.github/workflows/t6-hosted-quality.yml` → `T6`
- `.github/workflows/release-candidate-quality.yml`, `release-windows.yml`, `release-macos.yml`, or `publish-release.yml` → `T7`

Assign `failedStage` only after reading jobs. Independent T5 failures are `T5`. For T6, a failed job in the `t5-baseline` reusable chain is `failedStage=T5`; report `runTier=T6, failedStage=T5` and confirm the T6 `full-quality` heavy job was skipped. Other T6 failures are `T6`. T7 failures are `T7`. If job evidence cannot identify the stage, report `failedStage=unknown` and do not guess.

## Triage and coordinate

- Inspect every failed job before editing and group failures by shared root cause, host chain, and overlapping write scope.
- Use internal collaboration subagents only when the handoff explicitly authorizes them and project rules permit delegation. Create at most one worker per non-overlapping root-cause family with explicit ownership, forbidden overlaps, the narrowest validation, and a return contract of root cause, files changed, evidence, and blockers.
- Workers must not commit, push, dispatch hosted quality, create tasks, or create more workers. The visible controller owns root-cause judgment, integration, final diff review, and reporting.
- Do not weaken quality gates, widen allowlists, or flip assertions merely to make checks green. Separate pre-existing or external failures from failures caused by the target SHA.

## Repair and verify

1. Implement the smallest complete root-cause repair and run the narrowest relevant local tests first.
2. Stop for product judgment, external service or signing failures, missing permission, write-scope expansion, or ownership conflict. A refined hypothesis or intermediate red check is not a stop condition.
3. Resolve every in-scope failure family from the observed run, then review the integrated diff and preserve unrelated changes.
4. A monitor handoff that identifies the run and says it is only a locator authorizes one local commit containing only the verified repair. Use `$commit-note`; otherwise obtain explicit commit authorization.
5. Never push, dispatch Remote Quality or another hosted workflow, freeze `dev`, or wait for a later run. Normal development publication owns remote delivery. A later scheduled T6 is a separate rolling sample and every other later run has a separate owner.
6. Set `repairState=complete` only when every observed in-scope failure is locally resolved, risk-matched validation is green, and the scoped repair is committed locally.

## Audit local detection after repair

Treat prevention as a separate post-commit lane. For each root-cause family, identify the narrow local reproducer and whether changed-file, fast-quality, pre-push, or host routing would have selected it. Classify it as exactly one of `local-validation-missed`, `local-gate-coverage-gap`, `hosted-only-by-design`, or `pre-existing-or-external`.

For a confirmed `local-gate-coverage-gap`, create at most one separate local Codex Desktop task per non-overlapping checker or routing family. Give it the immutable run URL and SHA, raw failed checks, counterfactual evidence, checker-only ownership, forbidden product-repair files, and a contract that the triggering diff selects the intended check. Do not open coverage tasks for the other classifications or fold prevention work into the completed repair.

An explicit invocation authorizes these bounded local-coverage tasks. If triggered implicitly, obtain authorization first. Coverage tasks are user-owned siblings and must not commit, push, or dispatch hosted quality without authorization in their own task.

## Report controller state

Report `runTier`, `failedStage`, `repairState`, and `preventionState` separately. Valid repair states are `waiting-for-read-approval`, `investigating`, `repairing`, `committing`, `auditing-local-coverage`, and `complete`. Valid prevention states are `auditing`, `not-a-gap`, `task-created`, and `waiting-for-task-creation`; prevention never blocks repair completion.

Never describe `thread created`, `Desktop opened`, or `prompt delivered` as hosted-quality processing progress.
