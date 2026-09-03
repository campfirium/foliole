import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppSpinner } from '../shared/ui';

import type { CompanionSyncGroupDiscovery } from './companionSyncGroupJoinModel';

function resolveGroupTitle(group: CompanionSyncGroupDiscovery, fallback: string) {
  return group.groupDisplayName || fallback;
}

function JoinAction(props: {
  disabled: boolean;
  endpointUrl: string;
  isConnecting: boolean;
  onClick(): void;
}) {
  const t = useTranslation();
  return (
    <button
      aria-busy={props.isConnecting || undefined}
      className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-companion-divider px-4 py-2 text-sm font-medium text-foreground transition active:bg-companion-subtle/80 disabled:cursor-not-allowed ${props.isConnecting ? 'disabled:opacity-100' : 'disabled:opacity-45'}`}
      disabled={props.disabled}
      data-sync-endpoint={props.endpointUrl}
      data-testid="companion-sync-group-join"
      onClick={props.onClick}
      type="button"
    >
      {props.isConnecting ? (
        <>
          <AppSpinner className="pointer-events-none shrink-0" decorative size="sm" />
          <span>{t('companion.sync.discovery.connecting')}</span>
        </>
      ) : t('companion.sync.discovery.connect')}
    </button>
  );
}

function GroupRow(props: {
  group: CompanionSyncGroupDiscovery;
  disabled: boolean;
  isConnecting: boolean;
  onJoin(endpointUrl: string): void;
}) {
  const t = useTranslation();
  const groupTitle = resolveGroupTitle(props.group, t('companion.sync.discovery.unknownGroup'));
  const isCompatible = props.group.compatibility.status === 'compatible';
  return (
    <div className="px-1 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold leading-tight text-foreground">
            {groupTitle}
          </p>
          {isCompatible ? null : (
            <p className="mt-1 text-xs leading-5 text-accent">
              {t('companion.sync.discovery.incompatible')}
            </p>
          )}
        </div>
        <JoinAction
          disabled={props.disabled || !isCompatible}
          endpointUrl={props.group.endpointUrl}
          isConnecting={props.isConnecting}
          onClick={() => props.onJoin(props.group.endpointUrl)}
        />
      </div>
    </div>
  );
}

export function CompanionSyncGroupList(props: {
  groups: CompanionSyncGroupDiscovery[];
  disabled: boolean;
  isConnecting?: boolean;
  onJoin(endpointUrl: string): void;
  showHeading?: boolean;
}) {
  const t = useTranslation();
  const groupCount = props.groups.length;
  const unit = t(groupCount === 1 ? 'companion.sync.discovery.group' : 'companion.sync.discovery.groups');
  return (
    <div>
      {props.showHeading === false ? null : (
        <h2 className="text-xl font-semibold leading-tight text-foreground">
          {t('companion.sync.discovery.found', { count: groupCount, unit })}
        </h2>
      )}
      <div className={props.showHeading === false ? 'flex flex-col gap-2' : 'mt-3 flex flex-col gap-2'}>
        {props.groups.map((group) => (
          <GroupRow
            disabled={props.disabled}
            group={group}
            isConnecting={props.isConnecting === true}
            key={`${group.groupId}:${group.groupTag}`}
            onJoin={props.onJoin}
          />
        ))}
      </div>
    </div>
  );
}
