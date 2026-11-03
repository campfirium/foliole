# iPhone TestFlight release

The existing Release workflow selects `ios` through the release intent, alongside other platforms or alone for an iPhone hotfix. Ordinary development pushes do not upload a build. The accepted release SHA, package version and workflow run identity must match before signing.

## Execution

1. Existing hosted release quality and release-candidate checks accept the source SHA.
2. `release-ios.yml` uses macOS to run `node scripts/ios/testflight-archive.mjs`, verify the host and share extension, and execute `bundle exec fastlane ios upload` from `scripts/ios`. Upload does not wait for Apple processing.
3. A separate Ubuntu job consumes the same-run candidate artifact. `bundle exec fastlane ios distribute` checks the exact app/version/build every five minutes, for at most one hour. It assigns the existing external group, enables automatic notification, submits external review and exits. It never waits for human review approval.
4. Apple approves and distributes the update through the existing group. The website invitation remains https://testflight.apple.com/join/PszuhyJA.

The Linux continuation can be rerun after a processing timeout without uploading another IPA. Rerunning the macOS upload creates a fresh build number from `GITHUB_RUN_NUMBER.GITHUB_RUN_ATTEMPT`; it must not reuse a previous IPA. Concurrent app operations are serialized. A new release run may cancel an older run through the existing parent release concurrency policy, so inspect Apple before retrying a cancelled upload.

## Credentials

The trusted workflow requires `IOS_APP_STORE_API_KEY_ID`, `IOS_APP_STORE_API_ISSUER`, and `IOS_APP_STORE_API_KEY_BASE64` for an App Store Connect key with suitable upload, external-testing and automatic-provisioning permissions. External testing requires App Manager or a higher role; the existing Developer-role notarization key is insufficient. Keep the dedicated iPhone credentials separate from macOS notarization credentials. Team API keys apply across all apps in the Apple team.

`IOS_DISTRIBUTION_CERTIFICATE_BASE64` contains a PKCS#12 export of the team's Apple Distribution certificate **and private key**. `IOS_DISTRIBUTION_CERTIFICATE_PASSWORD` protects that export. The existing macOS Developer ID certificate cannot replace it. The workflow imports the certificate into a temporary keychain, uses automatic provisioning for both registered bundle IDs and their shared App Group, and deletes temporary credentials on exit. Do not put credentials in source, artifacts or logs.

App Store Connect beta description, review contact and any required export-compliance declarations must already be valid. Automation never guesses encryption answers, changes France availability, or overrides rejected review. Missing compliance stops the job with a clear error; it is not evidence that submission succeeded.

## Verification

Run explicit local tests before hosted execution:

```sh
npm run test:files -- scripts/ios/testflight-contract.test.mjs scripts/ios/testflight-distribution.test.mjs scripts/ios/testflight-release-assets.test.mjs scripts/t7-release-selection.test.mjs scripts/release-assembly-identity.test.mjs
```

The distribution test executes the production Ruby state machine with simulated Apple responses and a virtual clock. It covers processing, timeout, unresolved compliance, wrong identity, review rejection and repeat submission. It does not prove Apple's live permissions or signing.

Ruby dependencies are pinned in `fastlane/Gemfile.lock`, including checksums. Use Ruby 4.0 and Bundler 4.0.23; run `bundle install --gemfile scripts/ios/fastlane/Gemfile`, then `bundle exec fastlane lanes` from `scripts/ios`. The generated lockfile is kept intact as one dependency-resolution artifact.

A real selected release must still prove signing, upload, Apple processing, external submission and the approved group update. No Simulator or device installation is performed by these scripts. Runtime preview and acceptance retain their existing host workflows.

## Release assets and publication

GitHub draft assembly stores a SHA-bound submission receipt, not an IPA download. A receipt may report pending review. Public GitHub publication performs a fresh Apple API check of that exact build and refuses to advertise an unapproved or unavailable iPhone update. The public transition retains the existing user-confirmed publication procedure; it does not hold a runner while Apple reviews.

References: [fastlane upload](https://docs.fastlane.tools/actions/upload_to_testflight/), [Apple external testing](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers/), [App Store Connect API](https://developer.apple.com/documentation/appstoreconnectapi).

For local public-release confirmation, explicitly provide `IOS_APP_STORE_API_KEY_ID`, `IOS_APP_STORE_API_ISSUER`, and either `IOS_APP_STORE_API_KEY_FILE` (an absolute private-key path) or `IOS_APP_STORE_API_KEY_BASE64` to the existing publication command. The checker does not discover credentials or reuse a notarization key implicitly.
