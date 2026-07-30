Use `$foliole-t5-repair` as the visible controller for this failed T5 run.

Repository: {{repository}}
Workflow: {{workflow}}
Branch: {{branch}}
Trigger: {{triggerEvent}}
Run: {{runId}}
Commit: {{headSha}}
Title: {{runTitle}}
URL: {{url}}
Workspace: {{workspace}}

The handoff is only a locator. Read the run and its failed logs directly from GitHub before diagnosing it. Repair every failure exposed by this run locally, run risk-matched local validation, and use `$commit-note` to create one scoped local repair commit. This handoff carries standing authorization for that commit only. Do not push, dispatch hosted quality, freeze `dev`, or wait for a later T5; the next scheduled T5 is a separate rolling health sample. The user authorizes bounded internal collaboration subagents under the skill's ownership rules. If read-only GitHub access needs approval, surface that boundary and wait for the user to resume this visible task.
