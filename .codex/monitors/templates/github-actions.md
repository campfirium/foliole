# {{tier}} quality repair controller: {{workflow}}

Source: {{source}}
Repository: {{repository}}
Workflow: {{workflow}}
Branch: {{branch}}
Trigger: {{triggerEvent}}
Run: {{runId}}
Commit: {{headSha}}
Title: {{runTitle}}
URL: {{url}}
Workspace: {{workspace}}

Act as the visible repair controller for this complete Foliole {{tier}} quality session. The user explicitly authorizes this controller to create and coordinate separate visible Codex threads for bounded repair work. Use Codex App thread tools and never use collaboration subagents. If App thread tools are unavailable, stop and report that this controller was created through an unsupported handoff path; never invoke nested Codex commands or edit Codex session storage.

Start by running `gh run view {{runId}} --repo {{repository}} --json jobs,conclusion,headBranch,headSha,displayTitle` and fetch the failed job logs. Inspect the complete run before dispatching work. Group failures by shared root cause, platform chain, and overlapping write scope; do not create one thread per assertion or job.

For each related problem family, create at most one visible worker thread in this project and retain its thread id as the stable owner. Give it an explicit file/directory ownership boundary, forbidden overlaps, the narrowest verification command, and this return contract: root cause, files changed, validation evidence, and blockers. Explicitly authorize the worker to investigate, edit, run narrow checks, and iterate autonomously until its whole assigned family is green or a genuine stop condition is reached. A refined hypothesis, multiple symptoms, or an intermediate red check is not a stop condition: exclude unrelated findings and continue every owned root-cause slice that stays inside the declared family and write scope. Workers must preserve unrelated dirty changes and must not commit, push, dispatch hosted quality, or create their own workers. Only dispatch concurrent writes when scopes do not overlap; otherwise sequence them.

Wait for or read each worker from this controller. Do not emit a final answer while any worker is active, any T5 failure remains untriaged, or any in-scope family has not reached its declared acceptance checks. If a worker stops at an intermediate diagnosis even though safe work remains inside its existing scope, immediately continue the same worker without waiting for user input. Only genuine product judgment, missing permission, write-scope expansion, overlapping ownership, or an external dependency is a blocker. When a recheck shows the same root cause, a changed symptom of that root cause, or a regression caused by that repair, send the evidence back to the original worker thread. Create a new worker only after establishing that the failure is unrelated.

Before proposing or applying a fix, inspect the related commit title and full commit message/body for the code or test that failed. Treat that original intent as evidence. Do not widen allowlists, flip assertions, lower quality standards, or clear blockers unless that matches the intent and current boundary.

The controller alone integrates worker changes, reviews ownership conflicts, runs the declared acceptance checks, and—only after explicit user authorization—commits and pushes. Recheck through `node scripts/quality/remote-quality.mjs --scope full` and wait for its result in this controller; do not dispatch another T5 workflow for a repair recheck. Continue routing related red results to their existing worker threads until full quality is green.
