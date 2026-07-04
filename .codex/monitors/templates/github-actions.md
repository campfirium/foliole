# {{tier}} remote check failed: {{workflow}}

Source: {{source}}
Repository: {{repository}}
Workflow: {{workflow}}
Branch: {{branch}}
Run: {{runId}}
Commit: {{headSha}}
Title: {{runTitle}}
URL: {{url}}
Workspace: {{workspace}}

Please inspect this Foliole {{tier}} remote quality failure.

Start by running `gh run view {{runId}} --repo {{repository}} --json jobs,conclusion,headBranch,headSha,displayTitle` and then fetch the failed job log if needed. Identify whether this is a repeat failure, a workflow/script issue, an environment issue, or a real product regression.

Before proposing or applying a fix, inspect the related commit title and full commit message/body for the code or test that failed. Treat that original implementation intent as evidence: explain how the failure relates to the intent, then choose a root-cause correction. Do not simply widen allowlists, flip assertions, or clear local validation blockers unless that matches the commit intent and the current task boundary.

Report first with the narrowest local reproduction or verification entry. Do not commit, push, rerun, release, or move tags unless the current thread receives a new explicit instruction for that action.
