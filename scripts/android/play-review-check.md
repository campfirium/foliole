# Play availability continuation

`mobile-review-check.yml` runs short default-branch checks around every 30 minutes.
GitHub may delay or skip scheduled runs. An immediate exact-candidate check uses:

```sh
gh workflow run mobile-review-check.yml --ref dev -f candidate_id=DEPLOYMENT_ID
```

Only candidates already registered by trusted delivery are eligible. The checker
executes current `dev` code, treats candidate source as data, and never uploads,
updates tracks, commits edits, publishes a GitHub Release or cancels reviews directly.
After availability checks it may resume one previously authorized Android submission
through the exact source admission job and its dependent jobs.
The checker has scoped Actions write permission for this exact-job continuation,
without signing secrets or executing candidate code. Both this workflow and the
complete Android distribution workflow use the same
Play concurrency group with `queue: max`, preserving queued uploads.

## Temporary snapshot contract

The release summary's `PUBLISHED` state includes paused and partial releases.
After the exact candidate is published, the checker verifies that all registered
upload/commit operations and prior snapshots have resolved. It then persists a
creation marker, creates an edit snapshot, reads the original beta release's full
track state, and deletes the snapshot before recording an availability result.
Only the exact completed release, with its single original version code and no
newer active artifact, qualifies. The lifecycle is refreshed after deletion.
Review, approval without publication, incomplete rollout and absent candidates
remain waiting. A rejected review ends that candidate's scheduled waiting.

Creating an edit invalidates an existing edit owned by the same API account.
Do not use that account in other editing tools alongside this workflow. Console
changes can invalidate a snapshot; failures never establish availability.

## Interrupted checks

GitHub Deployment statuses retain original delivery and snapshot state separately.
A known open snapshot is deleted by its original ID on restart; a confirmed 404
also establishes absence. Failed cleanup blocks subsequent snapshot creation and
new distribution edits. If creation's response was lost, the saved `creating`
marker blocks automatic retries: the release owner must reconcile the account's
actual edit before authorizing recovery. Do not reset the marker merely to retry.
No generic retry, upload, commit or replacement edit is used to hide uncertainty.

Completed Android checks stop scheduled waiting. A manual check can refresh the
same candidate and revoke an old result. Deployment state remains `pending`:
Android availability alone is not combined iOS/Android readiness or public-release
permission. The later public gate must freshly check both exact candidates.

Local HTTP boundary tests cover restart, lost responses and rejection behavior;
they do not establish actual store availability, APK installation or retained data.

Sources: [Google edit lifecycle](https://developers.google.com/android-publisher/edits),
[release summary](https://developers.google.com/android-publisher/api-ref/rest/v3/applications.tracks.releases),
[track states](https://developers.google.com/android-publisher/api-ref/rest/v3/edits.tracks),
[GitHub concurrency](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency).

## Desktop review notifications

The checker saves the exact registered candidate's latest Google lifecycle as
`Play review: <state>` in its trusted GitHub Deployment history, independently of
`Play availability`. Approval does not establish tester availability.

The existing local desktop handoff producer reads these trusted records through
`github-play-review.json` in its personal monitor directory. It notifies once per
candidate for approval, rejection and verified tester availability. First activation
baselines existing results; later new candidates and state changes are eligible.
Submission failures remain retryable, and submitted identities survive restarts.
The monitor never calls Google, uploads, publishes or edits a release. It requires
the Mac handoff daemon to be running; remote checks retain state while it is offline.
The default local cadence is 15 minutes, after the approximately 30-minute hosted
check. GitHub scheduling may add delay. Only registered candidates are covered;
legacy Console submissions without a durable registration are not inferred.

## Approval awaiting manual publication

The Google Play Developer API discovery revision `20261105` exposes only `list`
on `applications.tracks.releases`. It provides review lifecycle observations,
not a method to publish one approved release. Updating an edit's track to
`completed` and committing the edit is not evidence that managed publication
has been released. Do not invent a publish route or recommit an approved release
to bypass this state.

With managed publishing disabled, Google normally publishes changes after
approval; the existing checker can then resume the queued original source.
With managed publishing enabled, `APPROVED_NOT_PUBLISHED` remains waiting.
The owner must inspect the Console's complete ready-to-publish scope before
deciding the manual action; beta inventory alone cannot exclude accompanying
store-listing, policy or production changes. Never toggle this app-wide setting
as an automatic recovery action. A historical setting observation is not a fresh
confirmation of its current value.

Sources: [release resource methods](https://developers.google.com/android-publisher/api-ref/rest/v3/applications.tracks.releases),
[managed publishing](https://support.google.com/googleplay/android-developer/answer/9859654),
[safe edit commit](https://developers.google.com/android-publisher/api-ref/rest/v3/edits/commit).

## Submission queue

The trusted default-branch admission job validates the original full quality ZIP,
its digest, actual source run/lane, admission jobs and source package version. It
registers an immutable `foliole-play-submission` Deployment in
`foliole-play-beta-queue` before any version allocation, Google edit or upload.
A pending review, approval without publication, or earlier queue ticket produces
`waiting` with a successful job; Android build and delivery are skipped. Formal
Draft assembly waits for actual Android assets. Outer release and Android QA
concurrency queues preserve pending source runs rather than replacing them.

The existing schedule first observes registered releases, then processes the oldest
unfinished ticket. It waits until the preceding release is published, revalidates
its original full-quality artifact and resumes only the Android admission job with
GitHub's job-rerun API. That API also reruns dependent packaging/assembly jobs; it
does not rerun full quality or other platforms' successful packaging. The admission
job checks current Play state again, and existing upload/commit protections remain
in force. Original source SHA and release notes are retained even when branches
advance. Publication observations are durable so an older release disappearing
from Google's inventory after replacement cannot stall the next queued candidate.

A review rejection blocks the affected queue and its successors. Cancelled source
runs, expired quality evidence and uncertain rerun responses require owner
reconciliation; they never trigger automatic replacement uploads or duplicate
reruns. Before requesting a rerun, the checker durably writes
`Play submission: resuming:<attempt>`. If its response is lost, a newer source
attempt proves that it started; otherwise the checker reports
`resume-outcome-unknown`. A completed attempt whose admission never recorded a new
state reports `resume-needs-reconciliation`. Preserve these markers when inspecting
the original run. GitHub's rerun age limit and artifact expiry still apply.

`candidate_id` remains an exact availability inspection and never dispatches an
unrelated queue entry. A general scheduled or manual check without that field can
continue the oldest eligible submission. Notifications are informational, not the
submission trigger; GitHub scheduling can delay continuation.

After explicit user authorization to abandon a particular rejected/cancelled or
obsolete ticket, the owner may append `Play submission: retired` to that ticket's
Deployment statuses (state `pending`, `auto_inactive=false`). This abandons only
that queued request, does not claim publication, cancel Google review or retire
other blocked successors. New authorized candidates can follow retired tickets;
existing blocked successors require their own assessment. Never retire a ticket
to hide an unresolved upload/edit or rerun outcome.

Sources: [rerun one job and its dependents](https://docs.github.com/en/rest/actions/workflow-runs#re-run-a-job-from-a-workflow-run),
[concurrency queues](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).
