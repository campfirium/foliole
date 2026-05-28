import { describe, expect, it } from 'vitest';

import { resolveOutlineActivePosition, resolveShowDocumentOutline } from './workspaceGridContentModel';

describe('resolveOutlineActivePosition', () => {
  it('falls back to zero when persisted editor selection is null', () => {
    expect(resolveOutlineActivePosition({
      editorSelection: null,
      readingSelection: null
    })).toBe(0);
  });

  it('prefers live reading selection before persisted editor selection', () => {
    expect(resolveOutlineActivePosition({
      editorSelection: { from: 12 },
      readingSelection: { from: 24 }
    })).toBe(24);
  });
});

describe('resolveShowDocumentOutline', () => {
  it('keeps the document outline visible in immersive mode even when the outline panel was active', () => {
    expect(resolveShowDocumentOutline({
      activeRightPanelId: 'outline',
      isImmersiveMode: true,
      isRightSidebarCollapsed: false
    })).toBe(true);
  });

  it('hides the document outline in the normal workspace when the outline panel is already visible', () => {
    expect(resolveShowDocumentOutline({
      activeRightPanelId: 'outline',
      isImmersiveMode: false,
      isRightSidebarCollapsed: false
    })).toBe(false);
  });
});
