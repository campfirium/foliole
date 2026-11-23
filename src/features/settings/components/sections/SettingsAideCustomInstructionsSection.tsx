import { useEffect, useRef, useState } from 'react';

import { NATIVE_ASSISTANT_CUSTOM_INSTRUCTIONS_MAX_LENGTH } from '../../../../../lib/platform/nativeAssistantModelSettingsContract';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  loadAssistantCustomInstructions,
  saveAssistantCustomInstructions
} from '../../../../shared/platform/assistantRuntime';
import { AppTextarea } from '../../../../shared/ui';

const SAVE_DELAY_MS = 600;

function useCustomInstructionsDraft() {
  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    void loadAssistantCustomInstructions()
      .then((value) => { if (active && value) setText(value.text); })
      .catch(() => undefined)
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (pending.current !== null) void saveAssistantCustomInstructions(pending.current).catch(() => undefined);
  }, []);

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const value = pending.current;
    if (value === null) return;
    pending.current = null;
    void saveAssistantCustomInstructions(value)
      .then(() => setSaveFailed(false))
      .catch(() => setSaveFailed(true));
  };

  const change = (value: string) => {
    setText(value);
    pending.current = value;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
  };

  return { change, flush, loaded, saveFailed, text };
}

export function SettingsAideCustomInstructionsSection() {
  const t = useTranslation();
  const { change, flush, loaded, saveFailed, text } = useCustomInstructionsDraft();
  return (
    <div className="px-settings-panel-x">
      <AppTextarea
        aria-describedby="aide-custom-instructions-count"
        aria-label={t('settings.aide.instructions.section')}
        className="min-h-28"
        disabled={!loaded}
        maxLength={NATIVE_ASSISTANT_CUSTOM_INSTRUCTIONS_MAX_LENGTH}
        onBlur={flush}
        onChange={(event) => change(event.target.value)}
        placeholder={t('settings.aide.instructions.placeholder')}
        rows={4}
        value={text}
      />
      <div className="mt-1 flex items-center justify-between gap-4 text-ui-sm">
        <span className="text-destructive">{saveFailed ? t('settings.aide.instructions.saveFailed') : null}</span>
        <span className="tabular-nums text-muted-foreground" id="aide-custom-instructions-count">
          {t('settings.aide.instructions.count', {
            count: String(text.length),
            max: String(NATIVE_ASSISTANT_CUSTOM_INSTRUCTIONS_MAX_LENGTH)
          })}
        </span>
      </div>
    </div>
  );
}
