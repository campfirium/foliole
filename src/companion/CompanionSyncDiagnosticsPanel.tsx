import { useState } from 'react';

import type {
  SyncDiagnosticSeverity,
  SyncDiagnosticSnapshot,
  SyncDiagnosticVerdict
} from '../../lib/platform/syncDiagnosticsContract';
import {
  buildSyncConvergenceReport,
  runSyncConvergenceCheck,
  type SyncConvergenceReport
} from '../shared/platform/companionSyncConvergence';
import {
  runCombinedSyncDiagnostics,
  type CombinedSyncDiagnosticResult
} from '../shared/platform/companionSyncDiagnostics';

import { CompanionSyncConvergenceReport } from './CompanionSyncConvergenceReport';
import { CompanionSyncDiagnosticCheckpoint } from './CompanionSyncDiagnosticCheckpoint';
import { SnapshotMetrics } from './CompanionSyncDiagnosticMetrics';
import { DirtyObjectRows, ObjectTypeRows, PendingAckRows } from './CompanionSyncDiagnosticsRows';
import { buildSyncDiagnosticSummary } from './CompanionSyncDiagnosticSummary';
import { friendlySyncDiagnosticVerdict } from './companionSyncDiagnosticVerdicts';

function severityClass(severity: SyncDiagnosticSeverity) {
  if (severity === 'error') return 'text-error';
  if (severity === 'warning') return 'text-foreground';
  if (severity === 'ok') return 'text-companion-accent';
  return 'text-companion-text-secondary';
}

function VerdictList(props: { verdicts: SyncDiagnosticVerdict[] }) {
  if (props.verdicts.length === 0) {
    return <p className="py-4 text-sm text-companion-text-secondary">No diagnostic verdicts yet.</p>;
  }
  return (
    <div className="border-t border-companion-divider">
      {props.verdicts.map((verdict, index) => (
        <div className="border-b border-companion-divider py-3 last:border-b-0" key={`${verdict.code}-${index}`}>
          <div className={`text-sm font-medium ${severityClass(verdict.severity)}`}>{friendlySyncDiagnosticVerdict(verdict).title}</div>
          {friendlySyncDiagnosticVerdict(verdict).description ? (
            <div className="mt-1 text-xs leading-5 text-companion-text-secondary">{friendlySyncDiagnosticVerdict(verdict).description}</div>
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
  const dirtyObjects = props.snapshot?.sync_state.dirty_objects ?? [];
  const pendingAcks = props.snapshot?.sync_state.pending_acks ?? [];
  const pushIssues = props.snapshot?.sync_state.push_issues ?? [];
  return (
    <section>
      <h3 className="text-sm font-semibold text-foreground">{props.title}</h3>
      {props.snapshot ? (
        <div className="space-y-4">
          <SnapshotMetrics snapshot={props.snapshot} />
          <section>
            <h4 className="text-xs font-semibold text-companion-text-secondary">Object types</h4>
            <ObjectTypeRows rows={props.snapshot.sync_state.state_counts} />
          </section>
          {props.snapshot.host === 'android' ? (
            <>
              <section>
                <h4 className="text-xs font-semibold text-companion-text-secondary">Device changes waiting</h4>
                <DirtyObjectRows rows={dirtyObjects} />
              </section>
              <section>
                <h4 className="text-xs font-semibold text-companion-text-secondary">Desktop confirmations waiting</h4>
                <PendingAckRows rows={pendingAcks} />
              </section>
              <section>
                <h4 className="text-xs font-semibold text-companion-text-secondary">Device changes not sent</h4>
                <PendingAckRows emptyText="No device changes failed to send." rows={pushIssues} />
              </section>
            </>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-sm leading-6 text-companion-text-secondary">{props.empty}</p>
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
  return (
    <>
      <button
        className="w-full rounded-companion border border-border-strong bg-foreground px-4 py-3 text-sm font-semibold text-bg-panel disabled:opacity-45"
        disabled={props.status === 'running'}
        onClick={props.onRunDiagnostic}
        type="button"
      >
        {props.status === 'running' ? 'Running...' : 'Run sync diagnostic'}
      </button>
      <button
        className="w-full rounded-companion border border-border px-4 py-3 text-sm font-medium text-foreground disabled:opacity-45"
        disabled={props.status !== 'idle'}
        onClick={props.onRunConvergence}
        type="button"
      >
        {props.status === 'checking' ? 'Checking...' : 'Run convergence check'}
      </button>
      {props.hasResult ? (
        <button
          className="w-full rounded-companion border border-border px-4 py-3 text-sm font-medium text-foreground"
          onClick={props.onCopy}
          type="button"
        >
          {props.copied ? 'Copied' : 'Copy diagnostic summary'}
        </button>
      ) : null}
    </>
  );
}

function DiagnosticResultSections(props: {
  convergenceReport: SyncConvergenceReport | null;
  result: CombinedSyncDiagnosticResult;
}) {
  return (
    <>
      <CompanionSyncDiagnosticCheckpoint result={props.result} />
      {props.convergenceReport ? <CompanionSyncConvergenceReport report={props.convergenceReport} /> : null}
      <section>
        <h3 className="text-sm font-semibold text-foreground">What this means</h3>
        <VerdictList verdicts={props.result.verdicts} />
      </section>
      <SnapshotSection empty="Android diagnostics are only available in the native app." snapshot={props.result.android} title="Android" />
      <SnapshotSection empty="Desktop diagnostics need a paired desktop address." snapshot={props.result.desktop} title="Desktop" />
    </>
  );
}

export function CompanionSyncDiagnosticsPanel(props: { endpointUrl: string | null }) {
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
      setError(nextError instanceof Error ? nextError.message : 'Sync diagnostic failed.');
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
      setError(nextError instanceof Error ? nextError.message : 'Sync convergence check failed.');
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
      {error ? <p className="text-sm leading-6 text-error">{error}</p> : null}
      {result ? (
        <DiagnosticResultSections convergenceReport={convergenceReport} result={result} />
      ) : null}
    </section>
  );
}
