import { useEffect, useState, type MutableRefObject } from 'react';

import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import type { EditorAdapter } from '../adapters/EditorAdapter';
import { cleanFormatting } from '../model/formatCleanup';
import { createDefaultFormatCleanupSettings, createEmptyCustomCleanupRule } from '../model/formatCleanupDefaults';
import { subscribeFormatCleanupRequests } from '../model/formatCleanupRequests';
import { hasSavedFormatCleanupSettings, loadFormatCleanupSettings, saveFormatCleanupSettings } from '../model/formatCleanupSettings';
import type { FormatCleanupSettings } from '../model/formatCleanupTypes';

import { FormatCleanupDialogSurface } from './FormatCleanupDialogSurface';

function withVisibleCustomRow(settings: FormatCleanupSettings) {
  return settings.customRules.length > 0
    ? settings
    : { ...settings, customRules: [createEmptyCustomCleanupRule(crypto.randomUUID())] };
}

export function FormatCleanupDialogHost(props: {
  canClean: boolean;
  editorRef: MutableRefObject<EditorAdapter | null>;
}) {
  const t = useTranslation();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [settings, setSettings] = useState(() => withVisibleCustomRow(loadFormatCleanupSettings()));

  const updateSettings = (next: FormatCleanupSettings) => {
    setSettings(next);
    saveFormatCleanupSettings(next);
    if (preview !== null) setPreview(cleanFormatting(props.editorRef.current?.getContent() ?? '', next));
  };
  const openSettings = () => {
    const next = withVisibleCustomRow(loadFormatCleanupSettings());
    setSettings(next);
    saveFormatCleanupSettings(next);
    setPreview(null);
    setOpen(true);
  };
  const cleanCurrentTopic = (currentSettings = settings) => {
    const editor = props.editorRef.current;
    if (!props.canClean || !editor) return false;
    const before = editor.getContent();
    const after = cleanFormatting(before, currentSettings);
    if (after !== before) editor.replaceRange(0, before.length, after, { userEvent: 'input.format-cleanup' });
    return true;
  };

  useEffect(() => subscribeFormatCleanupRequests((request) => {
    if (request === 'configure' || !hasSavedFormatCleanupSettings()) {
      openSettings();
      return;
    }
    cleanCurrentTopic(loadFormatCleanupSettings());
  }));

  return (
    <FormatCleanupDialogSurface
      canClean={props.canClean}
      onChange={updateSettings}
      onClean={() => { if (cleanCurrentTopic()) setOpen(false); }}
      onOpenChange={setOpen}
      onPreview={() => setPreview(cleanFormatting(props.editorRef.current?.getContent() ?? '', settings))}
      onReset={() => updateSettings(withVisibleCustomRow(createDefaultFormatCleanupSettings()))}
      open={open}
      preview={preview}
      settings={settings}
      t={t}
    />
  );
}
