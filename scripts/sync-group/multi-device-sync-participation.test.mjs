import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import { assertAndroidResumeData } from './multi-device-sync-participation-evidence.mjs';

const fail = (message) => new Error(message);

function snapshot(facts, counts = { attachments: 1, content_blobs: 5, nodes: 8 }) {
  return { database: { counts, inspection: { journeyFacts: facts }, integrity: 'ok' } };
}

describe('Android resume evidence', () => {
  it('uses a database-only device snapshot for participation facts', () => {
    const source = fs.readFileSync('scripts/sync-group/multi-device-sync-participation.mjs', 'utf8');
    expect(source).toContain('includeAttachments: false');
  });

  it('leaves connected leaf A before hub B and the final Windows member', () => {
    const source = fs.readFileSync('scripts/sync-group/multi-device-sync-participation.mjs', 'utf8');
    expect(source.indexOf('await leaveMacos')).toBeLessThan(source.indexOf('await leaveAndroid'));
    expect(source.indexOf('await leaveAndroid')).toBeLessThan(source.indexOf('await windows.finish'));
  });

  it('accepts exact fact convergence without requiring an incidental count delta', () => {
    expect(() => assertAndroidResumeData(
      snapshot({ existing: 'B' }), snapshot({ existing: 'B', resumed: 'A' }), 'resumed', fail
    )).not.toThrow();
  });

  it('rejects a missing resumed fact or loss of preexisting data', () => {
    expect(() => assertAndroidResumeData(
      snapshot({ existing: 'B' }), snapshot({ existing: 'B' }), 'resumed', fail
    )).toThrow(/Android did not retain resumed data/u);
    expect(() => assertAndroidResumeData(
      snapshot({ existing: 'B' }), snapshot({ resumed: 'A' }), 'resumed', fail
    )).toThrow(/Android did not retain resumed data/u);
  });
});
