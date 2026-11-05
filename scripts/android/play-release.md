# Android open testing distribution

This adapter uses the existing Play application `com.campfirium.foliole.android`,
open testing API track `beta`. It supports an exact accepted formal release on
`release` and explicit full mobile QA on the registered `check` checkout. It does
not publish production, modify countries/testers, or change iOS. Formal release
assembly owns the GitHub Draft; the adapter supplies its verified APK and receipt.

## Enable credentials

Use a dedicated Google Cloud service account with Google Play Android Developer
API enabled. Invite its email in Play Console and limit application access to
Foliole: **View app information (read-only)** and **Release apps to testing tracks**.
Do not grant production publishing, financial data, users management, or account
administrator access. Verify effective API access before enabling distribution.
Creating or expanding security-sensitive access needs the user's confirmation.

The proposed shortest authentication route uses service account JSON in a GitHub
Actions secret. Workload Identity federation is a possible alternative, but is not
configured by this adapter. Do not create/export a Google key before the credential
route is approved. Never paste credentials into chat or commit them.

Required repository secrets (only in the steps that consume them):

- `ANDROID_PLAY_SERVICE_ACCOUNT_JSON`: dedicated service account credentials.
- `ANDROID_UPLOAD_KEYSTORE_BASE64`: existing upload keystore bytes, base64 encoded.
- `ANDROID_UPLOAD_KEYSTORE_PASSWORD`: existing Keychain password.
- `ANDROID_UPLOAD_KEY_ALIAS`: existing key alias.

Use `play-provision-secrets.mjs --check <signing-config> <service-account-json>` to
validate private local files and verify the existing upload certificate. After
specific authorization, replace `--check` with `--apply` to send only these four
values to `campfirium/foliole` secrets over gh stdin. Files remain outside the
repository, owner-only (0600). Existing upload key SHA256 must be
`3A:63:39:38:11:29:26:8C:65:1A:97:3F:A4:FF:A2:4F:F2:E3:E6:B3:32:F2:28:E4:E1:E0:AB:02:AF:BE:18:0B`.
No secrets are printed or included in artifacts.

If the browser reports a generated JSON download but no file is retrievable, do not
claim that it was saved or repeatedly create keys. Google cannot re-download the
private portion. The supported alternative is to generate an RSA private key
locally, save the service-account JSON outside the repository (0600), and upload
only its X.509 PEM public certificate through **Upload existing key**. Use a generic
certificate subject, verify certificate/private-key agreement, and record expiry
for rotation before it expires. Confirm the credential replacement/revocation with
the user, then prove real token exchange and a read-only Play release query before
revoking the unretrieved old key. Configure GitHub through stdin, never chat,
command arguments or artifacts. See [Google key upload](https://docs.cloud.google.com/iam/docs/keys-upload).

## Deliver a candidate

Complete compatibility and local behavior evidence under `foliole-mobile-beta`.
The independent Mac QA checkout needs its own dependencies, Electron executable and
native rebuild before preflight. Pass the existing JDK 21 `JAVA_HOME` and Android
SDK `ANDROID_HOME` / `ANDROID_SDK_ROOT` to that QA process; a shell that cannot find
Java is a preparation failure, not a reason to skip Java/Gradle contracts. Prepare
the Electron executable before JSON-output fixtures so first-use download output
does not contaminate their output.

New product/dependency/quality inputs require a fresh full QA; do not attach an old
full result to a new product candidate. Prepare the registered QA workspace under
the existing QA skill. Ordinary QA never distributes. The explicit entry is:

```sh
npm run quality:remote -- --scope full --mobile-distribution android
```

`remote-quality.yml` admits only exact `check` source/workflow snapshots. Ordinary
QA still defaults to no distribution. T7 admits its exact release candidate after
the full chain and release-candidate acceptance. No direct distribution dispatch
is exposed by the adapter. Package version comes from the candidate's package.json;
versionCode exceeds versioned history, durable candidate reservations and current
Play bundle/APK/all-track inventory plus release states. An unresolved earlier
operation blocks a new edit. The application-wide non-cancelling concurrency group
covers reservation, build and delivery. Conflicts never trigger automatic increment
or re-upload.
Review English `play-release-notes.txt` with the candidate before dispatch.

The runner builds unsigned production Web/Capacitor/AAB assets without signing/API
secrets. Existing release validation checks identity, manifest, offline entry and
newly built assets; strict jarsigner verification checks the existing upload
certificate. The signed AAB and digest are checkpointed before upload. Returned
Play versionCode and SHA256 must match that exact archive.

## Protect review and report actual state

Trusted preparation reserves the exact source version code from full inventory
and durable history, closes its short-lived read-only inventory snapshot, then
builds/signs and saves the original AAB while the earlier beta is still in review.
Upload admission waits behind outstanding beta changes and earlier submissions.
The existing review checker resumes only upload admission and delivery after the
predecessor is published; it does not rebuild the archive. Fresh upload edits are
created only after admission. Older already-queued workflow snapshots retain their
original recovery path and are not silently migrated. See
[submission queue](play-review-check.md#submission-queue). The inner upload
preflight still refuses outstanding beta drafts, pending submission, review or
approved unpublished changes before creating an edit. Commit explicitly uses
`changesNotSentForReview=false&changesInReviewBehavior=ERROR_IF_IN_REVIEW`; the API's
unsafe default would cancel an existing review. There is no retry that changes this
parameter or silently changes to a draft. Server-side validation/commit failures
remain failures. Console-only declarations or submission requirements stay manual.

Receipt `candidate.json` retains source/accepted SHA, run, product version, allocated
code, edit, archive digest, certificate and observed `releaseLifecycleState`.
`IN_REVIEW`, `APPROVED_NOT_PUBLISHED` and `PUBLISHED` are different results. A completed
track rollout is not proof of review approval or installation. Unknown, missing,
rejected, draft and not-sent states fail; inspect the recorded state in Console.
The workflow performs one status read, without adding a background poller.

## Durable registration and trusted delivery

After the source job builds/signs and checkpoints the AAB, a separate job checks
out only the current trusted `dev` default branch. It never executes candidate
code or installs candidate dependencies. The trusted implementation must reach
the default branch before a release or explicit mobile delivery uses this path.

The job checks the actual repository/run/workflow/source, original artifact and
quality attempts, complete quality stages and admission job. It verifies archive
digests, the AAB digest, product version and base-module DEX digests. Formal releases
also require release-candidate acceptance. These facts and the trusted checker SHA
are registered as a GitHub Deployment under `foliole-play-beta` before upload.
Only this trusted job receives `deployments:write`; package preparation reads
reservations. No extra secret or source-writing permission is needed.

For schema version 2, a signed candidate has no upload edit; durable edit creation
is recorded separately before POST and its exact edit ID is saved before upload.
An uncertain creation never creates a replacement automatically. Existing schema
version 1 candidates retain their original edit and recovery contract.

Before each upload/commit, a durable deployment status records that the operation
may have started. A lost response resumes the original edit/version/hash and never
blindly repeats an upload or commit. Confirmed uploads can be reconciled from Play
after checkpoint expiry; a committed release can be observed and its APK collected
without the original AAB archive. Uncertain absent uploads or expired edits need
manual reconciliation. The standalone registration workflow's manual entry uses
the same default-branch code and provenance checks; it cannot upload or publish.

Official references: [API access](https://developers.google.com/android-publisher/getting_started),
[tracks](https://developers.google.com/android-publisher/tracks),
[edit lifecycle](https://developers.google.com/android-publisher/edits),
[safe commit](https://developers.google.com/android-publisher/api-ref/rest/v3/edits/commit),
[release lifecycle](https://developers.google.com/android-publisher/api-ref/rest/v3/applications.tracks.releases).

## Remember consumed version codes

Play current-inventory APIs omit discarded or obsolete releases. The versioned
`play-version-history.json` therefore retains the highest code proved by a Play
receipt; missing or corrupt history fails closed. Allocation combines this floor
with the current inventory rather than assuming either source is complete.

After an attempted or confirmed upload, download the original run's newest
`candidate.json` and retain it with the task evidence. Once QA integration and
workspace release finish, run this from development and commit its history update
before completing the delivery or withdrawing the new release:

```sh
node scripts/android/play-version-history.mjs record <candidate.json>
```

This accepts attempted/confirmed upload receipts, preserves their run/source/hash,
never lowers the floor, and rejects unsigned or merely prepared candidates. An
uncertain upload reserves its code until reconciled; it is never treated as free.
The delivery owner performs this durable receipt step using existing repository
permissions; the runner does not push source or gain credential permissions.

## Recover without duplicate uploads

Keep the QA owner and original run. Use GitHub **Re-run failed jobs**, preserving
successful full-quality jobs; do not rerun all jobs or dispatch another distribution
to demonstrate recovery. The job restores only that run's immutable artifacts,
including the signed archive and latest state. Expired checkpoints fail closed.
Build/sign failure before a signed checkpoint can rebuild the same allocated code.
After durable registration, delivery resumes using its original operation phase
and exact edit/code/hash. An absent uncertain upload, different bundle or expired
edit requires manual investigation; it is never uploaded automatically again.

If commit response was lost, read the exact release name/code from the lifecycle
endpoint. A matching observed release is resumed without upload/commit. Otherwise
preserve the original edit and receipts; inspect Play Console before deciding any
new operation. Console changes invalidate open API edits. Never delete the app,
reset signing or reuse consumed codes. Replacing an existing review requires explicit
authorization for that review; the safe commit guard remains enabled afterward.

Distribution-only source repairs currently need a fresh full Android QA; the iOS
`--reuse-mobile-quality` mechanism stays iOS-only. Same-run failed-job recovery
reuses its successful QA, not unrelated or newly changed product inputs.

Local tests use simulated Google responses, real candidate guards, real Git fixture
checkouts, checkpoint archive extraction and JDK signing fixtures. They do not prove
Play credentials, real upload/submission, install or retained-data upgrades. Keep
those external gaps explicit until corresponding real evidence exists.

## Read-only generated APK collection

`play-generated-apk.mjs` provides collection for a confirmed original upload.
The caller must supply the trusted original candidate identity and an independently
verified **application signing** certificate SHA256 from Play Console, not the
upload certificate or a certificate selected from the generated-APK response.
It requests that exact versionCode, selects only the universal APK for that key,
and checks the actual APK signature, package, versionCode and product version with
Android `apksigner` and `aapt2` before writing the APK and digest receipt.
`createPlayApkDownloader` performs an authenticated binary GET with `alt=media`;
it never creates an edit, uploads, commits or substitutes a split/local APK.

T7 collects the APK and `Foliole-Android-{version}-Play.json` only after the original
Play candidate is observed. Explicit mobile QA keeps its channel receipt without
requiring GitHub APK assets. Missing universal output, permission failure, or any
identity/signature mismatch blocks formal asset collection. DEX bytes must also
match the original AAB, rejecting injected installer-check/protection code. The
current application signing certificate was independently verified in Play Console;
the upload certificate is not used as a substitute.

Installer checks were explicitly disabled for future versions. Already-generated
protected APKs do not change and must not be substituted. Download success is not
approval, tester availability or an installed retained-data upgrade. The later
publication gate must still query actual channel availability.

For durable review continuation and temporary snapshot recovery, see
[Play availability continuation](play-review-check.md).

For a new formal product version, the release owner selects the affected platforms
and records cross-version sync evidence, for example `npm run release:intent --
--platforms windows --sync compatible --basis "Windows-only fix; sync unchanged"`.
Add `--write` to save the reviewed intent. A `coordinated` sync assessment requires
all active platforms; compatible changes do not automatically rebuild other hosts.
It preserves published scope/history and refuses to rewrite an already-public
version. Android has store update semantics and an exact GitHub APK download; it
does not become a desktop updater platform or invalidate the historical bridge.
