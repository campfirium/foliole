import { describe, expect, it } from 'vitest';

import {
  DEMO_SETTINGS_PREVIEW_SECTIONS,
  resolveDemoSettingsPreviewNoteKind
} from './demoSettingsPreviewCatalog';

describe('demo settings preview catalog', () => {
  it('classifies every visible preview row or explicitly skips status rows', () => {
    const unclassifiedRows = DEMO_SETTINGS_PREVIEW_SECTIONS.flatMap((section) =>
      section.items
        .filter((item) => resolveDemoSettingsPreviewNoteKind(section, item) === null && item.controlKind !== 'status')
        .map((item) => `${section.id}/${item.id}`)
    );

    expect(unclassifiedRows).toEqual([]);
  });

  it('does not add duplicate notes to status rows that already show the desktop-only label', () => {
    const statusRowsWithNotes = DEMO_SETTINGS_PREVIEW_SECTIONS.flatMap((section) =>
      section.items
        .filter((item) => item.controlKind === 'status' && resolveDemoSettingsPreviewNoteKind(section, item) !== null)
        .map((item) => `${section.id}/${item.id}`)
    );

    expect(statusRowsWithNotes).toEqual([]);
  });

  it('marks external source folders as a session-only Web demo capability', () => {
    const section = DEMO_SETTINGS_PREVIEW_SECTIONS.find((candidate) => candidate.id === 'sources');

    expect(section?.demoNoteKind).toBe('external-folders');
  });
});
