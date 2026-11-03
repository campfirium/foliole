# TestFlight event receiver

The iPhone release flow uses App Store Connect webhooks rather than a runner
waiting for Apple to process or review a build. The existing TestFlight invitation
remains stable across releases. An upload, a review submission, and an approved
external build are separate outcomes.

## Receiver boundary

`scripts/ios/testflight-webhook.mjs` runs as a Cloudflare Worker. It verifies
`x-apple-signature` as HMAC-SHA256 over the original request bytes, using a secret
unique to the webhook registered for the iPhone app. It accepts only POST requests
to `/webhook`, caps bodies at 64 KiB, and never logs payloads or credentials.

The two actionable notification types are `buildUploadStateUpdated` and
`buildBetaDetailExternalBuildStateUpdated`. Signed unrelated events are ignored.
The receiver forwards only the event ID and typed resource ID to the fixed GitHub
workflow/ref in its configuration. A payload cannot supply a Git ref, command,
workflow name, executable code, or callback URL. A valid signature authenticates
the signal; it does not authorize publishing an arbitrary build.

GitHub must accept the dispatch before the receiver acknowledges delivery. An
upstream failure returns 502 so that delivery can be retried. There is no hidden
queue, periodic timer, or fallback polling. `/health` means only that the receiver
is alive; it does not certify dispatch, signing, upload, or review readiness.

## Required consumer contract

Before production activation, `ios-testflight-event.yml` must exist on the
repository default branch and implement these checks:

1. Re-read the typed resource using Apple's API; never trust an event's reported
   state or infer the app from an unauthenticated field.
2. Resolve its build and confirm the configured app, product version, and build
   number. Require a trusted upload receipt from the release pipeline binding it
   to the exact source commit and successful quality run.
3. Submit only the matching registered candidate. Manual uploads, old builds, and
   unrelated apps must not be automatically submitted.
4. Make duplicate/redelivered and out-of-order events safe by re-reading live
   state, serializing work for the same build, and recognizing an existing review
   submission. A duplicate signal must not create another release or resend an
   update notification.
5. Preserve the existing approved build on processing/review failure. Missing
   encryption declarations must stop the continuation rather than fabricate an
   exemption. Approval is not proof of a completed installation on a user's phone.

## Configuration and activation

The candidate configuration is
`scripts/ios/testflight-webhook.wrangler.jsonc`. Its repository, workflow, and ref
are deployment settings, not request inputs. No production endpoint or configured
Apple webhook is implied by committing this file.

Required Cloudflare secrets:

- `APPLE_WEBHOOK_SECRET`: a random value of at least 32 characters, also entered
  in the App Store Connect webhook configuration for this app.
- `GITHUB_DISPATCH_TOKEN`: a dedicated fine-grained credential restricted to this
  repository with Actions write permission. Do not copy a general-purpose local
  GitHub login token or a website deployment token into the receiver.

The receiver holds no App Store Connect private key or distribution certificate.
Those remain in the trusted release workflow. Provisioning new external-service
access requires explicit confirmation before granting it. Configure secrets using
the provider's secret input, never source control, logs, or command-line arguments.

After the consumer and signing/upload producer are ready, deploy with the existing
authorized Wrangler installation, register the callback for the iPhone app, and
use App Store Connect's Test action. Verify a successful Apple delivery and the
matching GitHub continuation. A synthetic local signature test is not evidence of
a live Apple delivery. Failed deliveries can be inspected and resent in App Store
Connect; do not delete working webhook configurations during diagnostics.

## Local verification

```sh
npm run test:files -- scripts/ios/testflight-webhook.test.mjs
npm run lint:files -- scripts/ios/testflight-webhook.mjs scripts/ios/testflight-webhook.test.mjs
```

The tests execute the real Worker request handling and Web Crypto verification;
GitHub's network boundary is a test double. They do not prove a live deployment,
the successor workflow, signing, or Apple review submission.

## Primary references

- [Apple signature and payload configuration](https://developer.apple.com/documentation/appstoreconnectapi/configuring-webhook-notifications)
- [Apple webhook event types](https://developer.apple.com/documentation/appstoreconnectapi/webhook-events)
- [Apple webhook registration, testing, and redelivery](https://developer.apple.com/help/app-store-connect/manage-your-team/manage-webhooks)
- [GitHub workflow dispatch and credential permissions](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event)
