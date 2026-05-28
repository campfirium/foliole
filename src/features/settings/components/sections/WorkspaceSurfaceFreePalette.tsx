import { ClipboardPaste, RotateCcw } from 'lucide-react';
import { type ReactNode } from 'react';

import { useMenuHelpTooltipsEnabled } from '../../../../shared/platform/menuHelpTooltips';
import {
  MenuHelpTooltip,
  type MenuHelpTooltipCopy,
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

const FREE_PALETTE_HELP = {
  paste: {
    body: 'Paste five comma-separated hex colors into the free palette.',
    detail: 'Example: #ffffff, #fcfcfc, #f6f6f6, #f5f5f3, #ececea',
    title: 'Paste free palette'
  },
  reset: {
    body: 'Keep the first five free palette colors and move any extra assignments back into those slots.',
    title: 'Reset free palette'
  }
} satisfies Record<string, MenuHelpTooltipCopy>;

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

function PaletteActionHelp(props: { children: ReactNode; help: MenuHelpTooltipCopy; showHelp: boolean }) {
  return props.showHelp ? <MenuHelpTooltip help={props.help}>{props.children}</MenuHelpTooltip> : props.children;
}

export function WorkspaceSurfaceFreePalette(props: WorkspaceSurfaceFreePaletteProps) {
  const showHelp = useMenuHelpTooltipsEnabled();
  const pastePalette = async () => {
    const text = await readPaletteClipboardText();
    const palette = text ? parseWorkspaceSurfacePaletteText(text) : null;
    if (!palette) {
      return;
    }
    props.editor.setGeneratedMode('manual');
    props.editor.appearance.setWorkspaceSurfacePalette(palette);
    props.editor.appearance.setWorkspaceSurfaceAssignments(
      clampAssignments(props.editor.appearance.workspaceSurfaceAssignments, palette.length - 1)
    );
    props.editor.setActiveBrushIndex(Math.min(props.editor.activeBrushIndex, palette.length - 1));
  };

  return (
    <div className="space-y-2">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-medium text-foreground">Free palette</h4>
          <PaletteActionHelp help={FREE_PALETTE_HELP.paste} showHelp={showHelp}>
            <button
              aria-label="Paste free palette"
              className={settingsUtilityIconButtonClassName(false, 'size-8 rounded-sm px-0')}
              onClick={() => void pastePalette()}
              type="button"
            >
              <ClipboardPaste aria-hidden="true" className="text-current" size={18} strokeWidth={1.9} />
            </button>
          </PaletteActionHelp>
          <PaletteActionHelp help={FREE_PALETTE_HELP.reset} showHelp={showHelp}>
            <button
              aria-label="Reset free palette"
              className={settingsUtilityIconButtonClassName(false, 'size-8 rounded-sm px-0')}
              onClick={() => resetWorkspaceSurfaceFreePalette(props.editor)}
              type="button"
            >
              <RotateCcw aria-hidden="true" className="text-current" size={18} strokeWidth={1.9} />
            </button>
          </PaletteActionHelp>
        </div>
        <p className="text-xs text-foreground/58">Manual mode: pick a swatch, then paint the preview.</p>
      </div>
      <WorkspaceSurfaceColorPaletteStrip
        activeBrushIndex={props.editor.activeBrushIndex}
        colors={props.editor.appearance.workspaceSurfacePalette}
        onAddPaletteColor={() => {
          const fallbackColor = props.editor.appearance.workspaceSurfacePalette[props.editor.activeBrushIndex] ?? '#d8d8d8';
          props.editor.setGeneratedMode('manual');
          props.editor.appearance.setWorkspaceSurfacePalette([...props.editor.appearance.workspaceSurfacePalette, fallbackColor]);
          props.editor.setActiveBrushIndex(props.editor.appearance.workspaceSurfacePalette.length);
        }}
        onEditColor={(event, index) => openWorkspaceSurfaceColorEditor(props.editor, event, index)}
        onSelectColor={(index) => props.editor.setActiveBrushIndex(index)}
      />
    </div>
  );
}
