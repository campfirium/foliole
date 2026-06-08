import { CheckCircle2, MessageCircle, Search, Table, XCircle } from 'lucide-react';
import { useState, type MouseEvent, type PointerEvent } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { openExternalUrl } from '../../shared/platform/runtimeExternalNavigation';
import {
  getEnabledWebLookupEntries,
  resolveWebLookupAction,
  type WebLookupEntry
} from '../../shared/platform/webLookupEntries';
import { AppButton, AppSelectionDropdownMenu, AppSelectionDropdownMenuItem } from '../../shared/ui';
import type { SelectionCommandPayload } from '../contextCommands';

type WebLookupActionEntry = NonNullable<ReturnType<typeof resolveWebLookupAction>>;
type Translate = ReturnType<typeof useTranslation>;

interface WebLookupSelectionMenuProps {
  documentText?: string | null | undefined;
  left: number;
  onClose: () => void;
  onRepairTable?: () => void;
  repairTableAvailable?: boolean;
  selectionPayload?: SelectionCommandPayload | null | undefined;
  titleText?: string | null | undefined;
  top: number;
}

function SelectionMenuSeparator() {
  return <div aria-hidden="true" className="my-1 h-px bg-border/10" role="separator" />;
}

function WebLookupIcon(props: { kind: WebLookupActionEntry['kind'] }) {
  const Icon = props.kind === 'prompt' ? MessageCircle : Search;
  return <Icon aria-hidden="true" className="mr-2 shrink-0 text-foreground/62" size={15} strokeWidth={1.9} />;
}

async function copyWebLookupText(text: string) {
  if (!navigator.clipboard?.writeText) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function getCopiedNoticeMessage(action: WebLookupActionEntry, t: Translate) {
  return action.overflowSource === 'selection'
    ? t('desktop.webLookup.selectionCopied')
    : t('desktop.webLookup.documentCopied');
}

function resolveWebLookupEntries(props: WebLookupSelectionMenuProps, selectionText: string) {
  return getEnabledWebLookupEntries()
    .map((entry) => ({
      entry,
      action: resolveWebLookupAction(entry, {
        documentText: props.documentText,
        selectionText,
        titleText: props.titleText
      })
    }))
    .filter((resolved): resolved is { action: WebLookupActionEntry; entry: WebLookupEntry } => (
      resolved.action !== null
    ));
}

function WebLookupNotice(props: {
  message: string;
  tone: 'error' | 'success';
}) {
  return (
    <div
      aria-live="polite"
      className="mx-2 my-1 max-w-72 rounded border border-border/50 bg-bg-elevated px-2 py-1.5 text-xs leading-5 text-foreground/72"
      role="status"
    >
      <div className="flex items-start gap-2">
        {props.tone === 'success' ? (
          <CheckCircle2 aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-success" strokeWidth={1.8} />
        ) : (
          <XCircle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-error" strokeWidth={1.8} />
        )}
        <span>{props.message}</span>
      </div>
    </div>
  );
}

interface WebLookupConfirmationState {
  message: string;
  url: string;
}

function WebLookupConfirmationPanel(props: {
  message: string;
  onCancel: () => void;
  onContinue: () => void;
}) {
  const t = useTranslation();
  return (
    <div className="w-80 p-3">
      <div
        aria-live="polite"
        className="flex items-start gap-2 text-sm leading-6 text-foreground/78"
        role="status"
      >
        <CheckCircle2 aria-hidden="true" className="mt-1 size-4 shrink-0 text-success" strokeWidth={1.8} />
        <span>{props.message}</span>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <AppButton
          onClick={props.onCancel}
          onMouseDown={keepConfirmationButtonEventInMenu}
          onPointerDown={keepConfirmationButtonEventInMenu}
          size="sm"
          variant="ghost"
        >
          {t('desktop.webLookup.cancel')}
        </AppButton>
        <AppButton
          className="min-w-24"
          onClick={props.onContinue}
          onMouseDown={keepConfirmationButtonEventInMenu}
          onPointerDown={keepConfirmationButtonEventInMenu}
          size="sm"
          variant="default"
        >
          {t('desktop.webLookup.continue')}
        </AppButton>
      </div>
    </div>
  );
}

function keepConfirmationButtonEventInMenu(event: MouseEvent<HTMLButtonElement> | PointerEvent<HTMLButtonElement>) {
  event.preventDefault();
  event.stopPropagation();
}

function WebLookupActionItems(props: {
  entries: Array<{ action: WebLookupActionEntry; entry: WebLookupEntry }>;
  onSelect: (action: WebLookupActionEntry) => void;
}) {
  return props.entries.map(({ action, entry }) => (
    <AppSelectionDropdownMenuItem
      key={entry.id}
      onClick={() => {
        props.onSelect(action);
      }}
    >
      <WebLookupIcon kind={action.kind} />
      <span className="min-w-0 truncate">{action.label}</span>
    </AppSelectionDropdownMenuItem>
  ));
}

export function WebLookupSelectionMenu(props: WebLookupSelectionMenuProps) {
  const t = useTranslation();
  const [confirmation, setConfirmation] = useState<WebLookupConfirmationState | null>(null);
  const [notice, setNotice] = useState<{ message: string; tone: 'error' | 'success' } | null>(null);
  const selectionText = props.selectionPayload?.selectionText.trim() ?? '';
  const entries = resolveWebLookupEntries(props, selectionText);

  if (entries.length === 0 && !props.repairTableAvailable) {
    return null;
  }

  const handleWebLookupClick = async (action: WebLookupActionEntry) => {
    if (!action.copyText) {
      props.onClose();
      void openExternalUrl(action.url);
      return;
    }
    const copied = await copyWebLookupText(action.copyText);
    if (copied) {
      setConfirmation({ message: getCopiedNoticeMessage(action, t), url: action.url });
      return;
    }
    setNotice({ message: t('desktop.webLookup.copyFailed'), tone: 'error' });
  };

  const continueWebLookup = (url: string) => {
    void openExternalUrl(url);
    props.onClose();
  };

  return (
    <AppSelectionDropdownMenu left={props.left} onClose={props.onClose} outsidePointerMode="passthrough" top={props.top}>
      {confirmation ? (
        <WebLookupConfirmationPanel
          message={confirmation.message}
          onCancel={props.onClose}
          onContinue={() => continueWebLookup(confirmation.url)}
        />
      ) : null}
      {!confirmation && props.repairTableAvailable ? (
        <AppSelectionDropdownMenuItem
          onClick={() => {
            props.onRepairTable?.();
          }}
        >
          <Table aria-hidden="true" className="mr-2 shrink-0 text-foreground/62" size={15} strokeWidth={1.9} />
          <span className="min-w-0 truncate">{t('desktop.webLookup.repairTable')}</span>
        </AppSelectionDropdownMenuItem>
      ) : null}
      {!confirmation && props.repairTableAvailable && entries.length > 0 ? <SelectionMenuSeparator /> : null}
      {!confirmation ? <WebLookupActionItems entries={entries} onSelect={(action) => void handleWebLookupClick(action)} /> : null}
      {!confirmation && notice && entries.length > 0 ? <SelectionMenuSeparator /> : null}
      {!confirmation && notice ? <WebLookupNotice message={notice.message} tone={notice.tone} /> : null}
    </AppSelectionDropdownMenu>
  );
}
