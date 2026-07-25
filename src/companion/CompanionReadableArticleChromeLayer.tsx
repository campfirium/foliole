import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';

import { CompanionDocumentSearchSheet } from './CompanionDocumentSearchSheet';
import { buildCompanionHighlightPanelItems } from './companionHighlightPanelModel';
import { CompanionNodeTextAlternativeSheet } from './CompanionNodeTextAlternativeSheet';
import { ReadingChrome } from './CompanionReadingChrome';
import {
  ReadingActionsSheet,
  OutlineSheet,
  ReadingFontSheet,
  ReadingHighlightSheet,
  ReadingInfoSheet
} from './CompanionReadingSheets';
import type { CompanionReadingTypographySettings } from './companionReadingTypographySettings';
import type { useCompanionArticleSurface } from './useCompanionArticleSurface';

import type { EditorAdapter } from '@/features/editor/adapters/EditorAdapter';
import { definedProps } from '@/shared/lib/definedProps';

type ReadableArticle = NonNullable<ReturnType<typeof useCompanionArticleSurface>['readableArticle']>;
type TextAlternativeState = {
  alternative: import('../shared/platform/companionNodeTextAlternativeRepository').CompanionNodeTextAlternative | null;
  busy: boolean;
  dismiss(): void;
  error: boolean;
  open: boolean;
  setAsBody(): void;
  setOpen(open: boolean): void;
};

interface ImmersiveChromeLayerProps {
  actionsOpen: boolean;
  canEditContent?: boolean;
  editor: EditorAdapter | null;
  isChromeVisible: boolean;
  isContentEditing: boolean;
  onExit(): void;
  onFindInDocument(): void;
  onOpenActions(open: boolean): void;
  onOpenOutline(open: boolean): void;
  onOpenReadingSheet(sheet: 'font' | 'highlight' | 'info' | null): void;
  onOpenSearchSheet(open: boolean): void;
  onReadingTypographySettingsChange(settings: CompanionReadingTypographySettings): void;
  onRestoreFromTrash?: (nodeId: string) => Promise<void> | void;
  onSelectOutlineItem(item: { from: number; to: number }): void;
  onToggleContentEditing(): void;
  openReadingSheet: 'font' | 'highlight' | 'info' | null;
  outlineOpen: boolean;
  readableArticle: ReadableArticle;
  readingTypographySettings: CompanionReadingTypographySettings;
  searchOpen: boolean;
  snapshot?: WorkspaceSnapshot | null;
  textAlternative?: TextAlternativeState;
}

function ReadingChromeControls(props: {
  canEditContent?: boolean;
  isChromeVisible: boolean;
  isContentEditing: boolean;
  onExit(): void;
  onOpenActions(open: boolean): void;
  onOpenAlternative?: () => void;
  onOpenOutline(open: boolean): void;
  onToggleContentEditing(): void;
  readableArticle: ReadableArticle;
}) {
  return (
    <ReadingChrome
      canEditContent={props.canEditContent === true}
      isContentEditing={props.isContentEditing}
      visible={props.isChromeVisible}
      onExit={props.onExit}
      onOpenActions={() => props.onOpenActions(true)}
      {...definedProps({ onOpenAlternative: props.onOpenAlternative })}
      onOpenOutline={() => props.onOpenOutline(true)}
      onToggleContentEditing={props.onToggleContentEditing}
      title={props.readableArticle.title}
    />
  );
}

function ReadingActionsLayer(props: {
  actionsOpen: boolean;
  onFindInDocument(): void;
  onOpenActions(open: boolean): void;
  onOpenReadingSheet(sheet: 'font' | 'highlight' | 'info' | null): void;
  onRestoreFromTrash?: (nodeId: string) => Promise<void> | void;
  readableArticle: ReadableArticle;
}) {
  const restoreFromTrash = props.onRestoreFromTrash;
  return (
    <ReadingActionsSheet
      onFindInDocument={props.onFindInDocument}
      onOpenChange={props.onOpenActions}
      onOpenReadingSheet={props.onOpenReadingSheet}
      open={props.actionsOpen}
      {...definedProps({
        onRestoreFromTrash: props.readableArticle.isTrashed && restoreFromTrash
          ? () => restoreFromTrash(props.readableArticle.nodeId)
          : undefined
      })}
    />
  );
}

function ReadingSheetsLayer(props: {
  editor: EditorAdapter | null;
  onOpenReadingSheet(sheet: 'font' | 'highlight' | 'info' | null): void;
  onOpenSearchSheet(open: boolean): void;
  onOpenOutline(open: boolean): void;
  onReadingTypographySettingsChange(settings: CompanionReadingTypographySettings): void;
  onSelectOutlineItem(item: { from: number; to: number }): void;
  openReadingSheet: 'font' | 'highlight' | 'info' | null;
  readingTypographySettings: CompanionReadingTypographySettings;
  searchOpen: boolean;
  outlineOpen: boolean;
  readableArticle: ReadableArticle;
  textAlternative?: TextAlternativeState;
}) {
  const highlights = buildCompanionHighlightPanelItems({
    content: props.readableArticle.content,
    textAnchorDecorations: props.readableArticle.textAnchorDecorations
  });
  const selectHighlight = (item: { from: number; to: number }) => {
    props.onSelectOutlineItem(item);
    props.onOpenReadingSheet(null);
  };
  return (
    <>
      <OutlineSheet
        content={props.readableArticle.content}
        onOpenChange={props.onOpenOutline}
        onSelect={props.onSelectOutlineItem}
        open={props.outlineOpen}
      />
      <ReadingFontSheet
        onChange={props.onReadingTypographySettingsChange}
        onOpenChange={(open) => props.onOpenReadingSheet(open ? 'font' : null)}
        open={props.openReadingSheet === 'font'}
        settings={props.readingTypographySettings}
      />
      <ReadingHighlightSheet
        highlights={highlights}
        onOpenChange={(open) => props.onOpenReadingSheet(open ? 'highlight' : null)}
        onSelect={selectHighlight}
        open={props.openReadingSheet === 'highlight'}
      />
      <ReadingInfoSheet
        hasPdf={Boolean(props.readableArticle.pdfAttachmentId)}
        onOpenChange={(open) => props.onOpenReadingSheet(open ? 'info' : null)}
        open={props.openReadingSheet === 'info'}
        title={props.readableArticle.title}
      />
      <CompanionDocumentSearchSheet
        content={props.readableArticle.content}
        editor={props.editor}
        onOpenChange={props.onOpenSearchSheet}
        open={props.searchOpen}
      />
      <TextAlternativeLayer currentBody={props.readableArticle.content} state={props.textAlternative} />
    </>
  );
}

function TextAlternativeLayer(props: { currentBody: string; state: TextAlternativeState | undefined }) {
  if (!props.state) return null;
  return (
    <CompanionNodeTextAlternativeSheet
      alternative={props.state.alternative}
      busy={props.state.busy}
      currentBody={props.currentBody}
      error={props.state.error}
      onDismiss={props.state.dismiss}
      onOpenChange={props.state.setOpen}
      onSetAsBody={props.state.setAsBody}
      open={props.state.open}
    />
  );
}

export function ImmersiveChromeLayer(props: ImmersiveChromeLayerProps) {
  return (
    <>
      <ReadingChromeControls
        {...definedProps({ canEditContent: props.canEditContent })}
        isChromeVisible={props.isChromeVisible}
        isContentEditing={props.isContentEditing}
        onExit={props.onExit}
        onOpenActions={props.onOpenActions}
        {...definedProps({
          onOpenAlternative: props.textAlternative?.alternative
            ? () => props.textAlternative?.setOpen(true)
            : undefined
        })}
        onOpenOutline={props.onOpenOutline}
        onToggleContentEditing={props.onToggleContentEditing}
        readableArticle={props.readableArticle}
      />
      <ReadingActionsLayer
        actionsOpen={props.actionsOpen}
        onFindInDocument={props.onFindInDocument}
        onOpenActions={props.onOpenActions}
        onOpenReadingSheet={props.onOpenReadingSheet}
        readableArticle={props.readableArticle}
        {...definedProps({ onRestoreFromTrash: props.onRestoreFromTrash })}
      />
      <ReadingSheetsLayer
        editor={props.editor}
        onOpenOutline={props.onOpenOutline}
        onOpenReadingSheet={props.onOpenReadingSheet}
        onOpenSearchSheet={props.onOpenSearchSheet}
        onReadingTypographySettingsChange={props.onReadingTypographySettingsChange}
        onSelectOutlineItem={props.onSelectOutlineItem}
        openReadingSheet={props.openReadingSheet}
        readingTypographySettings={props.readingTypographySettings}
        searchOpen={props.searchOpen}
        outlineOpen={props.outlineOpen}
        readableArticle={props.readableArticle}
        {...definedProps({ textAlternative: props.textAlternative })}
      />
    </>
  );
}
