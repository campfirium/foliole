import { useContext, useState } from 'react';

import { countSyncUnsyncedItems, formatSyncUnsyncedReport, type SyncUnsyncedViewItem } from '../../../lib/core/sync/syncUnsyncedView';
import type { SyncGroupPayload } from '../../../lib/platform/syncGroupContract';
import { useTranslation, type Translate } from '../localization/LocalizationProvider';

import { SyncItemNavigationContext } from './SyncItemNavigationContext';

const VISIBLE_ITEMS = 100;

type Props = {
  items: readonly SyncUnsyncedViewItem[];
  /** Names of current group devices; items recorded for a device that left are not shown. */
  deviceNames: Readonly<Record<string, string>>;
  loadAppVersion(): Promise<string>;
  copyText(text: string): Promise<void>;
  /** Desktop has no separate sync status line, so its heading says the rest did sync. */
  heading?: 'synced';
};

export function syncUnsyncedDeviceNames(group: SyncGroupPayload | null | undefined): Record<string, string> {
  return Object.fromEntries((group?.devices ?? [])
    .filter(device => device.state === 'active' && device.device_identity_key !== group?.local_device_identity_key)
    .map(device => [device.device_identity_key, group?.device_display_names?.[device.device_identity_key] ?? device.device_name]));
}

export function visibleSyncUnsyncedItems(items: readonly SyncUnsyncedViewItem[], deviceNames: Props['deviceNames']) {
  return items.filter(item => item.peerDeviceId in deviceNames);
}

export function SyncUnsyncedList(props: Props) {
  const t = useTranslation();
  const onOpen = useContext(SyncItemNavigationContext);
  const [copied, setCopied] = useState<string | null>(null);
  const items = visibleSyncUnsyncedItems(props.items, props.deviceNames);
  if (!items.length) return null;
  const copy = async (key: string, selection: readonly SyncUnsyncedViewItem[]) => {
    await props.copyText(formatSyncUnsyncedReport(selection, await props.loadAppVersion()));
    setCopied(key);
  };
  const copyButton = (key: string, label: string, selection: readonly SyncUnsyncedViewItem[]) => (
    <button className="shrink-0 text-xs underline" onClick={() => void copy(key, selection)} type="button">
      {copied === key ? t('companion.sync.unsynced.copied') : label}
    </button>
  );
  const heading = t(props.heading === 'synced' ? 'companion.sync.unsynced.synced' : 'companion.sync.unsynced.title',
    { count: countSyncUnsyncedItems(items) });
  return (
    <section aria-label={heading} className="space-y-2 py-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">{heading}</h3>
        {copyButton('all', t('companion.sync.unsynced.copyAll'), items)}
      </div>
      <ul className="space-y-2">
        {items.slice(0, VISIBLE_ITEMS).map(item => {
          const key = `${item.peerDeviceId}\0${item.objectType}\0${item.globalId}`;
          return (
            <li className="flex items-start justify-between gap-3 text-sm" key={key}>
              <div className="min-w-0">
                <ItemName item={item} onOpen={onOpen} />
                <p className="text-xs opacity-70">
                  {item.side === 'self' ? t('companion.sync.unsynced.thisDevice') : props.deviceNames[item.peerDeviceId]}
                  {' · '}{reason(item, t)}{' · '}<code>{item.code}</code>
                </p>
              </div>
              {copyButton(key, t('companion.sync.unsynced.copy'), [item])}
            </li>
          );
        })}
      </ul>
      {items.length > VISIBLE_ITEMS
        ? <p className="text-xs opacity-70">{t('companion.sync.unsynced.more', { count: items.length - VISIBLE_ITEMS })}</p>
        : null}
    </section>
  );
}

function ItemName({ item, onOpen }: { item: SyncUnsyncedViewItem; onOpen: ((nodeId: string) => void) | undefined }) {
  const t = useTranslation();
  if (item.title === null) {
    return <p className="break-words">{t('companion.sync.unsynced.notHere', { type: item.objectType })}</p>;
  }
  const title = item.title || item.globalId;
  return onOpen
    ? <button className="break-words text-left underline" onClick={() => onOpen(item.globalId)} type="button">{title}</button>
    : <p className="break-words">{title}</p>;
}

function reason(item: SyncUnsyncedViewItem, t: Translate) {
  if (item.code === 'sync_item_unready') return t('companion.sync.unsynced.reason.unready');
  if (item.code === 'sync_item_waiting_parent') return t('companion.sync.unsynced.reason.waiting');
  return t('companion.sync.unsynced.reason.failed');
}
