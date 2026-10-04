// @vitest-environment node
import path from 'node:path';

import { it } from 'vitest';

// Adapt only native hosting; exercise the current companion identity orchestration
// against independent persistent SQLite libraries and authenticated production HTTP.
await import('../../../scripts/sync/identity-simulator/simulatorHostBoundary.mjs');
const { runCompanionIdentityLostReply } = await import(
  '../../../scripts/sync/identity-simulator/companionIdentityScenarios.js');
const output = path.resolve('.tmp/artifacts/sync-identity-simulator', `companion-retry-${Date.now()}`);

it.each([false, true])('keeps a committed mobile push from resurfacing after a later desktop edit, reopen, and retry (replyLost=%s)', async replyLost => {
  await runCompanionIdentityLostReply(path.join(output, String(replyLost)), replyLost);
}, 600_000);
