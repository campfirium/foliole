import { useState } from 'react';

import type { DesktopSyncDiagnosticsPayload } from '../../../../../lib/platform/desktopSyncDiagnosticsContract';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { loadDesktopSyncDiagnostics } from '../../../../shared/platform/desktop/desktopSyncDiagnosticsRuntime';
import {
  AppButton, AppDialog, AppDialogActions, AppDialogBody, AppDialogContent,
  AppDialogDescription, AppDialogTitle, AppSpinner,
  SettingsButton, SettingsControlSlot, SettingsErrorState, SettingsRow
} from '../../../../shared/ui';

import { DesktopSyncActivityList } from './DesktopSyncActivityList';

const PREFIX = 'settings.companionSync.diagnostics' as const;
const ISSUE_KEYS = {
  desktop_sync_server_not_running: `${PREFIX}.issue.desktop_sync_server_not_running`,
  desktop_has_nodes_missing_state_rows: `${PREFIX}.issue.desktop_has_nodes_missing_state_rows`,
  desktop_has_nodes_missing_versions: `${PREFIX}.issue.desktop_has_nodes_missing_versions`,
  desktop_has_node_blob_references_missing_rows: `${PREFIX}.issue.desktop_has_node_blob_references_missing_rows`,
  desktop_no_state_rows: `${PREFIX}.issue.desktop_no_state_rows`
} as const;

function SnapshotStatus({ result }: { result: DesktopSyncDiagnosticsPayload }) {
  const t = useTranslation();
  const overview = result.overview;
  const state = !overview.sync_enabled ? 'off' : overview.sync_paused ? 'paused' : result.active_run ? 'running' : 'idle';
  return <section className="space-y-3">
    <SettingsRow title={t(`${PREFIX}.current`)} description={t(`${PREFIX}.state.${state}`)} />
    {overview.sync_enabled && !overview.sync_paused ? <SettingsRow title={t(`${PREFIX}.connection`)}
      description={t(`settings.companionSync.group.topology.${overview.server_status.topology_status === 'ready'
        ? overview.server_status.topology_role : overview.server_status.topology_status}`)} /> : null}
    {overview.discovery_error ? <SettingsErrorState title={t(`${PREFIX}.discoveryIssue`)}
      description={t(`settings.companionSync.group.discovery.active_${overview.discovery_error}`)} /> : null}
    {overview.server_status.last_error ? <SettingsErrorState title={t(`${PREFIX}.failed`)}
      description={overview.server_status.last_error} /> : null}
    {result.snapshot.verdicts.filter((verdict) => verdict.severity !== 'ok').map((verdict) => (
      <SettingsErrorState key={verdict.code} title={t(`${PREFIX}.issue`)}
        description={verdict.code in ISSUE_KEYS ? t(ISSUE_KEYS[verdict.code as keyof typeof ISSUE_KEYS]) : verdict.message} />
    ))}
    <p className="text-ui-xs text-foreground/65">{t(`${PREFIX}.collected`, {
      time: new Date(result.snapshot.collected_at).toLocaleString()
    })}</p>
  </section>;
}

export function SettingsSyncDiagnosticsRow({ disabled }: { disabled: boolean }) {
  const t = useTranslation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DesktopSyncDiagnosticsPayload | null>(null);
  async function refresh() {
    setBusy(true); setCopied(false); setError(null);
    try { setResult(await loadDesktopSyncDiagnostics()); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(false); }
  }
  async function copy() {
    if (!result) return;
    try { await navigator.clipboard.writeText(result.report_text); setCopied(true); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
  }
  return <>
    <SettingsRow title={t(`${PREFIX}.title`)} description={t(`${PREFIX}.description`)}>
      <SettingsControlSlot>
        <SettingsButton disabled={disabled} onClick={() => { setOpen(true); void refresh(); }}>
          {t(`${PREFIX}.open`)}
        </SettingsButton>
      </SettingsControlSlot>
    </SettingsRow>
    <AppDialog open={open} onOpenChange={setOpen}>
      <AppDialogContent layout="task" className="max-h-[85vh] w-[min(48rem,calc(100vw-2rem))]">
        <AppDialogTitle>{t(`${PREFIX}.title`)}</AppDialogTitle>
        <AppDialogBody className="app-scrollbar space-y-6 overflow-y-auto">
          <AppDialogDescription>{t(`${PREFIX}.description`)}</AppDialogDescription>
          {busy ? <AppSpinner aria-label={t('companion.sync.diagnostics.running')} /> : null}
          {error ? <SettingsErrorState title={t(`${PREFIX}.failed`)} description={error} /> : null}
          {result ? <>
            <SnapshotStatus result={result} />
            <section aria-label={t(`${PREFIX}.history`)}>
              <h3 className="text-ui-md font-semibold">{t(`${PREFIX}.history`)}</h3>
              <p className="mt-1 text-ui-xs text-foreground/65">{t(`${PREFIX}.retention`)}</p>
              <DesktopSyncActivityList activeIds={result.active_run_ids} events={result.activity} />
            </section>
          </> : null}
        </AppDialogBody>
        <AppDialogActions>
          <AppButton disabled={busy} onClick={() => void refresh()}>{t(`${PREFIX}.refresh`)}</AppButton>
          <AppButton disabled={!result || busy} onClick={() => void copy()}>
            {t(copied ? 'companion.sync.diagnostics.copied' : `${PREFIX}.copy`)}
          </AppButton>
          <AppButton onClick={() => setOpen(false)}>{t(`${PREFIX}.close`)}</AppButton>
        </AppDialogActions>
      </AppDialogContent>
    </AppDialog>
  </>;
}
