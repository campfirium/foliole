import { render } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const readingActionsSheetMock = vi.hoisted(() => vi.fn<(props: Record<string, unknown>) => null>(() => null));

vi.mock('./CompanionDocumentSearchSheet', () => ({ CompanionDocumentSearchSheet: () => null }));
vi.mock('./CompanionReadingChrome', () => ({ ReadingChrome: () => null }));
vi.mock('./companionHighlightPanelModel', () => ({ buildCompanionHighlightPanelItems: () => [] }));
vi.mock('./CompanionReadingSheets', () => ({
  OutlineSheet: () => null,
  ReadingActionsSheet: (props: Record<string, unknown>) => readingActionsSheetMock(props),
  ReadingFontSheet: () => null,
  ReadingHighlightSheet: () => null,
  ReadingInfoSheet: () => null
}));

import { ImmersiveChromeLayer } from './CompanionReadableArticleChromeLayer';
import { DEFAULT_READING_TYPOGRAPHY_SETTINGS } from './companionReadingTypographySettings';

function renderChrome(onRestoreFromTrash?: (nodeId: string) => void) {
  render(
    <ImmersiveChromeLayer
      actionsOpen
      editor={null}
      isChromeVisible
      isContentEditing={false}
      onExit={vi.fn()}
      onFindInDocument={vi.fn()}
      onOpenActions={vi.fn()}
      onOpenOutline={vi.fn()}
      onOpenReadingSheet={vi.fn()}
      onOpenSearchSheet={vi.fn()}
      onReadingTypographySettingsChange={vi.fn()}
      onSelectOutlineItem={vi.fn()}
      onToggleContentEditing={vi.fn()}
      openReadingSheet={null}
      outlineOpen={false}
      readableArticle={{ isTrashed: true, nodeId: 'topic-1', title: 'Topic' } as never}
      readingTypographySettings={DEFAULT_READING_TYPOGRAPHY_SETTINGS}
      searchOpen={false}
      {...(onRestoreFromTrash ? { onRestoreFromTrash } : {})}
    />
  );
}

beforeEach(() => {
  readingActionsSheetMock.mockClear();
});

it('does not recreate a trash restore action when the host omitted the handler', () => {
  renderChrome();

  const props = readingActionsSheetMock.mock.calls[0]?.[0] as Record<string, unknown>;
  expect(props.onRestoreFromTrash).toBeUndefined();
});

it('keeps trash restore reachable when the host provides the handler', () => {
  const onRestoreFromTrash = vi.fn();
  renderChrome(onRestoreFromTrash);

  const props = readingActionsSheetMock.mock.calls[0]?.[0] as { onRestoreFromTrash(): void };
  props.onRestoreFromTrash();
  expect(onRestoreFromTrash).toHaveBeenCalledWith('topic-1');
});
