import { MoreHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';

import type {
  NativeWatchedFolderBinding,
  NativeWatchedFolderBindingsState
} from '../../../lib/platform/nativeWatchedFolderContract';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { useActiveSyncGroup } from '../../shared/platform/external/useActiveSyncGroup';
import {
  loadWatchedFolderBindingsFromRuntime,
} from '../../shared/platform/import/watchedFolderRuntimeRepository';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuSeparator,
  AppDropdownMenuTrigger,
  settingsActionTableHeaderClassName,
  settingsActionTableRowClassName
} from '../../shared/ui';

import {
  reconnectWatchedSource,
  removeWatchedSource
} from './watchedSourceManagementActions';

const PLATFORM_NAMES: Record<string, string> = { darwin: 'macOS', linux: 'Linux', win32: 'Windows' };
const REMOTE_SOURCE_COLUMNS = '[grid-template-columns:16.25rem_minmax(0,1fr)]';

function groupBindings(bindings: NativeWatchedFolderBinding[], waitingLabel: string) {
  const groups = new Map<string, {
    bindings: NativeWatchedFolderBinding[];
    hostName: string;
    platformName: string | null;
  }>();
  bindings.forEach((binding) => {
    const key = binding.owner_device_identity_key ?? binding.source_ref;
    const group = groups.get(key) ?? {
      bindings: [],
      hostName: binding.host_name.trim() || waitingLabel,
      platformName: binding.host_platform ? PLATFORM_NAMES[binding.host_platform] ?? null : null
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

function SourceActions(props: {
  binding: NativeWatchedFolderBinding;
  onReconnect: () => void;
  onRemove: () => void;
}) {
  const t = useTranslation();
  return (
    <AppDropdownMenu>
      <AppDropdownMenuTrigger asChild>
        <MenuButton label={t('desktop.watchedFolder.connections.folderActions', {
          path: props.binding.primary_path || t('desktop.watchedFolder.source')
        })} />
      </AppDropdownMenuTrigger>
      <AppDropdownMenuContent align="end" sideOffset={4}>
        <AppDropdownMenuItem onSelect={props.onReconnect}>
          {t('desktop.watchedFolder.changeSource')}
        </AppDropdownMenuItem>
        <AppDropdownMenuSeparator />
        <AppDropdownMenuItem
          className="text-destructive focus:text-destructive data-[highlighted]:text-destructive"
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
          aria-label={group.hostName}
          className={settingsActionTableRowClassName(REMOTE_SOURCE_COLUMNS, 'items-start')}
          key={group.key}
          role="group"
        >
          <div className="flex min-h-10 min-w-0 items-center rounded-md transition-colors hover:bg-settings-control-hover">
            <div className="flex min-w-0 items-center gap-1">
              <span className="truncate text-sm font-semibold">{group.hostName}</span>
              {group.platformName ? <span className="shrink-0 text-xs text-foreground/48">{group.platformName}</span> : null}
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
  const hasActiveSyncGroup = useActiveSyncGroup();
  const [state, setState] = useState<NativeWatchedFolderBindingsState | null>(null);
  const refresh = () => void loadWatchedFolderBindingsFromRuntime().then(setState).catch(() => undefined);
  useEffect(refresh, []);

  const reconnect = (bindingId: string) => reconnectWatchedSource(bindingId, refresh, t);
  const remove = (bindingId: string) => {
    const binding = state?.bindings.find((item) => item.binding_id === bindingId);
    return binding ? removeWatchedSource(binding.source_ref, refresh, t) : Promise.resolve();
  };

  const remoteBindings = state?.bindings.filter((binding) => (
    binding.owner_device_identity_key !== state.current_device_identity_key
  )) ?? [];
  if (!hasActiveSyncGroup || !remoteBindings.length) return null;
  return (
    <section aria-label={t('desktop.watchedFolder.connections.title')} className="mb-6 min-w-0">
      <div className={settingsActionTableHeaderClassName(REMOTE_SOURCE_COLUMNS)}>
        <span>{t('desktop.watchedFolder.connections.title')}</span>
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
