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

## Resume a distribution-only repair

When complete QA passed and only signing, packaging or distribution tooling changed, keep the original full receipt and use the registered QA checkout:

```sh
npm run quality:remote -- --scope full --mobile-distribution ios --reuse-mobile-quality <original-full-run-id>
```

This selects `mobile_resume`, not another full test execution. The evidence job reads the original complete quality artifact and actual admission jobs, requires the same trusted repository and QA source, and checks exact tracked product/quality inputs against the new candidate. Only the explicitly bounded distribution files may differ. Cancelled, expired, incomplete or failed quality and product/dependency/original-stage changes refuse reuse. A full run whose only failure was mobile distribution can supply the passed quality evidence. Changed distribution contracts run locally and on the hosted evidence job before signing.

The new proof and final TestFlight receipt retain both the original quality source/run/attempt and actual packaged source/run; old stage results are never rewritten as tests of the new commit. Registered QA integration and finish verify this evidence plus the successful distribution run. Existing ordinary full/release paths keep their current contract.

If upload already succeeded and only Linux processing/review failed, rerun that failed Linux job in the same run and recover the same QA entry. Reuse its uploaded candidate and earlier proof artifact; do not rerun the successful signing/upload job. Inspect Apple first whenever upload outcome is unknown.

## Execution

1. Formal release quality and release-candidate checks, or the explicit complete QA chain, accept the source SHA in this run.
2. Archive signing stays automatic for the app, extension and Swift package targets; the App Store Connect export re-signs the output for distribution, and IPA verification requires distribution entitlements and profiles. Do not force a distribution identity across archive targets. `release-ios.yml` uses macOS to run `node scripts/ios/testflight-archive.mjs`, verify the host and share extension, and execute `bundle exec fastlane ios upload` from `scripts/ios`. Upload does not wait for Apple processing.
3. A separate Ubuntu job consumes the same-run candidate artifact. `bundle exec fastlane ios distribute` checks the exact app/version/build every five minutes, for at most one hour. It assigns the existing external group, enables automatic notification, and submits external review. Submission and retries preserve existing builds, including builds under previous app versions. The submission receipt reports `expiredBuildIds: []`; it does not claim approval, availability, or completed cleanup. This job exits without waiting for human review. Automatic post-approval cleanup is not connected yet; keep existing builds available until a continuation verifies the exact replacement is available to its external group.
4. Apple approves and distributes the update through the existing group. The website invitation remains https://testflight.apple.com/join/PszuhyJA.

The Linux continuation can be rerun after a processing timeout without uploading another IPA. Before every fresh macOS archive, `bundle exec fastlane ios prepare_build` reads the latest uploaded iOS build from Apple (including processing/failed uploads) and allocates the next major build component with `.1`. Both QA and release hold the same signing/upload lock through upload, so independent workflow run counters cannot collide. Unknown formats or exhausted number ranges stop upload. Rerunning macOS queries Apple again and builds a fresh IPA; it must not reuse a previous IPA. If upload outcome is unknown, inspect Apple before rerunning: a query cannot prove an interrupted upload was absent. Concurrent app operations are serialized. A new release run may cancel an older run through the existing parent release concurrency policy, so inspect Apple before retrying a cancelled upload.

## Credentials

The trusted workflow requires `IOS_APP_STORE_API_KEY_ID`, `IOS_APP_STORE_API_ISSUER`, and `IOS_APP_STORE_API_KEY_BASE64` for an App Store Connect key with suitable upload, external-testing and automatic-provisioning permissions. External testing requires App Manager or a higher role; the existing Developer-role notarization key is insufficient. Keep the dedicated iPhone credentials separate from macOS notarization credentials. Team API keys apply across all apps in the Apple team.

`IOS_DISTRIBUTION_CERTIFICATE_BASE64` contains a PKCS#12 export of the team's Apple Distribution certificate **and private key**. `IOS_DISTRIBUTION_CERTIFICATE_PASSWORD` protects that export. The existing macOS Developer ID certificate cannot replace it. The workflow imports the certificate into a temporary keychain, uses automatic provisioning for both registered bundle IDs and their shared App Group, and deletes temporary credentials on exit. Do not put credentials in source, artifacts or logs.

App Store Connect beta description, review contact and any required export-compliance declarations must already be valid. The app and extension declare `ITSAppUsesNonExemptEncryption = false`, matching the established Apple documentation exemption for the current standard-algorithm implementation and the user's decision not to distribute on the French App Store. This does not mean the app contains no cryptography, and the key does not configure store territories. Reassess this declaration before changing the cryptography or enabling France. See [Apple's documentation table](https://developer.apple.com/help/app-store-connect/reference/app-information/export-compliance-documentation-for-encryption) and [persistent declaration instructions](https://developer.apple.com/help/app-store-connect/manage-app-information/determine-and-upload-app-encryption-documentation).

The plist declaration prevents repeated manual questionnaires on subsequent uploads. An already uploaded build with missing metadata can be corrected through Apple's Modify a build API after verifying its exact identity and the established answer, then resumed through the same Linux review job. Automation never guesses encryption answers, changes France availability, or overrides rejected review. Other missing compliance stops the job; it is not evidence that submission succeeded.

## Verification

The hosted archive uses the imported Apple Distribution private key, with App Store profiles fetched by the pinned `prepare_signing` Fastlane lane for the app and Share Extension. A generated xcconfig assigns profiles only to those targets and disables standalone signing for package targets; export uses the same manual distribution profiles. The lane may create a missing App Store profile for the existing installed certificate; it never creates or revokes certificates. No Development private key is needed. Both archived bundles and the final App Store IPA still undergo signature verification.

The macOS producer explicitly selects the runner's installed Xcode 26.3 and checks that the iPhone SDK major is at least 26 before installing dependencies or credentials. The macOS 15 image defaults to Xcode 16.4, which does not meet Apple's upload requirement. Downloaded profiles stay under the current distribution artifact directory.

Credential installation uses the pinned Fastlane keychain importer, including trusted signing applications and its `codesign:` partition. Before any archive, the installed Distribution private key must sign a temporary executable within 30 seconds and pass signature verification. This uses only the isolated runner keychain; it never requests an iPhone password or revokes a certificate. The local Ruby contract exercises the production installer with fake Security/codesign commands; the hosted probe verifies real private-key access.

Provisioning profiles contain native plist dates and certificate data, which cannot be converted wholesale to JSON by `plutil`. After the existing CMS decode, the verifier uses the Mac toolchain's `/usr/bin/python3` standard `plistlib` parser to expose only the profile flags and entitlement fields it checks. The Ruby fixture runs the production IPA verifier with real plist parsing and rejects development, Ad Hoc and enterprise profiles.

Run explicit local tests before hosted execution:

```sh
npm run test:files -- scripts/ios/testflight-contract.test.mjs scripts/ios/testflight-build-number.test.mjs scripts/ios/testflight-distribution.test.mjs scripts/ios/testflight-release-assets.test.mjs scripts/t7-release-selection.test.mjs scripts/release-assembly-identity.test.mjs
```

The distribution test executes the production Ruby state machine with simulated Apple responses and a virtual clock. It covers processing, timeout, unresolved compliance, wrong identity, review rejection, repeat submission, immediate expiration while review is pending, numeric version/build ordering, platform isolation, partial expiration retries and confirmation failures. It does not prove Apple's live permissions or signing.

Ruby dependencies are pinned in `fastlane/Gemfile.lock`, including checksums. Use Ruby 4.0 and Bundler 4.0.23; run `bundle install --gemfile scripts/ios/fastlane/Gemfile`, then `bundle exec fastlane lanes` from `scripts/ios`. The generated lockfile is kept intact as one dependency-resolution artifact.

With `BUNDLE_GEMFILE` set to that pinned Gemfile, run `bundle exec ruby scripts/ios/testflight-signing-test.rb` from the repository root to validate the production lane through Fastlane's real option parser without Apple access. The hosted producer runs this before importing credentials.

A real selected release or QA distribution must still prove signing, upload, Apple processing, external submission and the approved group update. No Simulator or device installation is performed by these scripts. Runtime preview and acceptance retain their existing host workflows.

## Release assets and publication

GitHub draft assembly stores a SHA-bound submission receipt, not an IPA download. A receipt may report pending review. Public GitHub publication performs a fresh Apple API check of that exact build and refuses to advertise an unapproved or unavailable iPhone update. The public transition retains the existing user-confirmed publication procedure; it does not hold a runner while Apple reviews.

References: [fastlane upload](https://docs.fastlane.tools/actions/upload_to_testflight/), [Apple external testing](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers/), [App Store Connect API](https://developer.apple.com/documentation/appstoreconnectapi).

For local public-release confirmation, explicitly provide `IOS_APP_STORE_API_KEY_ID`, `IOS_APP_STORE_API_ISSUER`, and either `IOS_APP_STORE_API_KEY_FILE` (an absolute private-key path) or `IOS_APP_STORE_API_KEY_BASE64` to the existing publication command. The checker does not discover credentials or reuse a notarization key implicitly.

Build numbering follows [Apple CFBundleVersion](https://developer.apple.com/documentation/BundleResources/Information-Property-List/CFBundleVersion) and the pinned fastlane [latest TestFlight build query](https://docs.fastlane.tools/actions/latest_testflight_build_number/). QA receipts remain Actions artifacts; only the formal Release flow assembles them into a GitHub Draft.
