import { useState } from 'react';

import type {
  SyncDiagnosticSeverity,
  SyncDiagnosticSnapshot,
  SyncDiagnosticVerdict
} from '../../lib/platform/syncDiagnosticsContract';
import {
  runCombinedSyncDiagnostics,
  type CombinedSyncDiagnosticResult
} from '../shared/platform/companionSyncDiagnostics';

import { CompanionSyncDiagnosticCheckpoint } from './CompanionSyncDiagnosticCheckpoint';

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
  if (verdict.code === 'android_has_local_dirty_state') {
    return {
      description: 'They will be sent to desktop during sync.',
      title: 'Device changes are waiting to send'
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

function SnapshotMetrics(props: { snapshot: SyncDiagnosticSnapshot }) {
  const snapshot = props.snapshot;
  const isAndroid = snapshot.host === 'android';
  return (
    <div className="border-t border-companion-divider">
      <MetricRow label="Connection" value={snapshot.connection.state} />
      <MetricRow label="Topics" value={formatNumber(snapshot.storage.active_node_count)} />
      <MetricRow label={isAndroid ? 'Device changes' : 'Desktop changes'} value={formatNumber(snapshot.sync_state.max_state_seq)} />
      {isAndroid ? <MetricRow label="Last desktop sync" value={formatNumber(snapshot.sync_state.pack_cursor)} /> : null}
      <MetricRow label="Bodies still caching" value={formatNumber(snapshot.content.missing_content_blob_count)} />
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
  return (
    <section>
      <h3 className="text-sm font-semibold text-foreground">{props.title}</h3>
      {props.snapshot ? (
        <SnapshotMetrics snapshot={props.snapshot} />
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

export function CompanionSyncDiagnosticsPanel(props: { endpointUrl: string | null }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CombinedSyncDiagnosticResult | null>(null);
  const [status, setStatus] = useState<'idle' | 'running'>('idle');

  async function runDiagnostic() {
    setCopied(false);
    setError(null);
    setStatus('running');
    try {
      setResult(await runCombinedSyncDiagnostics(props.endpointUrl));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Sync diagnostic failed.');
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
      <button
        className="w-full rounded-companion border border-border-strong bg-foreground px-4 py-3 text-sm font-semibold text-bg-panel disabled:opacity-45"
        disabled={status === 'running'}
        onClick={() => void runDiagnostic()}
        type="button"
      >
        {status === 'running' ? 'Running...' : 'Run sync diagnostic'}
      </button>
      {error ? <p className="text-sm leading-6 text-error">{error}</p> : null}
      {result ? (
        <>
          <CompanionSyncDiagnosticCheckpoint result={result} />
          <section>
            <h3 className="text-sm font-semibold text-foreground">What this means</h3>
            <VerdictList verdicts={result.verdicts} />
          </section>
          <SnapshotSection empty="Android diagnostics are only available in the native app." snapshot={result.android} title="Android" />
          <SnapshotSection empty="Desktop diagnostics need a paired desktop address." snapshot={result.desktop} title="Desktop" />
          <button
            className="w-full rounded-companion border border-border px-4 py-3 text-sm font-medium text-foreground"
            onClick={() => void copySummary()}
            type="button"
          >
            {copied ? 'Copied' : 'Copy diagnostic summary'}
          </button>
        </>
      ) : null}
    </section>
  );
}
