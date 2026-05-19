import { MessageCircle, Search, Table } from 'lucide-react';

import { openExternalUrl } from '../../shared/platform/runtimeExternalNavigation';
import {
  getEnabledWebLookupEntries,
  resolveWebLookupAction,
  type WebLookupEntry
} from '../../shared/platform/webLookupEntries';
import { AppSelectionDropdownMenu, AppSelectionDropdownMenuItem } from '../../shared/ui';
import type { SelectionCommandPayload } from '../contextCommands';

type WebLookupActionEntry = NonNullable<ReturnType<typeof resolveWebLookupAction>>;

interface WebLookupSelectionMenuProps {
  documentText?: string | null | undefined;
  left: number;
  onClose: () => void;
  onRepairTable?: () => void;
  repairTableAvailable?: boolean;
  selectionPayload?: SelectionCommandPayload | null | undefined;
  top: number;
}

function SelectionMenuSeparator() {
  return <div aria-hidden="true" className="my-1 h-px bg-border/10" role="separator" />;
}

function WebLookupIcon(props: { kind: WebLookupActionEntry['kind'] }) {
  const Icon = props.kind === 'prompt' ? MessageCircle : Search;
  return <Icon aria-hidden="true" className="mr-2 shrink-0 text-foreground/62" size={15} strokeWidth={1.9} />;
}

export function WebLookupSelectionMenu(props: WebLookupSelectionMenuProps) {
  const selectionText = props.selectionPayload?.selectionText.trim() ?? '';

  const entries = getEnabledWebLookupEntries()
    .map((entry) => ({
      entry,
      action: resolveWebLookupAction(entry, {
        documentText: props.documentText,
        selectionText
      })
    }))
    .filter((resolved): resolved is { action: WebLookupActionEntry; entry: WebLookupEntry } => (
      resolved.action !== null
    ));

  if (entries.length === 0 && !props.repairTableAvailable) {
    return null;
  }

  return (
    <AppSelectionDropdownMenu left={props.left} onClose={props.onClose} outsidePointerMode="passthrough" top={props.top}>
      {props.repairTableAvailable ? (
        <AppSelectionDropdownMenuItem
          onClick={() => {
            props.onRepairTable?.();
          }}
        >
          <Table aria-hidden="true" className="mr-2 shrink-0 text-foreground/62" size={15} strokeWidth={1.9} />
          <span className="min-w-0 truncate">Repair Table</span>
        </AppSelectionDropdownMenuItem>
      ) : null}
      {props.repairTableAvailable && entries.length > 0 ? <SelectionMenuSeparator /> : null}
      {entries.map(({ action, entry }) => (
        <AppSelectionDropdownMenuItem
          key={entry.id}
          onClick={() => {
            props.onClose();
            void openExternalUrl(action.url);
          }}
        >
          <WebLookupIcon kind={action.kind} />
          <span className="min-w-0 truncate">{action.label}</span>
        </AppSelectionDropdownMenuItem>
      ))}
      <SelectionMenuSeparator />
    </AppSelectionDropdownMenu>
  );
}
