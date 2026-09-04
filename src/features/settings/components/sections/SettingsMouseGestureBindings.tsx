import { RotateCcw, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import { usePublicCommands } from '../../../../shared/commands/publicCommandContext';
import type { CommandPaletteItem } from '../../../../shared/commands/types';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import type { TranslationKey } from '../../../../shared/localization/translations';
import {
  requestAppConfirmation,
  SettingsEmptyState,
  SettingsSection,
  settingsFieldClassName,
  settingsResetButtonClassName
} from '../../../../shared/ui';
import type {
  EditorMouseGestureBinding,
  EditorMouseGestureDirection
} from '../../../editor/model/editorMouseGestures';
import { hasCustomEditorMouseGestureBindings } from '../../../editor/model/editorMouseGestureSettings';
import { useMouseGestureSettings } from '../../context/MouseGestureSettingsProvider';

import { MouseGestureCommandPicker } from './MouseGestureCommandPicker';
import { MouseGestureGlyph } from './MouseGestureGlyph';
import { MouseGestureRecordingRow } from './MouseGestureRecordingRow';
import { useMouseGestureRecorder } from './useMouseGestureRecorder';

import { cn } from '@/shared/lib/utils';

const DIRECTION_KEYS: Record<EditorMouseGestureDirection, TranslationKey> = {
  down: 'settings.mouseGestures.direction.down',
  left: 'settings.mouseGestures.direction.left',
  right: 'settings.mouseGestures.direction.right',
  up: 'settings.mouseGestures.direction.up'
};

function matchesCommand(item: CommandPaletteItem, query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  return (
    !normalized ||
    [item.title, item.section, ...(item.keywords ?? [])].some((value) =>
      value?.toLocaleLowerCase().includes(normalized)
    )
  );
}

function GestureBindingRow(props: {
  binding: EditorMouseGestureBinding;
  commands: CommandPaletteItem[];
  index: number;
  open: boolean;
  onChange: (commandId: string | null) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslation();
  const label = props.binding.directions
    .map((direction) => t(DIRECTION_KEYS[direction]))
    .join(' → ');
  return (
    <div className={bindingCellClassName(props.index)} data-mouse-gesture-binding={props.binding.gesture}>
      <MouseGestureGlyph directions={props.binding.directions} label={label} />
      <MouseGestureCommandPicker
        commandId={props.binding.commandId}
        commands={props.commands}
        gestureLabel={label}
        open={props.open}
        onChange={props.onChange}
        onOpenChange={props.onOpenChange}
      />
    </div>
  );
}

function bindingCellClassName(index: number) {
  return cn(
    'grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 px-5 py-3',
    index > 0 && 'border-t border-settings-divider/55',
    index < 2 && 'lg:border-t-0',
    index >= 2 && 'lg:border-t lg:border-settings-divider/55',
    index % 2 === 0 && 'lg:border-r lg:border-settings-divider/55'
  );
}

function AddGestureRow(props: { command: CommandPaletteItem; index: number; onStart: () => void }) {
  const t = useTranslation();
  return (
    <div className={bindingCellClassName(props.index)}>
      <button
        aria-label={t('settings.mouseGestures.record.add', { command: props.command.title })}
        className="justify-self-start"
        onClick={props.onStart}
        type="button"
      >
        <MouseGestureGlyph
          add
          label={t('settings.mouseGestures.record.add', { command: props.command.title })}
        />
      </button>
      <div className="min-w-0">
        <div className="truncate text-ui-md text-foreground">{props.command.title}</div>
        {props.command.section ? (
          <div className="text-ui-sm text-muted-foreground">{props.command.section}</div>
        ) : null}
      </div>
    </div>
  );
}

function useMouseGestureBindingView() {
  const commands = usePublicCommands().items;
  const gestureSettings = useMouseGestureSettings();
  const [query, setQuery] = useState('');
  const [openGestureId, setOpenGestureId] = useState<string | null>(null);
  const recorder = useMouseGestureRecorder({
    bindings: gestureSettings.bindings,
    onSave: gestureSettings.addCustomGesture,
    threshold: gestureSettings.settings.segmentThresholdPx
  });
  const matches = useMemo(
    () => commands.filter((item) => matchesCommand(item, query)),
    [commands, query]
  );
  const rows = useMemo(() => {
    if (!query.trim()) return gestureSettings.bindings;
    const ids = new Set(matches.map((item) => item.id));
    return gestureSettings.bindings.filter(
      (binding) => binding.commandId && ids.has(binding.commandId)
    );
  }, [gestureSettings.bindings, matches, query]);
  const unboundMatches = query.trim()
    ? matches.filter(
        (command) =>
          command.id !== recorder.commandId &&
          !gestureSettings.bindings.some((binding) => binding.commandId === command.id)
      )
    : [];
  const recordingCommand = commands.find((command) => command.id === recorder.commandId);
  return { commands, gestureSettings, openGestureId, query, recorder, recordingCommand, rows, setOpenGestureId, setQuery, unboundMatches };
}

function BindingResetButton(props: {
  bindings: EditorMouseGestureBinding[];
  onReset: () => void;
}) {
  const t = useTranslation();
  return (
    <button
      aria-label={t('settings.mouseGestures.bindings.reset')}
      className={settingsResetButtonClassName()}
      disabled={!hasCustomEditorMouseGestureBindings(props.bindings)}
      onClick={props.onReset}
      type="button"
    >
      <RotateCcw aria-hidden="true" size={17} />
    </button>
  );
}

async function confirmBindingReset(
  resetBindings: () => void,
  labels: { cancel: string; confirm: string; description: string; title: string }
) {
  const confirmed = await requestAppConfirmation({
    cancelLabel: labels.cancel,
    confirmLabel: labels.confirm,
    description: [labels.description],
    title: labels.title
  });
  if (confirmed) resetBindings();
}

function BindingRows(props: {
  commands: CommandPaletteItem[];
  gestureSettings: ReturnType<typeof useMouseGestureSettings>;
  query: string;
  recorder: ReturnType<typeof useMouseGestureRecorder>;
  recordingCommand: CommandPaletteItem | undefined;
  rows: EditorMouseGestureBinding[];
  openGestureId: string | null;
  setOpenGestureId: (gestureId: string | null) => void;
  unboundMatches: CommandPaletteItem[];
}) {
  const t = useTranslation();
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2" data-mouse-gesture-binding-grid="true">
      {props.recordingCommand ? (
        <div className="lg:col-span-2"><MouseGestureRecordingRow command={props.recordingCommand} directions={props.recorder.directions} error={props.recorder.error} onCancel={props.recorder.cancel} onMouseDown={props.recorder.beginDrawing} onSave={props.recorder.save} /></div>
      ) : null}
      {props.rows.map((binding, index) => (
        <GestureBindingRow binding={binding} commands={props.commands} index={index} key={binding.gesture} open={props.openGestureId === binding.gesture} onChange={(commandId) => props.gestureSettings.setBinding(binding.gesture, commandId)} onOpenChange={(open) => props.setOpenGestureId(open ? binding.gesture : null)} />
      ))}
      {props.unboundMatches.map((command, index) => (
        <AddGestureRow command={command} index={props.rows.length + index} key={command.id} onStart={() => props.recorder.start(command.id)} />
      ))}
      {props.query.trim() && !props.rows.length && !props.unboundMatches.length ? (
        <div className="lg:col-span-2"><SettingsEmptyState description="" title={t('settings.mouseGestures.bindings.noResults')} /></div>
      ) : null}
    </div>
  );
}

export function SettingsMouseGestureBindings() {
  const t = useTranslation();
  const view = useMouseGestureBindingView();
  const reset = () => {
    void confirmBindingReset(view.gestureSettings.resetBindings, {
      cancel: t('settings.mouseGestures.record.cancel'),
      confirm: t('settings.mouseGestures.bindings.reset'),
      description: t('settings.mouseGestures.bindings.resetDescription'),
      title: t('settings.mouseGestures.bindings.resetTitle')
    });
  };
  return (
    <SettingsSection
      actions={
        <label className="relative block w-64">
          <Search aria-hidden="true" className="absolute left-2.5 top-2.5 text-muted-foreground" size={16} />
          <input aria-label={t('settings.mouseGestures.bindings.search')} className={settingsFieldClassName('pl-8')} onChange={(event) => { view.setOpenGestureId(null); view.setQuery(event.target.value); }} placeholder={t('settings.mouseGestures.bindings.search')} value={view.query} />
        </label>
      }
      ariaLabel={t('settings.mouseGestures.bindings.sectionAria')}
      title={t('settings.mouseGestures.bindings.title')}
      titleActions={<BindingResetButton bindings={view.gestureSettings.bindings} onReset={reset} />}
    >
      <BindingRows {...view} />
    </SettingsSection>
  );
}
