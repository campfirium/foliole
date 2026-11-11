import { useState, type FormEvent } from 'react';

import { DEFAULT_WEB_DAV_ATTACHMENT_POLICY, MAX_WEB_DAV_ATTACHMENT_MIB, sameWebDavAttachmentPolicy,
  webDavAttachmentPolicySchema, type WebDavAttachmentPolicy } from '../../../../../lib/platform/webDavRelayContract';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { saveDesktopWebDavAttachmentPolicy } from '../../../../shared/platform/desktopSyncGroupRuntimeRepository';
import { AppInput, SettingsButton, SettingsControlSlot, SettingsRow, SettingsSegmentedControl } from '../../../../shared/ui';

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
  const draft = webDavAttachmentPolicySchema.safeParse({ mode, max_mib: Number(size) }).data;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || busy || sameWebDavAttachmentPolicy(draft, saved)) return;
    setBusy(true);
    setFailed(false);
    try {
      const result = await saveDesktopWebDavAttachmentPolicy(groupId, draft);
      if (!result) throw new Error('webdav_relay_host_unavailable');
      setSaved(result);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return <SettingsRow title={t(`${PREFIX}.attachments`)} description={t(`${PREFIX}.attachmentsHint`)}>
    <SettingsControlSlot>
      <form onSubmit={event => void save(event)} className="flex flex-wrap items-center gap-2">
        <SettingsSegmentedControl ariaLabel={t(`${PREFIX}.attachments`)} disabled={busy} value={mode} onChange={setMode}
          options={(Object.keys(modes) as WebDavAttachmentPolicy['mode'][]).map(value => ({ value, label: t(`${PREFIX}.${modes[value]}`) }))} />
        {mode === 'limited' ? <label className="flex items-center gap-2">
          <AppInput aria-label={t(`${PREFIX}.attachmentsMaxSize`)} className="w-24" value={size}
            type="number" required min={1} max={MAX_WEB_DAV_ATTACHMENT_MIB}
            disabled={busy} onChange={event => setSize(event.target.value)} />
          <span className="text-ui-sm text-muted-foreground">MiB</span>
        </label> : null}
        <SettingsButton type="submit" disabled={busy || !draft || sameWebDavAttachmentPolicy(draft, saved)}>
          {t(`${PREFIX}.attachmentsSave`)}
        </SettingsButton>
        {failed ? <span role="alert">{t(`${PREFIX}.attachmentsSaveFailed`)}</span> : null}
      </form>
    </SettingsControlSlot>
  </SettingsRow>;
}
