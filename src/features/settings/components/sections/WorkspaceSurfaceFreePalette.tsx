import { ClipboardPaste, RotateCcw } from 'lucide-react';
import { type ReactNode } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import type { TranslationKey } from '../../../../shared/localization/translations';
import { useActionHelpCardsEnabled } from '../../../../shared/platform/actionHelpCards';
import {
  ActionHelpCard,
  type ActionHelpCardCopy,
  settingsUtilityIconButtonClassName
} from '../../../../shared/ui';
import { parseWorkspaceSurfacePaletteText } from '../../model/workspaceSurfacePaletteText';
import { type WorkspaceSurfaceAssignments } from '../../model/workspaceSurfaceSettings';

import { WorkspaceSurfaceColorPaletteStrip } from './WorkspaceSurfaceColorPaletteStrip';
import {
  openWorkspaceSurfaceColorEditor,
  resetWorkspaceSurfaceFreePalette,
  useWorkspaceSurfaceEditor
} from './WorkspaceSurfaceColorSection.logic';

type WorkspaceSurfaceFreePaletteProps = {
  editor: ReturnType<typeof useWorkspaceSurfaceEditor>;
};

function clampAssignments(assignments: WorkspaceSurfaceAssignments, maxIndex: number) {
  return Object.fromEntries(
    Object.entries(assignments).map(([regionId, index]) => [
      regionId,
      Math.min(index, maxIndex)
    ])
  ) as WorkspaceSurfaceAssignments;
}

async function readPaletteClipboardText() {
  if (!navigator.clipboard?.readText) {
    return null;
  }
  try {
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}

function PaletteActionHelp(props: { children: ReactNode; help: ActionHelpCardCopy; showHelp: boolean }) {
  return props.showHelp ? <ActionHelpCard help={props.help}>{props.children}</ActionHelpCard> : props.children;
}

type Translate = (key: TranslationKey) => string;

function buildFreePaletteHelp(t: Translate) {
  return {
    paste: {
      body: t('settings.appearance.surface.freePalette.pasteHelp.body'),
      detail: t('settings.appearance.surface.freePalette.pasteHelp.detail'),
      title: t('settings.appearance.surface.freePalette.paste')
    },
    reset: {
      body: t('settings.appearance.surface.freePalette.resetHelp.body'),
      title: t('settings.appearance.surface.freePalette.reset')
    }
  } satisfies Record<string, ActionHelpCardCopy>;
}

async function pasteWorkspaceSurfacePalette(editor: WorkspaceSurfaceFreePaletteProps['editor']) {
  const text = await readPaletteClipboardText();
  const palette = text ? parseWorkspaceSurfacePaletteText(text) : null;
  if (!palette) {
    return;
  }
  editor.setGeneratedMode('manual');
  editor.appearance.setWorkspaceSurfacePalette(palette);
  editor.appearance.setWorkspaceSurfaceAssignments(
    clampAssignments(editor.appearance.workspaceSurfaceAssignments, palette.length - 1)
  );
  editor.setActiveBrushIndex(Math.min(editor.activeBrushIndex, palette.length - 1));
}

function addWorkspaceSurfacePaletteColor(editor: WorkspaceSurfaceFreePaletteProps['editor']) {
  const fallbackColor = editor.appearance.workspaceSurfacePalette[editor.activeBrushIndex] ?? '#d8d8d8';
  editor.setGeneratedMode('manual');
  editor.appearance.setWorkspaceSurfacePalette([...editor.appearance.workspaceSurfacePalette, fallbackColor]);
  editor.setActiveBrushIndex(editor.appearance.workspaceSurfacePalette.length);
}

export function WorkspaceSurfaceFreePalette(props: WorkspaceSurfaceFreePaletteProps) {
  const t = useTranslation();
  const showHelp = useActionHelpCardsEnabled();
  const freePaletteHelp = buildFreePaletteHelp(t);

  return (
    <div className="space-y-2">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-medium text-foreground">{t('settings.appearance.surface.freePalette.title')}</h4>
          <PaletteActionHelp help={freePaletteHelp.paste} showHelp={showHelp}>
            <button
              aria-label={t('settings.appearance.surface.freePalette.paste')}
              className={settingsUtilityIconButtonClassName(false, 'size-8 rounded-sm px-0')}
              onClick={() => void pasteWorkspaceSurfacePalette(props.editor)}
              type="button"
            >
              <ClipboardPaste aria-hidden="true" className="text-current" size={18} strokeWidth={1.9} />
            </button>
          </PaletteActionHelp>
          <PaletteActionHelp help={freePaletteHelp.reset} showHelp={showHelp}>
            <button
              aria-label={t('settings.appearance.surface.freePalette.reset')}
              className={settingsUtilityIconButtonClassName(false, 'size-8 rounded-sm px-0')}
              onClick={() => resetWorkspaceSurfaceFreePalette(props.editor)}
              type="button"
            >
              <RotateCcw aria-hidden="true" className="text-current" size={18} strokeWidth={1.9} />
            </button>
          </PaletteActionHelp>
        </div>
        <p className="text-xs text-foreground/58">{t('settings.appearance.surface.freePalette.description')}</p>
      </div>
      <WorkspaceSurfaceColorPaletteStrip
        activeBrushIndex={props.editor.activeBrushIndex}
        colors={props.editor.appearance.workspaceSurfacePalette}
        onAddPaletteColor={() => addWorkspaceSurfacePaletteColor(props.editor)}
        onEditColor={(event, index) => openWorkspaceSurfaceColorEditor(props.editor, event, index)}
        onSelectColor={(index) => props.editor.setActiveBrushIndex(index)}
      />
    </div>
  );
}
