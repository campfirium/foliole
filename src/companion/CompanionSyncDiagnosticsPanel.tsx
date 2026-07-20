import { useState } from 'react';

import type {
  SyncDiagnosticSeverity,
  SyncDiagnosticSnapshot,
  SyncDiagnosticVerdict
} from '../../lib/platform/syncDiagnosticsContract';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import {
  buildSyncConvergenceReport,
  runSyncConvergenceCheck,
  type SyncConvergenceReport
} from '../shared/platform/companion/sync/diagnostics/companionSyncConvergence';
import {
  runCombinedSyncDiagnostics,
  type CombinedSyncDiagnosticResult
} from '../shared/platform/companion/sync/diagnostics/companionSyncDiagnostics';
import { AppEmptyState } from '../shared/ui';

import { CompanionSyncConvergenceReport } from './CompanionSyncConvergenceReport';
import { CompanionSyncDiagnosticCheckpoint } from './CompanionSyncDiagnosticCheckpoint';
import { SnapshotMetrics } from './CompanionSyncDiagnosticMetrics';
import { DirtyObjectRows, ObjectTypeRows, PendingAckRows } from './CompanionSyncDiagnosticsRows';
import { CompanionSyncDiagnosticStatus } from './CompanionSyncDiagnosticStatus';
import { buildSyncDiagnosticSummary } from './CompanionSyncDiagnosticSummary';
import { friendlySyncDiagnosticVerdict } from './companionSyncDiagnosticVerdicts';

function severityClass(severity: SyncDiagnosticSeverity) {
  if (severity === 'error') return 'text-error';
  if (severity === 'warning') return 'text-foreground';
  if (severity === 'ok') return 'text-companion-accent';
  return 'text-companion-text-secondary';
}

function VerdictList(props: { verdicts: SyncDiagnosticVerdict[] }) {
  const t = useTranslation();
  if (props.verdicts.length === 0) {
    return <AppEmptyState className="min-h-0 items-start py-4 text-left text-companion-text-secondary" description={t('companion.sync.diagnostics.noVerdicts.description')} title={t('companion.sync.diagnostics.noVerdicts.title')} />;
  }
  return (
    <div className="border-t border-companion-divider">
      {props.verdicts.map((verdict, index) => (
        <div className="border-b border-companion-divider py-3 last:border-b-0" key={`${verdict.code}-${index}`}>
          <div className={`text-sm font-medium ${severityClass(verdict.severity)}`}>{friendlySyncDiagnosticVerdict(verdict, t).title}</div>
          {friendlySyncDiagnosticVerdict(verdict, t).description ? (
            <div className="mt-1 text-xs leading-5 text-companion-text-secondary">{friendlySyncDiagnosticVerdict(verdict, t).description}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function SnapshotSection(props: {
  empty: string;
  snapshot: SyncDiagnosticSnapshot | null;
  title: string;
}) {
  const t = useTranslation();
  const dirtyObjects = props.snapshot?.sync_state.dirty_objects ?? [];
  const pendingAcks = props.snapshot?.sync_state.pending_acks ?? [];
  const pushIssues = props.snapshot?.sync_state.push_issues ?? [];
  const isDevice = props.snapshot?.host === 'android' || props.snapshot?.host === 'ios';
  return (
    <section>
      <h3 className="text-sm font-semibold text-foreground">{props.title}</h3>
      {props.snapshot ? (
        <div className="space-y-4">
          <SnapshotMetrics snapshot={props.snapshot} />
          <section>
            <h4 className="text-xs font-semibold text-companion-text-secondary">{t('companion.sync.diagnostics.objectTypes')}</h4>
            <ObjectTypeRows rows={props.snapshot.sync_state.state_counts} />
          </section>
          {isDevice ? (
            <>
              <section>
                <h4 className="text-xs font-semibold text-companion-text-secondary">{t('companion.sync.diagnostics.deviceChangesWaiting')}</h4>
                <DirtyObjectRows rows={dirtyObjects} />
              </section>
              <section>
                <h4 className="text-xs font-semibold text-companion-text-secondary">{t('companion.sync.diagnostics.desktopConfirmationsWaiting')}</h4>
                <PendingAckRows rows={pendingAcks} />
              </section>
              <section>
                <h4 className="text-xs font-semibold text-companion-text-secondary">{t('companion.sync.diagnostics.deviceChangesNotSent')}</h4>
                <PendingAckRows emptyText={t('companion.sync.diagnostics.noFailedDeviceChanges')} rows={pushIssues} />
              </section>
            </>
          ) : null}
        </div>
      ) : (
        <AppEmptyState
          className="mt-3 min-h-0 items-start text-left text-companion-text-secondary"
          description={t('companion.sync.diagnostics.sectionEmpty.description')}
          title={props.empty}
        />
      )}
    </section>
  );
}

function DiagnosticActions(props: {
  onCopy: () => void;
  onRunConvergence: () => void;
  onRunDiagnostic: () => void;
  hasResult: boolean;
  copied: boolean;
  status: 'checking' | 'idle' | 'running';
}) {
  const t = useTranslation();
  return (
    <>
      <button
        className="w-full rounded-companion border border-border-strong bg-foreground px-4 py-3 text-sm font-semibold text-bg-panel disabled:opacity-45"
        disabled={props.status === 'running'}
        onClick={props.onRunDiagnostic}
        type="button"
      >
        {props.status === 'running' ? t('companion.sync.diagnostics.running') : t('companion.sync.diagnostics.run')}
      </button>
      <button
        className="w-full rounded-companion border border-border px-4 py-3 text-sm font-medium text-foreground disabled:opacity-45"
        disabled={props.status !== 'idle'}
        onClick={props.onRunConvergence}
        type="button"
      >
        {props.status === 'checking' ? t('companion.sync.diagnostics.checking') : t('companion.sync.diagnostics.convergence')}
      </button>
      {props.hasResult ? (
        <button
          className="w-full rounded-companion border border-border px-4 py-3 text-sm font-medium text-foreground"
          onClick={props.onCopy}
          type="button"
        >
          {props.copied ? t('companion.sync.diagnostics.copied') : t('companion.sync.diagnostics.copy')}
        </button>
      ) : null}
    </>
  );
}

function DiagnosticResultSections(props: {
  convergenceReport: SyncConvergenceReport | null;
  result: CombinedSyncDiagnosticResult;
}) {
  const t = useTranslation();
  return (
    <>
      <CompanionSyncDiagnosticCheckpoint result={props.result} />
      {props.convergenceReport ? <CompanionSyncConvergenceReport report={props.convergenceReport} /> : null}
      <section>
        <h3 className="text-sm font-semibold text-foreground">{t('companion.sync.diagnostics.meaning')}</h3>
        <VerdictList verdicts={props.result.verdicts} />
      </section>
      <SnapshotSection empty={t('companion.sync.diagnostics.deviceUnavailable')} snapshot={props.result.android} title={t('companion.sync.diagnostics.deviceTitle')} />
      <SnapshotSection empty={t('companion.sync.diagnostics.desktopUnavailable')} snapshot={props.result.desktop} title={t('companion.sync.diagnostics.desktopTitle')} />
    </>
  );
}

export function CompanionSyncDiagnosticsPanel(props: { endpointUrl: string | null }) {
  const t = useTranslation();
  const [copied, setCopied] = useState(false);
  const [convergenceReport, setConvergenceReport] = useState<SyncConvergenceReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CombinedSyncDiagnosticResult | null>(null);
  const [status, setStatus] = useState<'checking' | 'idle' | 'running'>('idle');

  async function runDiagnostic() {
    setCopied(false);
    setConvergenceReport(null);
    setError(null);
    setStatus('running');
    try {
      const nextResult = await runCombinedSyncDiagnostics(props.endpointUrl);
      setResult(nextResult);
      setConvergenceReport(buildSyncConvergenceReport(nextResult));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t('companion.sync.diagnostics.failed'));
    } finally {
      setStatus('idle');
    }
  }

  async function runConvergence() {
    setCopied(false);
    setError(null);
    setStatus('checking');
    try {
      const nextResult = await runSyncConvergenceCheck(props.endpointUrl);
      setResult(nextResult.diagnostics);
      setConvergenceReport(nextResult.report);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t('companion.sync.diagnostics.convergenceFailed'));
    } finally {
      setStatus('idle');
    }
  }

  async function copySummary() {
    if (!result) return;
    await navigator.clipboard.writeText(buildSyncDiagnosticSummary(result));
    setCopied(true);
  }

  return (
    <section className="space-y-6 border-t border-companion-divider pt-4">
      <DiagnosticActions
        copied={copied}
        hasResult={Boolean(result)}
        onCopy={() => void copySummary()}
        onRunConvergence={() => void runConvergence()}
        onRunDiagnostic={() => void runDiagnostic()}
        status={status}
      />
      <CompanionSyncDiagnosticStatus error={error} status={status} />
      {result ? (
        <DiagnosticResultSections convergenceReport={convergenceReport} result={result} />
      ) : null}
    </section>
  );
}
