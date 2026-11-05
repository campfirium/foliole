# Play availability continuation

`mobile-review-check.yml` runs short default-branch checks around every 30 minutes.
GitHub may delay or skip scheduled runs. An immediate exact-candidate check uses:

```sh
gh workflow run mobile-review-check.yml --ref dev -f candidate_id=DEPLOYMENT_ID
```

Only candidates already registered by trusted delivery are eligible. The checker
executes current `dev` code, treats candidate source as data, and never uploads,
updates tracks, commits edits, publishes a GitHub Release or cancels reviews.
Both this workflow and the complete Android distribution workflow use the same
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
