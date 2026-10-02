import { useState } from 'react';

import type { DesktopSyncActivityEvent } from '../../../../../lib/platform/desktopSyncDiagnosticsContract';
import { useTranslation, type Translate } from '../../../../shared/localization/LocalizationProvider';
import { AppButton, AppEmptyState, AppPanel } from '../../../../shared/ui';

const PREFIX = 'settings.companionSync.diagnostics' as const;

export function groupDesktopSyncActivity(events: DesktopSyncActivityEvent[]) {
  const rounds = new Map<string, DesktopSyncActivityEvent[]>();
  for (const event of events) {
    const id = event.run_id ?? event.id;
    const entries = rounds.get(id) ?? [];
    entries.push(event);
    rounds.set(id, entries);
  }
  return [...rounds.values()];
}

function eventDescription(event: DesktopSyncActivityEvent, t: Translate) {
  if (event.status === 'started') return t(event.direction === 'send' ? `${PREFIX}.sending` : `${PREFIX}.stage.${event.stage}`);
  if (event.confirmation === 'saved' && event.stage !== 'sync_push') return t(`${PREFIX}.saved`);
  if (event.status === 'failed') return event.message;
  if (event.result === 'blocked' && event.stage === 'member_state') {
    const reasons = { membership: `${PREFIX}.blocked.membership`, not_ready: `${PREFIX}.blocked.notReady`,
      watched_conflict: `${PREFIX}.blocked.watchedConflict` } as const;
    return event.message in reasons ? t(reasons[event.message as keyof typeof reasons]) : event.message;
  }
  if (event.confirmation === 'sent') return t(`${PREFIX}.sent`);
  if (event.confirmation === 'confirmed') return t(`${PREFIX}.confirmed`, { count: event.record_count ?? 0 });
  if (event.confirmation === 'blocked') return t(`${PREFIX}.blockedConfirmation`, { count: event.record_count ?? 0 });
  if (event.stage === 'sync_push') return t(`${PREFIX}.receivedChanges`, { count: event.record_count ?? 0 });
  if (event.stage === 'run') return t(event.status === 'skipped' ? `${PREFIX}.noPeer` : `${PREFIX}.localRound`);
  return t(`${PREFIX}.stage.${event.stage}`);
}

function roundResult(events: DesktopSyncActivityEvent[], active: boolean, t: Translate) {
  const terminal = events.find((event) => event.kind === 'run_finished');
  if (!terminal) return t(active ? `${PREFIX}.running` : `${PREFIX}.interrupted`);
  if (terminal.result === 'waiting') return t(terminal.stage === 'run' ? `${PREFIX}.noPeerStatus` : `${PREFIX}.waiting`);
  if (terminal.result === 'blocked') return t(`${PREFIX}.blocked`);
  return t(terminal.status === 'failed' ? `${PREFIX}.failed` : `${PREFIX}.finished`);
}

function SyncRound(props: { active: boolean; events: DesktopSyncActivityEvent[] }) {
  const t = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const latest = props.events[0]!;
  const first = props.events.at(-1)!;
  const reason = first.trigger_reason;
  const title = reason ? t(`${PREFIX}.trigger.${reason}`) : t(`${PREFIX}.remoteExchange`);
  const finished = props.events.find((event) => event.kind === 'run_finished');
  const duration = finished && reason
    ? Math.max(0, Date.parse(finished.occurred_at) - Date.parse(first.started_at ?? first.occurred_at)) : null;
  const entries = [...props.events].reverse();
  return (
    <AppPanel
      title={<span className="text-ui-md">{title} · {roundResult(props.events, props.active, t)}</span>}
      footer={<span className="text-ui-xs text-foreground/65">
        {new Date(first.started_at ?? first.occurred_at).toLocaleString()}
        {duration !== null ? ` · ${t(`${PREFIX}.duration`, { seconds: (duration / 1000).toFixed(1) })}` : ''}
      </span>}
      actions={<AppButton aria-expanded={expanded} onClick={() => setExpanded(!expanded)} size="sm">
        {t(expanded ? `${PREFIX}.collapse` : `${PREFIX}.details`)}
      </AppButton>}
    >
      {!expanded ? <p className="px-4 text-ui-sm text-foreground/65">{eventDescription(latest, t)}</p> : (
        <ol className="space-y-3 px-4 text-ui-sm">
          {entries.map((event) => (
            <li className="break-words" key={event.id}>
              <div className={event.status === 'failed' ? 'text-error' : 'text-foreground'}>
                {t(`${PREFIX}.direction.${event.direction}`)}
                {event.peer_device_id ? ` · ${event.peer_device_name || t(`${PREFIX}.unknownDevice`)}` : ''}
                {' · '}{eventDescription(event, t)}
              </div>
              <time className="text-ui-xs text-foreground/65" dateTime={event.occurred_at}>
                {new Date(event.occurred_at).toLocaleTimeString()}
              </time>
            </li>
          ))}
        </ol>
      )}
    </AppPanel>
  );
}

export function DesktopSyncActivityList(props: { activeIds: string[]; events: DesktopSyncActivityEvent[] }) {
  const t = useTranslation();
  const rounds = groupDesktopSyncActivity(props.events);
  if (!rounds.length) return <AppEmptyState title={t(`${PREFIX}.empty`)} description={t(`${PREFIX}.retention`)} />;
  return <div className="divide-y divide-border">
    {rounds.map((events) => <SyncRound active={props.activeIds.includes(events[0]!.run_id ?? '')} events={events} key={events[0]!.run_id ?? events[0]!.id} />)}
  </div>;
}
