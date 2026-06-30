# Actions failed: {{workflow}}

Source: {{source}}
Repository: {{repository}}
Workflow: {{workflow}}
Branch: {{branch}}
Run: {{runId}}
Commit: {{headSha}}
Title: {{runTitle}}
URL: {{url}}
Workspace: {{workspace}}

Please inspect this GitHub Actions failure for Foliole.

Start by running `gh run view {{runId}} --repo {{repository}} --json jobs,conclusion,headBranch,headSha,displayTitle` and then fetch the failed job log. Identify whether this is a repeat failure, a workflow/script issue, or a real product regression. If a small repository fix is clearly needed, implement it, run the narrowest relevant local verification, commit, push, and watch the follow-up run. If human input is required, stop with a concise blocker report.
