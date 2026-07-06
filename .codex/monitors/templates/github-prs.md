# {{handoffTitle}}

Source: {{source}}
Repository: {{repository}}
PR: #{{number}} {{prTitle}}
Branch: {{headRefName}} -> {{baseRefName}}
Author: {{author}}
URL: {{url}}
Check signal: {{failingChecks}}
Workspace: {{workspace}}

Use `$gh-pr-handler` for this thread. Treat this as a PR handling task, not only a check inspection.

Start by running `gh pr view {{number}} --repo {{repository}} --json number,state,title,author,baseRefName,headRefName,files,body,comments,mergeStateStatus,statusCheckRollup,url` and `gh pr checks {{number}} --repo {{repository}} --json name,state,bucket,workflow,link,description`. Then read the PR diff, classify the PR lifecycle state, and decide whether it is Adopted, Blocked intentionally, or Left open intentionally.

If this is a Dependabot PR with no reported checks, identify why checks are absent before treating it as handled. If the fix is mechanical and clearly local to the PR, repair it with narrow verification. If it is external, blocked, or needs product judgment, stop with a concise blocker report. Do not merge, close, or comment on the PR unless the current thread receives explicit approval.
