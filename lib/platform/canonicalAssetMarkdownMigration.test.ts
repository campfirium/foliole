import { expect, it } from 'vitest';

import { rewriteCanonicalAssetMarkdownTargets } from './canonicalAssetMarkdownMigration.js';

const HASH = 'a'.repeat(64);

it('rewrites only parsed internal image targets and is idempotent', () => {
  const mapping = new Map([[HASH, `${HASH}.png`]]);
  const input = `![real](asset://${HASH})\n\n\`![code](asset://${HASH})\`\n\nhttps://x/asset://${HASH}`;
  const once = rewriteCanonicalAssetMarkdownTargets(input, mapping);
  expect(once).toBe(`![real](asset://${HASH}.png)\n\n\`![code](asset://${HASH})\`\n\nhttps://x/asset://${HASH}`);
  expect(rewriteCanonicalAssetMarkdownTargets(once, mapping)).toBe(once);
});
