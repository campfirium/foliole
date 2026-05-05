import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';

import { useAppearanceSettings } from '../../context/AppearanceSettingsProvider';
import {
  applyWorkspaceSurfaceAutoPalette,
  buildWorkspaceSurfaceAutoAssignments,
  buildWorkspaceSurfaceAutoColumnPalette,
  type WorkspaceSurfaceAutoPaletteOptions
} from '../../model/workspaceSurfaceAutoPalette';
import { createRandomWorkspaceSurfacePalettes as buildRandomWorkspaceSurfacePalettes } from '../../model/workspaceSurfaceAutoPaletteChoices';
import {
  type WorkspaceSurfaceColorValue
} from '../../model/workspaceSurfaceColor';
import { parseWorkspaceSurfaceColor } from '../../model/workspaceSurfaceColor';
import {
  DEFAULT_WORKSPACE_SURFACE_AUTO_SEED,
  getWorkspaceSurfaceAutoOptions,
  getWorkspaceSurfaceAutoSeed,
  getWorkspaceSurfaceGeneratorMode,
  setWorkspaceSurfaceAutoOptions,
  setWorkspaceSurfaceAutoSeed,
  setWorkspaceSurfaceGeneratorMode,
  type WorkspaceSurfaceGeneratorMode
} from '../../model/workspaceSurfaceGeneratorSettings';
import { type WorkspaceSurfaceRegionId } from '../../model/workspaceSurfaceSettings';

function clampBrushIndex(value: number, paletteLength: number) {
  return Math.min(Math.max(value, 0), Math.max(paletteLength - 1, 0));
}

export function useWorkspaceSurfaceEditor(
  appearance: ReturnType<typeof useAppearanceSettings>
) {
  const [activeBrushIndex, setActiveBrushIndex] = useState(0);
  const [autoSeedColor, setAutoSeedColor] = useState<WorkspaceSurfaceColorValue>(() => getWorkspaceSurfaceAutoSeed(appearance.workspaceSurfacePalette[0]));
  const [autoOptions, setAutoOptions] = useState<WorkspaceSurfaceAutoPaletteOptions>(() => getWorkspaceSurfaceAutoOptions());
  const [generatedMode, setGeneratedMode] = useState<WorkspaceSurfaceGeneratorMode>(() => getWorkspaceSurfaceGeneratorMode());
  const [randomPalettes, setRandomPalettes] = useState<string[][]>(() => buildRandomWorkspaceSurfacePalettes(getWorkspaceSurfaceAutoOptions(), 7));
  const [editorState, setEditorState] = useState<{ bounds: { height: number; width: number }; index: number; x: number; y: number } | null>(null);
  const editorHostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setActiveBrushIndex((current) => clampBrushIndex(current, appearance.workspaceSurfacePalette.length));
  }, [appearance.workspaceSurfacePalette.length]);

  useEffect(() => {
    setWorkspaceSurfaceAutoOptions(autoOptions);
  }, [autoOptions]);

  useEffect(() => {
    setWorkspaceSurfaceAutoSeed(autoSeedColor);
  }, [autoSeedColor]);

  useEffect(() => {
    setWorkspaceSurfaceGeneratorMode(generatedMode);
  }, [generatedMode]);

  useEffect(() => {
    setRandomPalettes(
      buildRandomWorkspaceSurfacePalettes(autoOptions, 7, [appearance.workspaceSurfacePalette.slice(0, 5)])
    );
  }, [autoOptions]);

  return {
    activeBrushIndex,
    appearance,
    autoOptions,
    autoSeedColor,
    editorHostRef,
    editorState,
    generatedMode,
    randomPalettes,
    setActiveBrushIndex,
    setAutoOptions,
    setAutoSeedColor,
    setGeneratedMode,
    setRandomPalettes,
    setEditorState
  };
}

export function useWorkspaceSurfacePainting(
  paintRegion: (regionId: WorkspaceSurfaceRegionId) => void
) {
  const [isPainting, setIsPainting] = useState(false);

  useEffect(() => {
    if (!isPainting) {
      return undefined;
    }
    const stopPainting = () => setIsPainting(false);
    const handlePointerMove = (event: PointerEvent) => {
      const target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
      const regionId = target?.closest<HTMLElement>('[data-workspace-region-id]')?.dataset.workspaceRegionId as WorkspaceSurfaceRegionId | undefined;
      if (regionId) {
        paintRegion(regionId);
      }
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopPainting);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopPainting);
    };
  }, [isPainting, paintRegion]);

  return { isPainting, setIsPainting };
}

export function openWorkspaceSurfaceColorEditor(
  editor: ReturnType<typeof useWorkspaceSurfaceEditor>,
  event: ReactMouseEvent<HTMLButtonElement>,
  index: number
) {
  const hostRect = editor.editorHostRef.current?.getBoundingClientRect();
  editor.setEditorState({
    bounds: hostRect ? { height: hostRect.height, width: hostRect.width } : { height: window.innerHeight, width: window.innerWidth },
    index,
    x: hostRect ? event.clientX - hostRect.left + 12 : event.clientX,
    y: hostRect ? event.clientY - hostRect.top + 12 : event.clientY
  });
}

export function applyAutoModeToWorkspace(editor: ReturnType<typeof useWorkspaceSurfaceEditor>) {
  const nextState = {
    assignments: buildWorkspaceSurfaceAutoAssignments(),
    palette: applyWorkspaceSurfaceAutoPalette(
      editor.appearance.workspaceSurfacePalette,
      buildWorkspaceSurfaceAutoColumnPalette(editor.autoSeedColor, editor.autoOptions)
    )
  };
  editor.appearance.setWorkspaceSurfacePalette(nextState.palette);
  editor.appearance.setWorkspaceSurfaceAssignments(nextState.assignments);
  editor.setActiveBrushIndex(3);
}

export function applyGeneratedPaletteToWorkspace(
  editor: ReturnType<typeof useWorkspaceSurfaceEditor>,
  palette: string[]
) {
  editor.appearance.setWorkspaceSurfacePalette(
    applyWorkspaceSurfaceAutoPalette(editor.appearance.workspaceSurfacePalette, palette)
  );
  editor.appearance.setWorkspaceSurfaceAssignments(buildWorkspaceSurfaceAutoAssignments());
  editor.setActiveBrushIndex(3);
}

export function resetWorkspaceSurfaceToDefault(editor: ReturnType<typeof useWorkspaceSurfaceEditor>) {
  const seed = parseWorkspaceSurfaceColor(DEFAULT_WORKSPACE_SURFACE_AUTO_SEED) ?? getWorkspaceSurfaceAutoSeed(DEFAULT_WORKSPACE_SURFACE_AUTO_SEED);
  const options = {
    documentPureWhite: false,
    folderTopicSharedTone: false
  };
  editor.setGeneratedMode('automatic');
  editor.setAutoOptions(options);
  editor.setAutoSeedColor(seed);
  const palette = applyWorkspaceSurfaceAutoPalette(
    editor.appearance.workspaceSurfacePalette,
    buildWorkspaceSurfaceAutoColumnPalette(seed, options)
  );
  editor.appearance.setWorkspaceSurfacePalette(palette);
  editor.appearance.setWorkspaceSurfaceAssignments(buildWorkspaceSurfaceAutoAssignments());
  editor.setActiveBrushIndex(3);
}

export function createRandomWorkspaceSurfacePalettes(
  options: WorkspaceSurfaceAutoPaletteOptions,
  count: number,
  excludePalettes: string[][] = []
) {
  return buildRandomWorkspaceSurfacePalettes(options, count, excludePalettes);
}
