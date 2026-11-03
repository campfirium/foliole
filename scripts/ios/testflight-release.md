# iPhone TestFlight release

The formal Release workflow selects `ios` through the release intent, alongside other platforms or alone for an iPhone hotfix. Ordinary development pushes and quality-only runs do not upload a build. The accepted source SHA, package version and workflow run identity must match before signing.

## QA-only mobile beta distribution

From the registered `check` QA workspace, explicitly use:

```sh
npm run quality:remote -- --scope full --mobile-distribution ios
```

This request runs the complete QA chain and then calls the same iPhone producer with `qa-mobile-beta`. It creates no GitHub Release, desktop update or website metadata. Full quality must accept the same source in this run; narrow scopes, replay, preflight bypass, dev-source requests and currently unsupported platforms fail closed. The local QA record and run title preserve the distribution choice during recovery. Ordinary quality remains unchanged. Distribution uses a separate non-cancelling parent group so a subsequent quality-only dispatch cannot cancel its upload; the registered workspace owner still permits only one active QA delivery.

Before requesting distribution, the owner must record compatibility evidence for the candidate against the **currently public macOS and Windows versions**, which may differ. Reuse evidence only when its contracts and criteria remain valid. Changed pairing, sync formats, persistence or schema contracts require affected cross-version and data-safety verification; latest-source-to-latest-source checks do not prove this. Preserve missing evidence and stop distribution rather than silently marking compatibility passed. Runtime/device acceptance follows existing host entries; these scripts do not attest it.

Only iOS is enabled. Android approval alone does not enable uploads: add its approved channel adapter and verification at this same optional distribution boundary when available.

## Execution

1. Formal release quality and release-candidate checks, or the explicit complete QA chain, accept the source SHA in this run.
2. Archive signing stays automatic for the app, extension and Swift package targets; the App Store Connect export re-signs the output for distribution, and IPA verification requires distribution entitlements and profiles. Do not force a distribution identity across archive targets. `release-ios.yml` uses macOS to run `node scripts/ios/testflight-archive.mjs`, verify the host and share extension, and execute `bundle exec fastlane ios upload` from `scripts/ios`. Upload does not wait for Apple processing.
3. A separate Ubuntu job consumes the same-run candidate artifact. `bundle exec fastlane ios distribute` checks the exact app/version/build every five minutes, for at most one hour. It assigns the existing external group, enables automatic notification, submits external review and exits. It never waits for human review approval.
4. Apple approves and distributes the update through the existing group. The website invitation remains https://testflight.apple.com/join/PszuhyJA.

The Linux continuation can be rerun after a processing timeout without uploading another IPA. Before every fresh macOS archive, `bundle exec fastlane ios prepare_build` reads the latest uploaded iOS build from Apple (including processing/failed uploads) and allocates the next major build component with `.1`. Both QA and release hold the same signing/upload lock through upload, so independent workflow run counters cannot collide. Unknown formats or exhausted number ranges stop upload. Rerunning macOS queries Apple again and builds a fresh IPA; it must not reuse a previous IPA. If upload outcome is unknown, inspect Apple before rerunning: a query cannot prove an interrupted upload was absent. Concurrent app operations are serialized. A new release run may cancel an older run through the existing parent release concurrency policy, so inspect Apple before retrying a cancelled upload.

## Credentials

The trusted workflow requires `IOS_APP_STORE_API_KEY_ID`, `IOS_APP_STORE_API_ISSUER`, and `IOS_APP_STORE_API_KEY_BASE64` for an App Store Connect key with suitable upload, external-testing and automatic-provisioning permissions. External testing requires App Manager or a higher role; the existing Developer-role notarization key is insufficient. Keep the dedicated iPhone credentials separate from macOS notarization credentials. Team API keys apply across all apps in the Apple team.

`IOS_DISTRIBUTION_CERTIFICATE_BASE64` contains a PKCS#12 export of the team's Apple Distribution certificate **and private key**. `IOS_DISTRIBUTION_CERTIFICATE_PASSWORD` protects that export. The existing macOS Developer ID certificate cannot replace it. The workflow imports the certificate into a temporary keychain, uses automatic provisioning for both registered bundle IDs and their shared App Group, and deletes temporary credentials on exit. Do not put credentials in source, artifacts or logs.

App Store Connect beta description, review contact and any required export-compliance declarations must already be valid. Automation never guesses encryption answers, changes France availability, or overrides rejected review. Missing compliance stops the job with a clear error; it is not evidence that submission succeeded.

## Verification

Run explicit local tests before hosted execution:

```sh
npm run test:files -- scripts/ios/testflight-contract.test.mjs scripts/ios/testflight-build-number.test.mjs scripts/ios/testflight-distribution.test.mjs scripts/ios/testflight-release-assets.test.mjs scripts/t7-release-selection.test.mjs scripts/release-assembly-identity.test.mjs
```

The distribution test executes the production Ruby state machine with simulated Apple responses and a virtual clock. It covers processing, timeout, unresolved compliance, wrong identity, review rejection and repeat submission. It does not prove Apple's live permissions or signing.

Ruby dependencies are pinned in `fastlane/Gemfile.lock`, including checksums. Use Ruby 4.0 and Bundler 4.0.23; run `bundle install --gemfile scripts/ios/fastlane/Gemfile`, then `bundle exec fastlane lanes` from `scripts/ios`. The generated lockfile is kept intact as one dependency-resolution artifact.

A real selected release or QA distribution must still prove signing, upload, Apple processing, external submission and the approved group update. No Simulator or device installation is performed by these scripts. Runtime preview and acceptance retain their existing host workflows.

## Release assets and publication

GitHub draft assembly stores a SHA-bound submission receipt, not an IPA download. A receipt may report pending review. Public GitHub publication performs a fresh Apple API check of that exact build and refuses to advertise an unapproved or unavailable iPhone update. The public transition retains the existing user-confirmed publication procedure; it does not hold a runner while Apple reviews.

References: [fastlane upload](https://docs.fastlane.tools/actions/upload_to_testflight/), [Apple external testing](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers/), [App Store Connect API](https://developer.apple.com/documentation/appstoreconnectapi).

For local public-release confirmation, explicitly provide `IOS_APP_STORE_API_KEY_ID`, `IOS_APP_STORE_API_ISSUER`, and either `IOS_APP_STORE_API_KEY_FILE` (an absolute private-key path) or `IOS_APP_STORE_API_KEY_BASE64` to the existing publication command. The checker does not discover credentials or reuse a notarization key implicitly.

Build numbering follows [Apple CFBundleVersion](https://developer.apple.com/documentation/BundleResources/Information-Property-List/CFBundleVersion) and the pinned fastlane [latest TestFlight build query](https://docs.fastlane.tools/actions/latest_testflight_build_number/). QA receipts remain Actions artifacts; only the formal Release flow assembles them into a GitHub Draft.
