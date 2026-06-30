# {{handoffTitle}}

Source: {{source}}
Repository: {{repository}}
PR: #{{number}} {{prTitle}}
Branch: {{headRefName}} -> {{baseRefName}}
Author: {{author}}
URL: {{url}}
Check signal: {{failingChecks}}
Workspace: {{workspace}}

Please inspect this Foliole pull request signal. Start by running `gh pr view {{number}} --repo {{repository}} --json number,title,headRefName,baseRefName,isDraft,author,url,statusCheckRollup` and `gh pr checks {{number}} --repo {{repository}} --json name,state,bucket,workflow,link,description`. If the failure is mechanical and clearly local to the PR, repair it with narrow verification. If it is external, blocked, or needs product judgment, stop with a concise blocker report.
