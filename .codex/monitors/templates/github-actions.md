Use `$foliole-hosted-quality-repair` as the visible controller for this failed hosted-quality run.

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

The handoff is only a locator. Read the run, its jobs, and failed logs directly from GitHub before diagnosing it or assigning `failedStage`. Repair every failure exposed by this run locally, run risk-matched local validation, and use `$commit-note` to create one scoped local repair commit. This handoff carries standing authorization for that commit only. Do not push, dispatch hosted quality, freeze `dev`, or wait for a later run; a scheduled T6 is a separate rolling health sample. The user authorizes bounded internal collaboration subagents under the skill's ownership rules. If read-only GitHub access needs approval, surface that boundary and wait for the user to resume this visible task.
