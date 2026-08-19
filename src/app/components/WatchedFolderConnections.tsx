import { MoreHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';

import type {
  NativeWatchedFolderBinding,
  NativeWatchedFolderBindingsState
} from '../../../lib/platform/nativeWatchedFolderContract';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { useActiveSyncGroupMembership } from '../../shared/platform/external/useActiveSyncGroupMembership';
import { selectRuntimeFolder } from '../../shared/platform/folderSelectionRuntimeRepository';
import {
  confirmWatchedFolderReconnectInRuntime,
  loadWatchedFolderBindingsFromRuntime,
  previewWatchedFolderReconnectInRuntime,
  removeWatchedFolderInRuntime
} from '../../shared/platform/import/watchedFolderRuntimeRepository';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuSeparator,
  AppDropdownMenuTrigger,
  requestAppConfirmation,
  settingsActionTableHeaderClassName,
  settingsActionTableRowClassName
} from '../../shared/ui';

const PLATFORM_NAMES: Record<string, string> = { darwin: 'macOS', linux: 'Linux', win32: 'Windows' };
const REMOTE_SOURCE_COLUMNS = '[grid-template-columns:16.25rem_minmax(0,1fr)]';

function groupBindings(bindings: NativeWatchedFolderBinding[], waitingLabel: string) {
  const groups = new Map<string, {
    bindings: NativeWatchedFolderBinding[];
    deviceId: string | null;
    deviceName: string;
    platformName: string | null;
  }>();
  bindings.forEach((binding) => {
    const key = binding.connected_device_id ?? `waiting:${binding.binding_id}`;
    const group = groups.get(key) ?? {
      bindings: [],
      deviceId: binding.connected_device_id,
      deviceName: binding.connected_device_name?.trim() || waitingLabel,
      platformName: binding.connected_platform ? PLATFORM_NAMES[binding.connected_platform] ?? null : null
    };
    group.bindings.push(binding);
    groups.set(key, group);
  });
  return [...groups.entries()].map(([key, group]) => ({ key, ...group }));
}

function MenuButton(props: { label: string }) {
  return (
    <button
      aria-label={props.label}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-foreground/55 transition-colors hover:bg-settings-control-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-strong"
      type="button"
    >
      <MoreHorizontal aria-hidden="true" size={18} strokeWidth={1.8} />
    </button>
  );
}

function DeviceActions(props: { deviceName: string }) {
  const t = useTranslation();
  return (
    <AppDropdownMenu>
      <AppDropdownMenuTrigger asChild>
        <MenuButton label={t('desktop.watchedFolder.connections.deviceActions', { device: props.deviceName })} />
      </AppDropdownMenuTrigger>
      <AppDropdownMenuContent align="end" sideOffset={4}>
        <AppDropdownMenuItem disabled>{t('desktop.watchedFolder.changeSource')}</AppDropdownMenuItem>
        <AppDropdownMenuSeparator />
        <AppDropdownMenuItem disabled>{t('desktop.watchedFolder.removeSource')}</AppDropdownMenuItem>
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}

function SourceActions(props: {
  binding: NativeWatchedFolderBinding;
  onReconnect: () => void;
  onRemove: () => void;
}) {
  const t = useTranslation();
  const waiting = props.binding.connection_status === 'needs-folder';
  return (
    <AppDropdownMenu>
      <AppDropdownMenuTrigger asChild>
        <MenuButton label={t('desktop.watchedFolder.connections.folderActions', { path: props.binding.primary_path })} />
      </AppDropdownMenuTrigger>
      <AppDropdownMenuContent align="end" sideOffset={4}>
        <AppDropdownMenuItem disabled={!waiting} onSelect={props.onReconnect}>
          {t('desktop.watchedFolder.changeSource')}
        </AppDropdownMenuItem>
        <AppDropdownMenuSeparator />
        <AppDropdownMenuItem
          className="text-destructive focus:text-destructive data-[highlighted]:text-destructive"
          disabled={!waiting}
          onSelect={props.onRemove}
        >
          {t('desktop.watchedFolder.removeSource')}
        </AppDropdownMenuItem>
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}

function RemoteSourceRow(props: {
  binding: NativeWatchedFolderBinding;
  onReconnect: () => void;
  onRemove: () => void;
}) {
  const t = useTranslation();
  return (
    <div className="grid min-h-10 grid-cols-[minmax(0,1fr)_2rem] items-center gap-3 rounded-md transition-colors hover:bg-settings-control-hover">
      <span className="min-w-0 truncate font-mono text-xs text-foreground/68">
        {props.binding.primary_path || t('desktop.watchedFolder.source')}
      </span>
      <SourceActions {...props} />
    </div>
  );
}

function WatchedFolderGroupList(props: {
  bindings: NativeWatchedFolderBinding[];
  onReconnect: (bindingId: string) => void;
  onRemove: (bindingId: string) => void;
}) {
  const t = useTranslation();
  const groups = groupBindings(props.bindings, t('desktop.watchedFolder.connections.waiting'));
  return (
    <div className="grid gap-1">
      {groups.map((group) => (
        <section
          aria-label={group.deviceName}
          className={settingsActionTableRowClassName(REMOTE_SOURCE_COLUMNS, 'items-start')}
          key={group.key}
          role="group"
        >
          <div className="flex min-h-10 min-w-0 items-center rounded-md transition-colors hover:bg-settings-control-hover">
            <div className="flex min-w-0 items-center gap-1">
              <span className="truncate text-sm font-semibold">{group.deviceName}</span>
              {group.platformName ? <span className="shrink-0 text-xs text-foreground/48">{group.platformName}</span> : null}
              {group.deviceId ? <DeviceActions deviceName={group.deviceName} /> : null}
            </div>
          </div>
          <div className="grid min-w-0 gap-0.5">
            {group.bindings.map((binding) => (
              <RemoteSourceRow
                binding={binding}
                key={binding.binding_id}
                onReconnect={() => props.onReconnect(binding.binding_id)}
                onRemove={() => props.onRemove(binding.binding_id)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function WatchedFolderConnections() {
  const t = useTranslation();
  const hasActiveSyncGroup = useActiveSyncGroupMembership();
  const [state, setState] = useState<NativeWatchedFolderBindingsState | null>(null);
  const refresh = () => void loadWatchedFolderBindingsFromRuntime().then(setState).catch(() => undefined);
  useEffect(refresh, []);

  async function reconnect(bindingId: string) {
    const folderPath = await selectRuntimeFolder();
    if (!folderPath) return;
    const preview = await previewWatchedFolderReconnectInRuntime(bindingId, folderPath);
    const confirmed = await requestAppConfirmation({
      cancelLabel: t('desktop.watchedFolder.reconnect.cancel'),
      confirmLabel: t('desktop.watchedFolder.reconnect.confirm'),
      description: t('desktop.watchedFolder.reconnect.summary', {
        matched: preview.matched_count, missing: preview.missing_count, added: preview.new_count
      }),
      title: t('desktop.watchedFolder.reconnect.title')
    });
    if (!confirmed) return;
    await confirmWatchedFolderReconnectInRuntime(bindingId, folderPath);
    refresh();
  }

  async function remove(bindingId: string) {
    const confirmed = await requestAppConfirmation({
      cancelLabel: t('desktop.watchedFolder.remove.cancel'),
      confirmLabel: t('desktop.watchedFolder.remove.confirm'),
      description: t('desktop.watchedFolder.remove.description'),
      title: t('desktop.watchedFolder.remove.title')
    });
    if (!confirmed) return;
    await removeWatchedFolderInRuntime(bindingId);
    refresh();
  }

  const remoteBindings = state?.bindings.filter((binding) => binding.connected_device_id !== state.current_device_id) ?? [];
  if (!hasActiveSyncGroup || !remoteBindings.length) return null;
  return (
    <section aria-label={t('desktop.watchedFolder.connections.otherDevices')} className="mb-6 min-w-0">
      <div className={settingsActionTableHeaderClassName(REMOTE_SOURCE_COLUMNS)}>
        <span>{t('desktop.watchedFolder.connections.otherDevices')}</span>
        <span>{t('desktop.watchedFolder.connections.path')}</span>
      </div>
      <WatchedFolderGroupList
        bindings={remoteBindings}
        onReconnect={(bindingId) => void reconnect(bindingId)}
        onRemove={(bindingId) => void remove(bindingId)}
      />
    </section>
  );
}
