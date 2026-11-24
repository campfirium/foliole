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

Completed Android checks stop scheduled waiting: a candidate whose review was
rejected, or whose public status is `available` without a later manual `waiting`
result, is no longer checked on schedule, and neither is any older candidate once a
newer one is available. A later halt or rollback is therefore not detected on
schedule; an exact `candidate_id` check refreshes the same candidate and can revoke
an old result, after which scheduled waiting resumes for it. Unchanged results are
not rewritten, so a candidate waiting in review adds history only when its review,
public status or result actually changes.

### Deployment status limit

GitHub keeps at most 100 statuses per Deployment and rejects the 101st write with
HTTP 422. A write lost this way between edit creation and `open:<id>` leaves a Play
edit whose ID is unknown and a `creating` marker that can never be updated. Before
writing any `creating` marker, each edit-creating path therefore counts the
Deployment's statuses and stops before creating the edit unless the whole round
fits: availability snapshots need 5 (`creating`, `open`, `cleared`, public status,
result), version reservation snapshots 8 (four preparation markers plus later queue
states) and upload edits 7 (two edit markers plus five delivery phases). The error
names the Deployment and its used count. A full Deployment requires owner
reconciliation; it is never worked around by writing elsewhere.

### Owner reconciliation records

When the release owner has reconciled a marker that can no longer be updated on its
Deployment, the authorization is recorded in
`scripts/android/play-snapshot-reconciliations.json` and committed to `dev`. Each
entry names `deploymentId`, the unresolved snapshot `marker` value (for example
`creating`), the exact GitHub `statusId` and `statusCreatedAt` of that status, and an
`authorization` sentence naming the task, the owner's confirmation and its date. The
snapshot is treated as `cleared` only while that exact status is still the
Deployment's newest status; any later status, a different status ID, time, marker or
Deployment leaves the original fail-closed behavior in place. Add an entry only
after the owner has confirmed the account's actual edit state; the record is not a
retry switch.

T853 recorded Deployment `7728198485`: run 44068281334 hit the status limit while
writing `open:<id>`, so its `creating` marker (2026-11-17T10:49:17Z) remained. The
owner confirmed on 2026-11-24 that the possible leftover edit is read-only, was
never committed and is invalidated by any newer edit from the same account. That
Deployment cannot accept further statuses, so an exact manual check of it fails
before creating an edit; the candidate is already `available` and is no longer
checked on schedule. Deployment state remains `pending`:
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

The trusted default-branch preparation job validates the original full quality ZIP,
its digest, actual source run/lane, admission jobs and source package version. It
registers an immutable `foliole-play-submission` Deployment in
`foliole-play-beta-queue` and durably reserves a version code before building.
Reservation reads the actual bundle/APK/all-track inventory through a short-lived
edit snapshot. It never uploads, updates tracks or commits the snapshot, and must
confirm deletion before allowing a build. Creation/cleanup markers and the reserved
number survive response loss and restart. All later allocations include these
reservations even if a ticket is retired or its archive expires.

The original source then builds and signs once, saving an immutable signed ZIP
before upload admission checks the preceding review. New signed candidates use
schema version 2 and contain no upload edit. Pending review, approval without
publication or an earlier ticket produces successful `waiting` after packaging;
the upload is skipped. The checker verifies the original quality, reserved version,
source and signed ZIP before rerunning only **Admit prepared Android upload or
wait for review** and dependent delivery/assembly jobs. Build/sign is upstream and
is not rerun. Admission checks again and exports the verified original artifact
name directly to delivery, without depending on stale build-job outputs.

After admission, trusted delivery creates a fresh upload edit using durable
`creating`/`open:<id>` markers on the original candidate. Lost creation responses
stop automatic creation; known edits, upload hashes and commit outcomes use the
existing exact-candidate recovery. A package whose reserved number conflicts with
new remote changes fails rather than being silently renumbered or rebuilt.

Older queued runs without the `prebuilt` contract retain their original
build-after-publication job and schema version 1 recovery. Rerunning a job uses
that original workflow snapshot, so changing dev does not retrofit an already
queued run. Do not replace or dispatch a duplicate source to conceal this boundary.
A newer accepted source reserves and builds independently of older queue or review
waiting states, including legacy tickets without an allocated code. Review and
submission readiness gate upload only; they never postpone packaging. Unresolved
inventory edits still block another snapshot because creating one could invalidate
the original edit.

Publication observations remain durable so an older release disappearing from
Google's inventory after replacement cannot stall the next queued candidate.
Expired checkpoints fail closed and require owner reconciliation; they are not
permission to build a replacement. Formal Draft assembly still waits for actual
Android delivery assets. Existing concurrency queues preserve source runs.

A review rejection blocks the affected queue and its successors. A blocked queue,
cancelled source run or approval awaiting publication fails the scheduled check
with the original run URL and a recovery instruction; it does not report a
successful idle check. This also covers legacy Console releases that have no
registered candidate notification. Ordinary review remains successful waiting.
Failures appear in the existing GitHub Actions failure surface; this does not
create a separate notification service or guarantee a user's notification settings.
Expired quality evidence and uncertain rerun responses require owner
reconciliation; they never trigger automatic replacement uploads or duplicate
reruns. Before requesting a rerun, the checker durably writes
`Play submission: resuming:<attempt>`. If its response is lost, a newer source
attempt proves that it started; otherwise the checker fails with an unknown-outcome
error. A completed attempt whose admission never recorded a new state fails with
an admission-reconciliation error. Preserve these markers when inspecting
the original run. GitHub's rerun age limit and artifact expiry still apply.

`candidate_id` remains an exact availability inspection and never dispatches an
unrelated queue entry. A general scheduled or manual check without that field can
continue the oldest eligible submission. Notifications are informational, not the
submission trigger; GitHub scheduling can delay continuation.

At upload admission and scheduled continuation, an older waiting source no longer
blocks a later accepted source when its original Google release and version codes
have disappeared, every original build/sign and delivery attempt completed as
skipped, and there is no signed archive, registered candidate or unresolved
preparation/upload/edit/commit/rerun operation. The later source retains its own
quality, identity, reservation and signed-checkpoint checks. Current Google review
still gates upload. The checker skips that unexecuted older source without
rerunning it or changing its history; reserved codes remain consumed.

A later accepted source can also continue past a cancelled prebuild with no
original Google blockers and a cleared version reservation. Across every run
attempt, build/sign, upload admission and delivery must be cancelled or skipped
with an explicit empty step list and no runner assigned. Signed artifacts,
durable candidates and unresolved operations preserve the original queue turn.
The successor still waits for the cancelled turn's queue predecessor and for any
current Play review. The cancelled run and its reserved version code stay in
history.

Historical `retired` records are not publication or operation-reconciliation proof.
This factual selection needs no retirement command or author authorization. It
does not clear another blocked successor or bypass an unknown operation; missing
execution evidence preserves the original queue protections.

Sources: [rerun one job and its dependents](https://docs.github.com/en/rest/actions/workflow-runs#re-run-a-job-from-a-workflow-run),
[concurrency queues](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).
