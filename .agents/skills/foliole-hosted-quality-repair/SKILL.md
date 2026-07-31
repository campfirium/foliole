---
name: foliole-hosted-quality-repair
description: Diagnose, locally repair, verify, and commit one failed independent Foliole dev T6 hosted-quality run from a handoff locator; route any release T7 failure back to the existing pinned release task instead of creating a repair task. Use when a Codex Desktop task names a failed Foliole dev T6 run, T7 release run, or asks the visible controller to take over hosted-quality repair.
---

# Foliole Hosted Quality Repair

Act as the single visible repair controller only for an independent `dev` T6 run. A handoff is a locator, not failure or stage evidence.

## Route Before Diagnosing

- Read the stable workflow path, run ID, branch, URL, and workspace from the task.
- If the run is `.github/workflows/t7-release.yml`, has branch `release`, or belongs to a T7 nested/platform stage, do not accept repair ownership, edit code, commit, dispatch, or create another task. Route the run URL and first failed stage to the existing pinned release task.
- Only an independent `.github/workflows/t6-hosted-quality.yml` run on `dev` is in repair scope.
- T5 is reusable admission inside T6/T7, not an independent repair stream. A T5 failure inside independent dev T6 is reported as `runTier=T6, failedStage=T5`.
- Legacy candidate, platform, or assembly workflow names do not establish a separate T7 repair owner.

If the pinned release task cannot be identified, report `repairState=waiting-for-release-owner` and stop. Never create a replacement release task from this skill.

## Establish The Source Of Truth

1. Read the complete run with `gh run view <run-id> --repo <repository> --json jobs,conclusion,event,headBranch,headSha,displayTitle,url,workflowName` and fetch failed-step logs with `gh run view <run-id> --repo <repository> --log-failed`.
2. If read-only GitHub access requires approval, request only the exact read operation. Without it, set `repairState=waiting-for-read-approval`; do not diagnose from locator fields.
3. Confirm the returned branch is `dev` and the workflow is the independent T6 entry. Treat any mismatch as a routing failure.
4. Use the returned commit identity only to correlate the observed run with repository history. Do not make it a human dispatch or branch-control input.
5. Inspect `git status`, the named commit, and relevant history. Preserve unrelated dirty changes; never switch, reset, or overwrite the workspace to match the run.
6. Inspect every failed job before editing. Set `failedStage=T5` only for failure in the nested admission chain; otherwise set `failedStage=T6`. Do not guess when evidence is incomplete.

## Repair

1. Group failures by shared root cause and overlapping write scope.
2. Implement the smallest complete root-cause repair on `dev`. Do not weaken gates, widen allowlists, delete stable assertions, or replace native/user-path coverage with a narrower mock merely to get green.
3. Run only checks registered as `local-quick`, starting with the narrowest reproducer. Local green never replaces hosted evidence.
4. Review the integrated diff and preserve all unrelated changes.
5. A monitor handoff that names the independent run and states it is a locator authorizes one local commit containing only the verified repair. Use `commit-note`; otherwise obtain explicit commit authorization.
6. This handoff authorizes the repair commit, not a push. Before revalidation, prove that the repair commit is reachable from remote `dev`. If it is not, set `repairState=waiting-for-dev-delivery` and stop unless the user separately authorizes the push.
7. Once the repair is reachable from remote `dev`, request hosted revalidation only with `npm run quality:remote -- --scope <desktop|shared|android|ios|full>` while on `dev`, then use `quiet-wait` for the terminal result. Never pass a SHA; the workflow event derives the internal target commit.
8. Never enter `release`, mutate a Draft, reuse T7 evidence, or transfer the repair to the pinned release task.

Stop for product judgment, external service failure, missing permission, write-scope expansion, or ownership conflict. An intermediate red local check is not itself a stop condition.

## Prevention Audit

After the repair commit, identify the narrow reproducer and whether the changed-file, fast, pre-push, or host routing should have selected it. Classify the root cause as exactly one of:

- `local-validation-missed`
- `local-gate-coverage-gap`
- `hosted-only-by-design`
- `pre-existing-or-external`

Report the classification and evidence. Do not automatically create sibling tasks; monitor ownership stays singular.

## Report

Report `runTier`, `failedStage`, `repairState`, and `preventionState` separately. Valid repair states are `waiting-for-read-approval`, `waiting-for-release-owner`, `investigating`, `repairing`, `committing`, `waiting-for-dev-delivery`, `waiting-for-orchestrator`, and `complete`.

Set `repairState=complete` only after every observed in-scope dev T6 failure is locally resolved, risk-matched `local-quick` validation is green, the scoped repair is committed, and the registered dev orchestrator has reached its required terminal state. Never describe task creation, Desktop navigation, or prompt delivery as hosted-quality progress.
