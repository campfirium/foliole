import { GripVertical } from 'lucide-react';
import { useState, type DragEvent, type KeyboardEvent } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  SettingsControlSlot,
  SettingsRow,
  SettingsSection,
  settingsFieldClassName
} from '../../../../shared/ui';
import type { DatabaseBackupRetentionStatus } from '../../model/databaseBackups';
import type { DatabaseBackupSettings } from '../../model/databaseBackupSettings';

type RetentionTier = DatabaseBackupSettings['retention_priority'][number];

const DEFAULT_PRIORITY: RetentionTier[] = ['hourly', 'daily', 'weekly', 'monthly'];
const FIELD_BY_TIER: Record<RetentionTier, keyof DatabaseBackupSettings> = {
  hourly: 'hourly_max_count',
  daily: 'daily_max_count',
  weekly: 'weekly_max_count',
  monthly: 'monthly_max_count'
};
const TITLE_KEY_BY_TIER = {
  hourly: 'settings.backups.rules.hourly.title',
  daily: 'settings.backups.rules.daily.title',
  weekly: 'settings.backups.rules.weekly.title',
  monthly: 'settings.backups.rules.monthly.title'
} as const;
const DESCRIPTION_KEY_BY_TIER = {
  hourly: 'settings.backups.rules.hourly.description',
  daily: 'settings.backups.rules.daily.description',
  weekly: 'settings.backups.rules.weekly.description',
  monthly: 'settings.backups.rules.monthly.description'
} as const;

function formatGigabytes(bytes: number) {
  if (bytes <= 0) return '0';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

function RetentionValues(props: {
  current: string | number;
  disabled: boolean;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <SettingsControlSlot className="flex-[0_0_176px] items-center justify-end gap-4 max-[1080px]:self-end">
      <span className="w-14 text-center text-ui-md tabular-nums text-foreground/80">{props.current}</span>
      <input
        aria-label={props.label}
        className={settingsFieldClassName('w-24 [appearance:textfield] text-center tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none')}
        disabled={props.disabled}
        inputMode="numeric"
        min="0"
        onChange={(event) => props.onChange(event.target.value)}
        type="number"
        value={props.value}
      />
    </SettingsControlSlot>
  );
}

function moveTier(priority: RetentionTier[], source: RetentionTier, target: RetentionTier) {
  if (source === target) return priority;
  const targetIndex = priority.indexOf(target);
  const next = priority.filter((tier) => tier !== source);
  next.splice(targetIndex, 0, source);
  return next;
}

function isRetentionTier(value: string): value is RetentionTier {
  return DEFAULT_PRIORITY.includes(value as RetentionTier);
}

function PriorityRuleRow(props: {
  current: number;
  disabled: boolean;
  isDragged: boolean;
  onChange: (value: string) => void;
  onDropTier: (target: RetentionTier, source?: RetentionTier) => void;
  onMove: (tier: RetentionTier, direction: -1 | 1) => void;
  setDraggedTier: (tier: RetentionTier | null) => void;
  tier: RetentionTier;
  value: number;
}) {
  const t = useTranslation();
  const title = t(TITLE_KEY_BY_TIER[props.tier]);
  return (
    <SettingsRow
      className={`min-h-[76px] items-center pl-12 transition-opacity ${props.isDragged ? 'opacity-55' : ''}`}
      data-retention-tier={props.tier}
      description={t(DESCRIPTION_KEY_BY_TIER[props.tier])}
      onDragOver={(event: DragEvent<HTMLDivElement>) => event.preventDefault()}
      onDrop={(event: DragEvent<HTMLDivElement>) => {
        const source = event.dataTransfer.getData('text/plain');
        props.onDropTier(props.tier, isRetentionTier(source) ? source : undefined);
      }}
      title={title}
    >
      <button
        aria-label={t('settings.backups.rules.move', { label: title })}
        className="absolute left-5 top-1/2 inline-flex size-7 -translate-y-1/2 cursor-grab items-center justify-center rounded-md text-settings-icon hover:bg-settings-control-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring active:cursor-grabbing"
        disabled={props.disabled}
        draggable={!props.disabled}
        onDragEnd={() => props.setDraggedTier(null)}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', props.tier);
          props.setDraggedTier(props.tier);
        }}
        onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
          if (event.key === 'ArrowUp') props.onMove(props.tier, -1);
          if (event.key === 'ArrowDown') props.onMove(props.tier, 1);
        }}
        type="button"
      >
        <GripVertical aria-hidden="true" size={16} />
      </button>
      <RetentionValues current={props.current} disabled={props.disabled} label={title} onChange={props.onChange} value={String(props.value)} />
    </SettingsRow>
  );
}

function cleanupDescription(status: DatabaseBackupRetentionStatus, base: string, t: ReturnType<typeof useTranslation>) {
  const cleanup = status.lastCleanup;
  if (!cleanup) return base;
  const parts = [base];
  if (cleanup.movedToTrashCount > 0) parts.push(t('settings.backups.rules.cleanup.moved', { count: cleanup.movedToTrashCount }));
  if (cleanup.failedCount > 0) parts.push(t('settings.backups.rules.cleanup.failed', { count: cleanup.failedCount }));
  if (cleanup.remainingBytesOverLimit > 0) {
    parts.push(t('settings.backups.rules.cleanup.over', { size: formatGigabytes(cleanup.remainingBytesOverLimit) }));
  }
  return parts.join(' ');
}

export function BackupRetentionRulesSection(props: {
  draft: DatabaseBackupSettings;
  isDesktopRuntime: boolean;
  onChangeField: (field: keyof DatabaseBackupSettings, value: string) => void;
  onChangePriority: (priority: RetentionTier[]) => void;
  status: DatabaseBackupRetentionStatus;
}) {
  const t = useTranslation();
  const [draggedTier, setDraggedTier] = useState<RetentionTier | null>(null);
  const changePriority = (source: RetentionTier, target: RetentionTier) =>
    props.onChangePriority(moveTier(props.draft.retention_priority, source, target));
  const movePriority = (tier: RetentionTier, direction: -1 | 1) => {
    const index = props.draft.retention_priority.indexOf(tier);
    const target = props.draft.retention_priority[index + direction];
    if (target) changePriority(tier, target);
  };
  const storageDescription = cleanupDescription(
    props.status,
    t('settings.backups.rules.totalSize.description'),
    t
  );

  return (
    <SettingsSection ariaLabel={t('settings.backups.rules.sectionAria')} title={t('settings.backups.rules.title')}>
      <div className="flex min-h-9 items-center justify-between px-settings-panel-x text-ui-sm text-foreground/48">
        <div className="flex items-center gap-3">
          <span>{t('settings.backups.rules.priority')}</span>
          <button className="rounded px-1.5 py-1 hover:bg-settings-control-hover hover:text-foreground" onClick={() => props.onChangePriority(DEFAULT_PRIORITY)} type="button">
            {t('settings.backups.rules.reset')}
          </button>
        </div>
        <div className="flex w-44 justify-end gap-4 text-center">
          <span className="w-14">{t('settings.backups.rules.current')}</span>
          <span className="w-24">{t('settings.backups.rules.set')}</span>
        </div>
      </div>
      <SettingsRow className="min-h-[76px] items-center pl-12" description={t('settings.backups.rules.snapshots.description')} title={t('settings.backups.rules.snapshots.title')}>
        <span aria-hidden="true" className="absolute left-7 top-1/2 size-2 -translate-y-1/2 rounded-full bg-emerald-600/80" />
        <RetentionValues current={props.status.safetyCount} disabled={!props.isDesktopRuntime} label={t('settings.backups.rules.snapshots.title')} onChange={(value) => props.onChangeField('safety_max_count', value)} value={String(props.draft.safety_max_count)} />
      </SettingsRow>
      {props.draft.retention_priority.map((tier) => (
        <PriorityRuleRow
          current={props.status.counts[tier]}
          disabled={!props.isDesktopRuntime}
          isDragged={draggedTier === tier}
          key={tier}
          onChange={(value) => props.onChangeField(FIELD_BY_TIER[tier], value)}
          onDropTier={(target, source) => source && changePriority(source, target)}
          onMove={movePriority}
          setDraggedTier={setDraggedTier}
          tier={tier}
          value={props.draft[FIELD_BY_TIER[tier]] as number}
        />
      ))}
      <SettingsRow className="min-h-[76px] items-center" description={storageDescription} title={t('settings.backups.rules.totalSize.title')}>
        <RetentionValues current={formatGigabytes(props.status.totalSizeBytes)} disabled={!props.isDesktopRuntime} label={t('settings.backups.rules.totalSize.title')} onChange={(value) => props.onChangeField('total_size_limit_bytes', value)} value={formatGigabytes(props.draft.total_size_limit_bytes)} />
      </SettingsRow>
    </SettingsSection>
  );
}
