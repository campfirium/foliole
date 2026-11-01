# Durable security observations

The local security owner is `.lab/internal/security-maintenance/`. It is private,
rebuild-independent state; raw reports and logs remain in `.tmp/artifacts/`.
It consumes the existing coverage report without turning missing coverage into a pass.

```sh
node scripts/security/security-owner-cli.mjs import REPORT ENVELOPE package-lock.json
node scripts/security/security-owner-cli.mjs status
node scripts/security/security-owner-cli.mjs notify
node scripts/security/security-owner-cli.mjs disposition DISPOSITION.json
```

An import requires all declared asset routes and the exact observed npm lock bytes.
A CI envelope must identify the verified repository, scheduled workflow, dev SHA,
run, attempt, artifact ID and artifact SHA-256. The artifact retriever must verify
that envelope against GitHub metadata and the downloaded bytes before importing;
the owner does not independently authenticate caller-supplied metadata.
Reports older than 26 hours are rejected. Local working-tree evidence retains its
own environment and cannot attest a committed CI candidate.

Observations are immutable JSON records, published through a flushed temporary
file and atomic rename. Reimporting the same artifact is idempotent. Replaying the
records after restart restores findings, source health and dispositions. An older
report arriving late does not rewind newer observations. Interrupted writes and
failed imports preserve prior findings; successful recovery clears the import error.
A source failure cannot erase a previously observed finding. Only a later complete
observation for the same source scope can clear it.

Root advisory identities are grouped by provider, platform, package and advisory.
The npm version set contains the versions at nodes reported by npm audit, resolved
against the verified lock. It is an observed node set, not an independent semver
assessment of every node against each advisory range. Indirect affected parents do
not become additional root advisories. Unsupported details remain source errors.

Dispositions require the finding key, version digest, risk digest, status, reason
and expiry within eight days. A task and chat may own the follow-up. Changed
versions, severity or advisory range invalidate an earlier disposition. Active
findings cannot be marked fixed. Deferral and risk acceptance never make coverage
clean, and expired records remain available for review.

The owner's overall qualification remains incomplete: candidate acceptance belongs
to the coverage aggregate for the exact current candidate and environment. Historic
findings and error history are useful facts, not release approval. This entry point
does not itself authenticate caller-supplied envelopes or schedule official reviews.

The existing GitHub producer now consumes the latest completed dev scheduled run
from its ordinary workflow query, independently of the outer full-quality result.
It verifies repository/head repository, workflow path, branch, SHA and attempt,
paginates artifacts, verifies the exact artifact identity and downloaded ZIP SHA-256,
then reads the candidate's lock bytes before invoking the owner import. Failures and
missing/stale results become durable source health; previous findings remain. The
durable observation is the import checkpoint, so restart/duplicate scans do not
download the same run again. This uses the existing Mac producer and system `unzip`;
missing host extraction support is an explicit failure, not successful coverage.

Imports and dispositions now enqueue changed findings and source states through the
existing Desktop handoff inbox contract. The existing GitHub producer also refreshes
source health and retries pending security notifications on its ordinary scan. No
additional daemon or polling loop is installed. Unchanged evidence stays quiet;
recovery and recurrence create distinct episodes. Source freshness is checked on
each invocation, including when the repository has no new commit.

An immutable notification intent is flushed before enqueue; its stable event ID and
dedupe key survive a crash before the enqueue checkpoint. Failed enqueue leaves the
intent pending with a visible error. A retry uses the same identity; transport owns
delivery retries and deduplication. `status` reports enqueue receipts separately from
queued/processing, dead-letter, Desktop-open failure and `thread-open-requested`.
The latter proves the transport requested Desktop navigation after a verified paused
task; it does not prove a person viewed it. Dedupe without verified delivery remains
unverified. Dead letters are visible and are not silently resubmitted as new episodes.
Inspect their evidence and replay through the handoff skill after resolving the cause.
Notification intent and enqueue/error records live under the same private durable
owner. Raw report transport provenance remains the importer's responsibility.

Security notifications use the same batching policy as Dependabot PR notifications:
five quiet minutes after the last change, with a thirty-minute maximum wait from
the first change. Android and iPhone changes form independent batches and open
separately named tasks. Desktop/shared findings and transport health retain a
separate shared batch; they are not discarded or assigned to a mobile platform.
The existing producer checks the deadlines on its normal invocations; no additional
timer, daemon or model wakeup is installed, so delivery occurs on the first scan
after a deadline rather than exactly at the deadline.

Pending batch snapshots are durable under `notification-batches/` and visible in
`status` as `pendingNotifications`. Each notification contains the net change from
the previous notification for that group: corrections replace intermediate facts,
and changes that return to the previous state before delivery stay quiet. Raw
observations retain the intermediate history. A later change after a delivered
batch starts a new batch, just as newly arriving PRs do. Existing notification
history is retained as the initial comparison baseline, avoiding duplicate alerts
when switching to grouped batches. Enqueue/crash retries retain the batch identity.

Notification policy does not change stored findings or coverage qualification.
Known informational Android SDK and embedded SQLite/LibTomCrypt version comparisons
remain visible in `status` without opening investigation chats. The four fixed iOS
coverage-review placeholders also remain in `status`. SQLCipher vendor release
notices, JDK trust changes, Apple security releases, unknown finding identities and
source failures still notify, including informational findings. Ordinary package
updates follow the staged handover in [dependency updates](dependency-updates.md).

A missing source and a later source error share one notification identity per
scope, so a transition is one change rather than a gap recovery plus a new error.
Existing delivered and pending batch comparisons use the same normalization;
immutable queued intents retain their original content and event IDs on retry.
