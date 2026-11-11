import { useState } from 'react';

import { DEFAULT_WEB_DAV_ATTACHMENT_POLICY, MAX_WEB_DAV_ATTACHMENT_MIB, sameWebDavAttachmentPolicy,
  webDavAttachmentPolicySchema, type WebDavAttachmentPolicy } from '../../../../../lib/platform/webDavRelayContract';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { saveDesktopWebDavAttachmentPolicy } from '../../../../shared/platform/desktopSyncGroupRuntimeRepository';
import { AppInput, SettingsControlSlot, SettingsRow, SettingsSegmentedControl } from '../../../../shared/ui';

const PREFIX = 'settings.companionSync.webdav' as const;
const modes = { off: 'attachmentsOff', unlimited: 'attachmentsUnlimited', limited: 'attachmentsLimited' } as const;

export function SettingsWebDavAttachmentRow({ groupId, policy = DEFAULT_WEB_DAV_ATTACHMENT_POLICY }: {
  groupId: string; policy?: WebDavAttachmentPolicy | undefined;
}) {
  const t = useTranslation();
  const [saved, setSaved] = useState(policy);
  const [mode, setMode] = useState<string>(policy.mode);
  const [size, setSize] = useState(policy.mode === 'limited' ? String(policy.max_mib) : '');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function save(draft: WebDavAttachmentPolicy) {
    if (busy || sameWebDavAttachmentPolicy(draft, saved)) return;
    setBusy(true);
    setFailed(false);
    try {
      const result = await saveDesktopWebDavAttachmentPolicy(groupId, draft);
      if (!result) throw new Error('webdav_relay_host_unavailable');
      setSaved(result);
      setMode(result.mode);
    } catch {
      setMode(saved.mode);
      setSize(saved.mode === 'limited' ? String(saved.max_mib) : '');
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  function commitSize() {
    if (mode !== 'limited') return;
    const draft = webDavAttachmentPolicySchema.safeParse({ mode, max_mib: Number(size) }).data;
    if (draft) void save(draft);
    else {
      setMode(saved.mode);
      setSize(saved.mode === 'limited' ? String(saved.max_mib) : '');
    }
  }

  function chooseMode(next: string) {
    if (next === 'limited') {
      if (mode !== next) setSize(saved.mode === 'limited' ? String(saved.max_mib) : '');
      setMode(next);
      setFailed(false);
    } else if (next === 'off' || next === 'unlimited') {
      setMode(next);
      void save({ mode: next });
    }
  }

  return <SettingsRow title={t(`${PREFIX}.attachments`)} description={t(`${PREFIX}.attachmentsHint`)}>
    <SettingsControlSlot>
      <div className="flex flex-wrap items-center gap-2">
        <SettingsSegmentedControl ariaLabel={t(`${PREFIX}.attachments`)} disabled={busy} value={mode} onChange={chooseMode}
          options={(Object.keys(modes) as WebDavAttachmentPolicy['mode'][]).map(value => ({ value, label: t(`${PREFIX}.${modes[value]}`) }))} />
        {mode === 'limited' ? <AttachmentLimitInput size={size} busy={busy}
          onChange={setSize} onCommit={commitSize} /> : null}
        {failed ? <span role="alert">{t(`${PREFIX}.attachmentsSaveFailed`)}</span> : null}
      </div>
    </SettingsControlSlot>
  </SettingsRow>;
}

function AttachmentLimitInput({ size, busy, onChange, onCommit }: {
  size: string; busy: boolean; onChange: (value: string) => void; onCommit: () => void;
}) {
  const t = useTranslation();
  return <label className="flex items-center gap-2">
    <AppInput aria-label={t(`${PREFIX}.attachmentsMaxSize`)} className="w-24" value={size}
      type="number" required min={1} max={MAX_WEB_DAV_ATTACHMENT_MIB}
      disabled={busy} onChange={event => onChange(event.target.value)}
      onKeyDown={event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        if (event.currentTarget.reportValidity()) onCommit();
      }}
      onBlur={event => {
        if (!event.relatedTarget?.closest('[role="radiogroup"]')) onCommit();
      }} />
    <span className="text-ui-sm text-muted-foreground">MiB</span>
  </label>;
}
