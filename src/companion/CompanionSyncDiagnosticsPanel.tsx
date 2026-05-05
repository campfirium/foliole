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
import { DirtyObjectRows, ObjectTypeRows, PendingAckRows } from './CompanionSyncDiagnosticsRows';

function severityClass(severity: SyncDiagnosticSeverity) {
  if (severity === 'error') return 'text-error';
  if (severity === 'warning') return 'text-foreground';
  if (severity === 'ok') return 'text-companion-accent';
  return 'text-companion-text-secondary';
}

function friendlyVerdict(verdict: SyncDiagnosticVerdict) {
  if (verdict.code === 'sync_android_not_caught_up') {
    return {
      description: 'Foliole will bring them in on the next sync.',
      title: 'New desktop changes are available'
    };
  }
  if (verdict.code === 'sync_android_content_cache_backlog' || verdict.code === 'android_missing_content_blobs') {
    return {
      description: 'Topics can open now; uncached bodies load as needed.',
      title: 'Topic bodies are still caching'
    };
  }
  if (verdict.code === 'sync_android_attachment_cache_backlog' || verdict.code === 'android_missing_attachment_resources') {
    return {
      description: 'Attachment files continue caching during sync.',
      title: 'Attachment files are still caching'
    };
  }
  if (verdict.code === 'android_has_local_dirty_state') {
    return {
      description: 'They will be sent to desktop during sync.',
      title: 'Device changes are waiting to send'
    };
  }
  if (verdict.code === 'android_has_pending_push_ack') {
    return {
      description: 'A later structure pack must confirm these changes before they are marked clean.',
      title: 'Desktop accepted changes; waiting for confirmation'
    };
  }
  if (verdict.code === 'desktop_ready') {
    return {
      description: 'Desktop sync is reachable from this device.',
      title: 'Desktop connection is ready'
    };
  }
  if (verdict.code === 'sync_structure_aligned') {
    return {
      description: 'The Topic list matches the desktop state.',
      title: 'Topic list is up to date'
    };
  }
  return { description: null, title: verdict.message };
}

function formatNumber(value: number | null | undefined) {
  return typeof value === 'number' ? `${value}` : 'None';
}

function formatBytes(value: number | null | undefined) {
  if (typeof value !== 'number') {
    return 'None';
  }
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (value >= 1024) {
    return `${Math.round(value / 1024)} KB`;
  }
  return `${value} B`;
}

function SnapshotMetrics(props: { snapshot: SyncDiagnosticSnapshot }) {
  const snapshot = props.snapshot;
  const isAndroid = snapshot.host === 'android';
  return (
    <div className="border-t border-companion-divider">
      <MetricRow label="Connection" value={snapshot.connection.state} />
      <MetricRow label="Topics" value={formatNumber(snapshot.storage.active_node_count)} />
      <MetricRow label={isAndroid ? 'Device changes' : 'Desktop changes'} value={formatNumber(snapshot.sync_state.max_state_seq)} />
      {isAndroid ? <MetricRow label="Last desktop sync" value={formatNumber(snapshot.sync_state.pack_cursor)} /> : null}
      {isAndroid ? <MetricRow label="Waiting for confirmation" value={formatNumber(snapshot.sync_state.pending_ack_count)} /> : null}
      <MetricRow label="Bodies still caching" value={formatNumber(snapshot.content.missing_content_blob_count)} />
      {isAndroid ? <MetricRow label="Body bytes still caching" value={formatBytes(snapshot.content.missing_content_blob_bytes ?? 0)} /> : null}
      {isAndroid ? <MetricRow label="Topic bodies" value={formatNumber(snapshot.content.missing_topic_body_count ?? 0)} /> : null}
      {isAndroid ? <MetricRow label="External document bodies" value={formatNumber(snapshot.content.missing_external_document_body_count ?? 0)} /> : null}
      <MetricRow label="Attachments still caching" value={formatNumber(snapshot.content.missing_attachment_resource_count ?? 0)} />
      {isAndroid ? <MetricRow label="Attachment bytes still caching" value={formatBytes(snapshot.content.missing_attachment_resource_bytes ?? 0)} /> : null}
    </div>
  );
}

function MetricRow(props: { label: string; value: string; wrap?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b border-companion-divider py-3 text-sm last:border-b-0">
      <span className="shrink-0 text-companion-text-secondary">{props.label}</span>
      <span className={`text-right font-medium text-foreground ${props.wrap ? 'min-w-0 break-words' : 'max-w-48 truncate'}`}>
        {props.value}
      </span>
    </div>
  );
}

function VerdictList(props: { verdicts: SyncDiagnosticVerdict[] }) {
  if (props.verdicts.length === 0) {
    return <p className="py-4 text-sm text-companion-text-secondary">No diagnostic verdicts yet.</p>;
  }
  return (
    <div className="border-t border-companion-divider">
      {props.verdicts.map((verdict, index) => (
        <div className="border-b border-companion-divider py-3 last:border-b-0" key={`${verdict.code}-${index}`}>
          <div className={`text-sm font-medium ${severityClass(verdict.severity)}`}>{friendlyVerdict(verdict).title}</div>
          {friendlyVerdict(verdict).description ? (
            <div className="mt-1 text-xs leading-5 text-companion-text-secondary">{friendlyVerdict(verdict).description}</div>
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
            </>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-sm leading-6 text-companion-text-secondary">{props.empty}</p>
      )}
    </section>
  );
}

function buildSummary(result: CombinedSyncDiagnosticResult) {
  return JSON.stringify({
    android: result.android,
    desktop: result.desktop,
    verdicts: result.verdicts
  }, null, 2);
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
    await navigator.clipboard.writeText(buildSummary(result));
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
