// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { assertLocalizedReleaseNotesScope, validateReleaseNotesRecord } from './release-notes-contract.mjs';

const identity = { intent: { selectedPlatforms: ['windows'] } };

describe('published release notes scope', () => {
  it('allows shared notes and platform-limited notes inside the frozen Release scope', () => {
    expect(validateReleaseNotesRecord({
      notes: ['New', 'A shared change.'], platformNotes: { windows: ['Fixed', 'A Windows fix.'] }
    }, identity)).toMatchObject({ platformNotes: { windows: ['Fixed', 'A Windows fix.'] } });
  });

  it('rejects notes for an unpublished platform and locale scope drift', () => {
    expect(() => validateReleaseNotesRecord({ notes: [], platformNotes: { macos: ['A fix.'] } }, identity))
      .toThrow('outside the published platform scope');
    expect(() => assertLocalizedReleaseNotesScope({
      en: { '0.8.1': { notes: ['Shared'], platformNotes: { windows: ['Windows'] } } },
      'zh-Hans': { '0.8.1': { notes: ['通用'] } }
    }, identity, '0.8.1')).toThrow('same platform-limited scopes');
  });
});
