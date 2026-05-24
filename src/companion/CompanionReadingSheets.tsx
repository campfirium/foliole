import { RotateCcw, Search } from 'lucide-react';
import type { ReactNode } from 'react';

import { extractDocumentOutline } from '@/features/editor/model/documentOutline';
import {
  AppDialog,
  AppDialogClose,
  AppDialogContent,
  AppEmptyState,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle
} from '@/shared/ui';

export function ReadingBottomSheet(props: {
  children: ReactNode;
  onOpenChange(open: boolean): void;
  open: boolean;
  title: string;
}) {
  return (
    <AppDialog onOpenChange={props.onOpenChange} open={props.open}>
      <AppDialogPortal>
        <AppDialogOverlay className="companion-sheet-overlay" />
        <AppDialogContent className="companion-sheet bottom-0 left-0 top-auto w-full translate-x-0 translate-y-0 rounded-b-none rounded-t-xl border-x-0 border-b-0 px-6 pt-3 pb-[max(env(safe-area-inset-bottom),24px)]">
          <div aria-hidden="true" className="mx-auto mb-3 h-1 w-9 rounded-full bg-companion-divider-strong" />
          <div className="mx-auto w-full max-w-[760px]">
            <div className="mb-3 flex items-center justify-between">
              <AppDialogTitle>{props.title}</AppDialogTitle>
              <AppDialogClose className="rounded-md px-2 py-1 text-sm font-medium text-companion-text-secondary transition hover:bg-companion-subtle">
                Cancel
              </AppDialogClose>
            </div>
            {props.children}
          </div>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}

function ReadingActionRow(props: {
  icon: ReactNode;
  label: string;
  onClick(): void;
}) {
  return (
    <button
      className="flex w-full items-center gap-3 border-b border-companion-divider py-4 text-left text-sm font-medium text-foreground transition-colors active:bg-companion-subtle/80"
      onClick={props.onClick}
      type="button"
    >
      <span className="text-companion-text-secondary">{props.icon}</span>
      <span>{props.label}</span>
    </button>
  );
}

export function ReadingActionsSheet(props: {
  onFindInDocument(): void;
  onOpenChange(open: boolean): void;
  onRestoreFromTrash?: () => void;
  open: boolean;
}) {
  return (
    <ReadingBottomSheet onOpenChange={props.onOpenChange} open={props.open} title="Actions">
      <div className="border-t border-companion-divider">
        <ReadingActionRow
          icon={<Search aria-hidden="true" className="h-5 w-5" />}
          label="Find in document"
          onClick={props.onFindInDocument}
        />
        {props.onRestoreFromTrash ? (
          <ReadingActionRow
            icon={<RotateCcw aria-hidden="true" className="h-5 w-5" />}
            label="Restore from Trash"
            onClick={props.onRestoreFromTrash}
          />
        ) : null}
      </div>
    </ReadingBottomSheet>
  );
}

export function OutlineSheet(props: {
  content: string;
  onOpenChange(open: boolean): void;
  onSelect(item: { from: number; to: number }): void;
  open: boolean;
}) {
  const outlineItems = extractDocumentOutline(props.content);
  return (
    <ReadingBottomSheet onOpenChange={props.onOpenChange} open={props.open} title="Outline">
      <div className="border-t border-companion-divider">
        {outlineItems.length > 0 ? outlineItems.map((item) => (
          <button
            className="block w-full border-b border-companion-divider py-3 text-left text-sm text-foreground"
            key={`${item.from}-${item.text}`}
            onClick={() => props.onSelect(item)}
            style={{ paddingLeft: `${Math.max(0, item.level - 1) * 14}px` }}
            type="button"
          >
            {item.text}
          </button>
        )) : (
          <AppEmptyState
            className="min-h-0 items-start py-5 text-left text-companion-text-secondary"
            description="Headings will appear here when this topic contains an outline."
            title="No headings in this topic"
          />
        )}
      </div>
    </ReadingBottomSheet>
  );
}

export function ReadingFontSheet(props: {
  onOpenChange(open: boolean): void;
  open: boolean;
}) {
  return (
    <ReadingBottomSheet onOpenChange={props.onOpenChange} open={props.open} title="Font">
      <div className="border-t border-companion-divider py-5">
        <AppEmptyState
          className="min-h-0 items-start text-left text-companion-text-secondary"
          description="Reading font controls are not available on Android yet."
          title="Font controls are coming soon"
        />
      </div>
    </ReadingBottomSheet>
  );
}

export function ReadingHighlightSheet(props: {
  onOpenChange(open: boolean): void;
  open: boolean;
}) {
  return (
    <ReadingBottomSheet onOpenChange={props.onOpenChange} open={props.open} title="Highlight">
      <div className="border-t border-companion-divider py-5">
        <AppEmptyState
          className="min-h-0 items-start text-left text-companion-text-secondary"
          description="Highlight tools are not available on Android yet."
          title="Highlight tools are coming soon"
        />
      </div>
    </ReadingBottomSheet>
  );
}

export function ReadingInfoSheet(props: {
  hasPdf: boolean;
  onOpenChange(open: boolean): void;
  open: boolean;
  title: string;
}) {
  return (
    <ReadingBottomSheet onOpenChange={props.onOpenChange} open={props.open} title="Info">
      <dl className="border-t border-companion-divider text-sm">
        <div className="flex items-center justify-between border-b border-companion-divider py-3">
          <dt className="text-companion-text-secondary">Topic</dt>
          <dd className="min-w-0 max-w-[70%] truncate text-right text-foreground">{props.title}</dd>
        </div>
        <div className="flex items-center justify-between border-b border-companion-divider py-3">
          <dt className="text-companion-text-secondary">Source</dt>
          <dd className="text-foreground">{props.hasPdf ? 'PDF and text' : 'Text'}</dd>
        </div>
      </dl>
    </ReadingBottomSheet>
  );
}
