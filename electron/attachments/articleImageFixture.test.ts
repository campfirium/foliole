import { describe, expect, it } from 'vitest';

import { classifyAttachmentBytes } from '../../lib/platform/attachmentByteClassification';
import { createArticleImageFixture, IMAGE_CASES } from '../../tests/fixtures/s203/articleImageFixture';

describe('isolated S203 device fixture data', () => {
  it.each(IMAGE_CASES)('describes independent %s preconditions without device writes', (scenario) => {
    const fixture = createArticleImageFixture('https://fixture.example/', scenario);
    expect(classifyAttachmentBytes(fixture.response.bytes)).toBe('image/png');
    expect(fixture.originalKey).toMatch(/^[a-f0-9]{64}\.png$/);
    expect(fixture.initialFiles.length).toBe(scenario === 'existing' ? 1 : 0);
    expect(fixture.response.status).toBe(scenario === 'failed' ? 404 : 200);
    expect(fixture.nodes[0]?.imageSources).toEqual(['local', 'localized'].includes(scenario) ? {} : { [fixture.originalKey]: fixture.sourceUrl });
    expect(fixture.expectedKey === fixture.originalKey).toBe(scenario !== 'changed');
    if (scenario === 'changed') expect(fixture.nodes[1]?.content).toContain(fixture.originalKey);
  });
  it('requires an explicit secure fixture origin', () => {
    expect(() => createArticleImageFixture('http://fixture.example/', 'same')).toThrow('HTTPS');
  });
});
