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
import {
  addWorkspaceSurfaceFavorite,
  getWorkspaceSurfaceAutoOptions,
  getWorkspaceSurfaceAutoSeed,
  getWorkspaceSurfaceFavorites,
  getWorkspaceSurfaceGeneratorMode,
  getWorkspaceSurfaceRandomHistory,
  pushWorkspaceSurfaceRandomHistoryEntry,
  removeWorkspaceSurfaceFavorite,
  setWorkspaceSurfaceAutoOptions,
  setWorkspaceSurfaceAutoSeed,
  setWorkspaceSurfaceGeneratorMode,
  type WorkspaceSurfaceGeneratorMode
} from '../../model/workspaceSurfaceGeneratorSettings';
import { type WorkspaceSurfaceAssignments, type WorkspaceSurfaceRegionId } from '../../model/workspaceSurfaceSettings';

function clampBrushIndex(value: number, paletteLength: number) {
  return Math.min(Math.max(value, 0), Math.max(paletteLength - 1, 0));
}

function getInitialWorkspaceSurfaceEditorState(
  appearance: ReturnType<typeof useAppearanceSettings>,
  mode: 'dark' | 'light'
) {
  const autoOptions = getWorkspaceSurfaceAutoOptions(mode);
  return {
    autoOptions,
    autoSeedColor: getWorkspaceSurfaceAutoSeed(appearance.workspaceSurfacePalette[0], mode),
    favorites: getWorkspaceSurfaceFavorites(mode),
    generatedMode: getWorkspaceSurfaceGeneratorMode(mode),
    randomHistory: getWorkspaceSurfaceRandomHistory(mode),
    randomPalettes: buildRandomWorkspaceSurfacePalettes(autoOptions, 8, [], mode)
  };
}

export function useWorkspaceSurfaceEditor(appearance: ReturnType<typeof useAppearanceSettings>) {
  const mode = appearance.resolvedBaseColorMode;
  const initialModeState = getInitialWorkspaceSurfaceEditorState(appearance, mode);
  const [activeBrushIndex, setActiveBrushIndex] = useState(0);
  const [autoSeedColor, setAutoSeedColor] = useState<WorkspaceSurfaceColorValue>(() => initialModeState.autoSeedColor);
  const [autoOptions, setAutoOptions] = useState<WorkspaceSurfaceAutoPaletteOptions>(() => initialModeState.autoOptions);
  const [generatedMode, setGeneratedMode] = useState<WorkspaceSurfaceGeneratorMode>(() => initialModeState.generatedMode);
  const [favorites, setFavorites] = useState<string[][]>(() => initialModeState.favorites);
  const [randomHistory, setRandomHistory] = useState<string[][]>(() => initialModeState.randomHistory);
  const [randomPalettes, setRandomPalettes] = useState<string[][]>(() => initialModeState.randomPalettes);
  const [editorState, setEditorState] = useState<{ bounds: { height: number; width: number }; index: number; x: number; y: number } | null>(null);
  const editorHostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setActiveBrushIndex((current) => clampBrushIndex(current, appearance.workspaceSurfacePalette.length));
  }, [appearance.workspaceSurfacePalette.length]);

  useEffect(() => {
    const nextModeState = readWorkspaceSurfaceModeState(mode, appearance.workspaceSurfacePalette[0]);
    setAutoSeedColor(nextModeState.autoSeedColor);
    setAutoOptions(nextModeState.autoOptions);
    setGeneratedMode(nextModeState.generatedMode);
    setFavorites(nextModeState.favorites);
    setRandomHistory(nextModeState.randomHistory);
    setRandomPalettes(nextModeState.randomPalettes);
    setEditorState(null);
  }, [mode]);

  useEffect(() => {
    setWorkspaceSurfaceAutoOptions(autoOptions, mode);
  }, [autoOptions, mode]);

  useEffect(() => {
    setWorkspaceSurfaceAutoSeed(autoSeedColor, mode);
  }, [autoSeedColor, mode]);

  useEffect(() => {
    setWorkspaceSurfaceGeneratorMode(generatedMode, mode);
  }, [generatedMode, mode]);

  useEffect(() => {
    setRandomPalettes(buildRandomWorkspaceSurfacePalettes(autoOptions, 8, [], mode));
  }, [autoOptions, mode]);

  return {
    activeBrushIndex,
    appearance,
    autoOptions,
    autoSeedColor,
    editorHostRef,
    editorState,
    favorites,
    generatedMode,
    randomHistory,
    randomPalettes,
    mode,
    setActiveBrushIndex,
    setAutoOptions,
    setAutoSeedColor,
    setGeneratedMode,
    setFavorites,
    setRandomHistory,
    setRandomPalettes,
    setEditorState
  };
}

function readWorkspaceSurfaceModeState(mode: 'dark' | 'light', fallbackColor?: string) {
  const autoOptions = getWorkspaceSurfaceAutoOptions(mode);
  return {
    autoOptions,
    autoSeedColor: getWorkspaceSurfaceAutoSeed(fallbackColor, mode),
    favorites: getWorkspaceSurfaceFavorites(mode),
    generatedMode: getWorkspaceSurfaceGeneratorMode(mode),
    randomHistory: getWorkspaceSurfaceRandomHistory(mode),
    randomPalettes: buildRandomWorkspaceSurfacePalettes(autoOptions, 8)
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

export function applyAutoModeToWorkspace(
  editor: ReturnType<typeof useWorkspaceSurfaceEditor>,
  options?: { nextAutoOptions?: WorkspaceSurfaceAutoPaletteOptions; nextAutoSeedColor?: WorkspaceSurfaceColorValue; trackHistory?: boolean }
) {
  const autoOptions = options?.nextAutoOptions ?? editor.autoOptions;
  const autoSeedColor = options?.nextAutoSeedColor ?? editor.autoSeedColor;
  const nextState = {
    assignments: buildWorkspaceSurfaceAutoAssignments(),
    palette: applyWorkspaceSurfaceAutoPalette(
      editor.appearance.workspaceSurfacePalette,
      buildWorkspaceSurfaceAutoColumnPalette(autoSeedColor, autoOptions, undefined, editor.mode)
    )
  };
  editor.appearance.setWorkspaceSurfacePalette(nextState.palette);
  editor.appearance.setWorkspaceSurfaceAssignments(nextState.assignments);
  editor.setActiveBrushIndex(3);
  if (options?.trackHistory) {
    editor.setRandomHistory(pushWorkspaceSurfaceRandomHistoryEntry(nextState.palette.slice(0, 5), editor.mode));
  }
}

export function applyGeneratedPaletteToWorkspace(
  editor: ReturnType<typeof useWorkspaceSurfaceEditor>,
  palette: string[],
  options?: { markManual?: boolean; trackHistory?: boolean }
) {
  if (options?.markManual) {
    editor.setGeneratedMode('manual');
  }
  editor.appearance.setWorkspaceSurfacePalette(
    applyWorkspaceSurfaceAutoPalette(editor.appearance.workspaceSurfacePalette, palette)
  );
  editor.appearance.setWorkspaceSurfaceAssignments(buildWorkspaceSurfaceAutoAssignments());
  editor.setActiveBrushIndex(3);
  if (options?.trackHistory !== false) {
    editor.setRandomHistory(pushWorkspaceSurfaceRandomHistoryEntry(palette, editor.mode));
  }
}

export function addCurrentWorkspaceSurfaceFavorite(editor: ReturnType<typeof useWorkspaceSurfaceEditor>) {
  editor.setFavorites(addWorkspaceSurfaceFavorite(editor.appearance.workspaceSurfacePalette.slice(0, 5), editor.mode));
}

export function removeWorkspaceSurfaceFavoriteEntry(editor: ReturnType<typeof useWorkspaceSurfaceEditor>, palette: string[]) {
  editor.setFavorites(removeWorkspaceSurfaceFavorite(palette, editor.mode));
}

export function resetWorkspaceSurfaceFreePalette(editor: ReturnType<typeof useWorkspaceSurfaceEditor>) {
  const palette = editor.appearance.workspaceSurfacePalette.slice(0, 5);
  const maxIndex = Math.max(palette.length - 1, 0);
  const assignments = Object.fromEntries(
    Object.entries(editor.appearance.workspaceSurfaceAssignments).map(([regionId, index]) => [
      regionId,
      Math.min(index, maxIndex)
    ])
  ) as WorkspaceSurfaceAssignments;
  editor.setGeneratedMode('manual');
  editor.appearance.setWorkspaceSurfacePalette(palette);
  editor.appearance.setWorkspaceSurfaceAssignments(assignments);
  editor.setActiveBrushIndex(Math.min(editor.activeBrushIndex, maxIndex));
}

export function resetWorkspaceSurfaceToDefault(editor: ReturnType<typeof useWorkspaceSurfaceEditor>) {
  editor.setGeneratedMode('manual');
  editor.appearance.resetWorkspaceSurfaceSettings();
  editor.setActiveBrushIndex(3);
}

export function createRandomWorkspaceSurfacePalettes(
  options: WorkspaceSurfaceAutoPaletteOptions,
  count: number,
  excludePalettes: string[][] = [],
  mode: 'dark' | 'light' = 'light'
) {
  return buildRandomWorkspaceSurfacePalettes(options, count, excludePalettes, mode);
}
