Use `$foliole-hosted-quality-repair` as the visible controller for this failed independent top-level dev T7 Hosted Quality run.

Repository: {{repository}}
Workflow file: {{workflowPath}}
Workflow: {{workflow}}
Run tier: {{runTier}}
Branch: {{branch}}
Trigger: {{triggerEvent}}
Run: {{runId}}
Commit: {{headSha}}
Title: {{runTitle}}
URL: {{url}}
Workspace: {{workspace}}

The handoff is only a locator. Confirm that the workflow file is the top-level T7 Hosted Quality entry and the branch is `dev`, then read the run, its jobs, and failed logs directly from GitHub before diagnosing it or assigning `failedStage`. Repair every failure exposed by this run locally, run risk-matched local validation, and use `$commit-note` for each scoped local repair commit. This handoff carries standing authorization for the bounded commit sequence needed to resolve failures owned by this controller, including failures exposed by its registered orchestrator revalidation, but not for a push. If the latest repair commit is not yet on remote `dev`, report `repairState=waiting-for-dev-delivery`; after normal delivery, use only the registered dev Remote Quality orchestrator and `quiet-wait` for revalidation. Never treat a later scheduled T7 Hosted Quality run as repair evidence. The user authorizes bounded internal collaboration subagents under the skill's ownership rules. If read-only GitHub access needs approval, surface that boundary and wait for the user to resume this visible task.
