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
