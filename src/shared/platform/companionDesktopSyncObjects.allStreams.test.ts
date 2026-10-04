// @vitest-environment node
import path from 'node:path';

import { it } from 'vitest';

await import('../../../scripts/sync/identity-simulator/simulatorHostBoundary.mjs');
const { runIdentityMissingReview } = await import('../../../scripts/sync/identity-simulator/reviewFact.js');

it('ordinary companion identity sync repairs a missing review fact behind an equal node head and persists it after restart', async () => {
  await runIdentityMissingReview(path.resolve('.tmp/artifacts/companion-review-fact', String(Date.now())), true);
}, 600_000);
