import type { ReactNode } from 'react';

import { extractDocumentOutline } from '@/features/editor/model/documentOutline';
import {
  AppDialog,
  AppDialogClose,
  AppDialogContent,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle
} from '@/shared/ui';

function ReadingBottomSheet(props: {
  children: ReactNode;
  onOpenChange(open: boolean): void;
  open: boolean;
  title: string;
}) {
  return (
    <AppDialog onOpenChange={props.onOpenChange} open={props.open}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent className="bottom-0 left-0 top-auto w-full translate-x-0 translate-y-0 rounded-b-none rounded-t-xl border-x-0 border-b-0 px-6 pb-6 pt-5">
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
          <p className="py-5 text-sm text-companion-text-secondary">No headings in this topic</p>
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
      <div className="border-t border-companion-divider py-5 text-sm text-companion-text-secondary">
        Reading font controls are not available on Android yet.
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
      <div className="border-t border-companion-divider py-5 text-sm text-companion-text-secondary">
        Highlight tools are not available on Android yet.
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
