import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';

import { AppButton, SettingsSection } from '../../../../shared/ui';
import { useAppearanceSettings } from '../../context/AppearanceSettingsProvider';
import {
  applyWorkspaceSurfaceAutoPalette,
  buildWorkspaceSurfaceAutoAssignments,
  buildWorkspaceSurfaceAutoColumnPalette,
  type WorkspaceSurfaceAutoPaletteOptions
} from '../../model/workspaceSurfaceAutoPalette';
import {
  formatWorkspaceSurfaceColorCss,
  parseWorkspaceSurfaceColor,
  type WorkspaceSurfaceColorValue
} from '../../model/workspaceSurfaceColor';
import { getWorkspaceSurfaceRecommendationFamilies } from '../../model/workspaceSurfaceColorRecommendations';
import { type WorkspaceSurfaceRegionId } from '../../model/workspaceSurfaceSettings';

import { WorkspaceSurfaceColorModePanel } from './WorkspaceSurfaceColorModePanel';
import { WorkspaceSurfaceColorPaletteStrip } from './WorkspaceSurfaceColorPaletteStrip';
import { WorkspaceSurfaceGrid } from './WorkspaceSurfaceGrid';
import { WorkspaceSurfacePaletteEditor } from './WorkspaceSurfacePaletteEditor';

function clampBrushIndex(value: number, paletteLength: number) {
  return Math.min(Math.max(value, 0), Math.max(paletteLength - 1, 0));
}

function useWorkspaceSurfaceEditor() {
  const appearance = useAppearanceSettings();
  const [activeBrushIndex, setActiveBrushIndex] = useState(0);
  const [activeRecommendationId, setActiveRecommendationId] = useState<string | null>(null);
  const [autoSeedColor, setAutoSeedColor] = useState<WorkspaceSurfaceColorValue>(() => (
    parseWorkspaceSurfaceColor(appearance.workspaceSurfacePalette[0] ?? '#f5f5f3') ?? { a: 1, b: 243, g: 245, r: 245 }
  ));
  const [autoOptions, setAutoOptions] = useState<WorkspaceSurfaceAutoPaletteOptions>({
    documentPureWhite: false,
    folderTopicSharedTone: false
  });
  const [generatedMode, setGeneratedMode] = useState<'automatic' | 'recommended' | 'manual' | null>(null);
  const [editorState, setEditorState] = useState<{ bounds: { height: number; width: number }; index: number; x: number; y: number } | null>(null);
  const editorHostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setActiveBrushIndex((current) => clampBrushIndex(current, appearance.workspaceSurfacePalette.length));
  }, [appearance.workspaceSurfacePalette.length]);

  return {
    activeBrushIndex,
    activeRecommendationId,
    appearance,
    autoOptions,
    autoSeedColor,
    editorHostRef,
    editorState,
    generatedMode,
    setActiveBrushIndex,
    setActiveRecommendationId,
    setAutoOptions,
    setAutoSeedColor,
    setGeneratedMode,
    setEditorState
  };
}

function useWorkspaceSurfacePainting(
  activeBrushIndex: number,
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
  }, [activeBrushIndex, isPainting, paintRegion]);

  return { isPainting, setIsPainting };
}

function openWorkspaceSurfaceColorEditor(
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

export function WorkspaceSurfaceColorSection(props: { onEnterPreview: () => void }) {
  const editor = useWorkspaceSurfaceEditor();
  const paintRegion = (regionId: WorkspaceSurfaceRegionId) => {
    editor.appearance.setWorkspaceSurfaceAssignments({
      ...editor.appearance.workspaceSurfaceAssignments,
      [regionId]: editor.activeBrushIndex
    });
  };
  const painting = useWorkspaceSurfacePainting(editor.activeBrushIndex, paintRegion);
  return <WorkspaceSurfaceColorSectionBody editor={editor} onEnterPreview={props.onEnterPreview} paintRegion={paintRegion} painting={painting} />;
}

function applyAutoModeToWorkspace(editor: ReturnType<typeof useWorkspaceSurfaceEditor>) {
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

function applyRecommendedPaletteToWorkspace(
  editor: ReturnType<typeof useWorkspaceSurfaceEditor>,
  palette: string[]
) {
  editor.appearance.setWorkspaceSurfacePalette(
    applyWorkspaceSurfaceAutoPalette(editor.appearance.workspaceSurfacePalette, palette)
  );
  editor.appearance.setWorkspaceSurfaceAssignments(buildWorkspaceSurfaceAutoAssignments());
  editor.setActiveBrushIndex(3);
}

function resolveRecommendedPalette(
  editor: ReturnType<typeof useWorkspaceSurfaceEditor>,
  familyId: string
) {
  return getWorkspaceSurfaceRecommendationFamilies(editor.autoSeedColor, editor.autoOptions)
    .find((family) => family.id === familyId)
    ?.tones.map((tone) => formatWorkspaceSurfaceColorCss(tone));
}

function WorkspaceSurfaceColorSectionBody(props: {
  editor: ReturnType<typeof useWorkspaceSurfaceEditor>;
  onEnterPreview: () => void;
  paintRegion: (regionId: WorkspaceSurfaceRegionId) => void;
  painting: ReturnType<typeof useWorkspaceSurfacePainting>;
}) {
  useEffect(() => {
    if (props.editor.generatedMode === 'automatic') {
      applyAutoModeToWorkspace(props.editor);
      return;
    }
    if (props.editor.generatedMode === 'recommended' && props.editor.activeRecommendationId) {
      const palette = resolveRecommendedPalette(props.editor, props.editor.activeRecommendationId);
      if (palette) {
        applyRecommendedPaletteToWorkspace(props.editor, palette);
      }
    }
  }, [
    props.editor.activeRecommendationId,
    props.editor.autoOptions,
    props.editor.autoSeedColor,
    props.editor.generatedMode
  ]);

  return (
    <SettingsSection
      actions={<WorkspaceSurfaceSectionActions editor={props.editor} onEnterPreview={props.onEnterPreview} />}
      ariaLabel="Workspace surface color section"
      description="Paint the real workspace shell using the same rough proportions as the desktop client."
      title="Workspace surface colors"
    >
      <WorkspaceSurfaceSectionContent editor={props.editor} paintRegion={props.paintRegion} painting={props.painting} />
    </SettingsSection>
  );
}

function WorkspaceSurfaceSectionActions(props: {
  editor: ReturnType<typeof useWorkspaceSurfaceEditor>;
  onEnterPreview: () => void;
}) {
  return (
    <div className="flex items-center gap-2"><AppButton onClick={props.onEnterPreview} variant="primary">Preview</AppButton><AppButton onClick={props.editor.appearance.resetWorkspaceSurfaceSettings} variant="primary">Reset</AppButton></div>
  );
}

function WorkspaceSurfaceSectionContent(props: {
  editor: ReturnType<typeof useWorkspaceSurfaceEditor>;
  paintRegion: (regionId: WorkspaceSurfaceRegionId) => void;
  painting: ReturnType<typeof useWorkspaceSurfacePainting>;
}) {
  return (
    <div className="relative" ref={props.editor.editorHostRef}>
      <WorkspaceSurfaceGrid
        appearance={props.editor.appearance}
        isPainting={props.painting.isPainting}
        onPaintStart={(event, regionId) => {
          event.preventDefault();
          props.paintRegion(regionId);
          props.painting.setIsPainting(true);
        }}
        paintRegion={props.paintRegion}
      />
      <WorkspaceSurfaceColorModePanel
        activeRecommendationId={props.editor.activeRecommendationId}
        autoOptions={props.editor.autoOptions}
        autoSeedColor={props.editor.autoSeedColor}
        onApplyRecommendedPalette={(familyId, palette) => {
          props.editor.setGeneratedMode('recommended');
          props.editor.setActiveRecommendationId(familyId);
          applyRecommendedPaletteToWorkspace(props.editor, palette);
        }}
        onAutoOptionsChange={(options) => props.editor.setAutoOptions(options)}
        onAutoSeedColorChange={(color) => {
          props.editor.setGeneratedMode('automatic');
          props.editor.setActiveRecommendationId(null);
          props.editor.setAutoSeedColor(color);
        }}
      />
      <div className="mt-3 space-y-1">
        <h4 className="text-sm font-medium text-foreground">Free palette</h4>
        <p className="text-xs text-foreground/58">Double-click any swatch below to fine-tune the generated set or paint the workspace manually.</p>
      </div>
      <WorkspaceSurfaceColorPaletteStrip
        activeBrushIndex={props.editor.activeBrushIndex}
        colors={props.editor.appearance.workspaceSurfacePalette}
        onAddPaletteColor={() => {
          const fallbackColor = props.editor.appearance.workspaceSurfacePalette[props.editor.activeBrushIndex] ?? '#d8d8d8';
          props.editor.setGeneratedMode('manual');
          props.editor.setActiveRecommendationId(null);
          props.editor.appearance.setWorkspaceSurfacePalette([...props.editor.appearance.workspaceSurfacePalette, fallbackColor]);
          props.editor.setActiveBrushIndex(props.editor.appearance.workspaceSurfacePalette.length);
        }}
        onEditColor={(event, index) => openWorkspaceSurfaceColorEditor(props.editor, event, index)}
        onSelectColor={(index) => props.editor.setActiveBrushIndex(index)}
      />
      <WorkspaceSurfacePaletteEditorHost editor={props.editor} />
    </div>
  );
}

function WorkspaceSurfacePaletteEditorHost(props: { editor: ReturnType<typeof useWorkspaceSurfaceEditor> }) {
  const activeEditorState = props.editor.editorState;
  if (!activeEditorState) {
    return null;
  }
  const activeEditorColor =
    props.editor.appearance.workspaceSurfacePalette[activeEditorState.index] ??
    props.editor.appearance.workspaceSurfacePalette[0];

  return (
    <WorkspaceSurfacePaletteEditor
      activeColor={activeEditorColor}
      bounds={activeEditorState.bounds}
      index={activeEditorState.index}
      onClose={() => props.editor.setEditorState(null)}
      onCommit={(index, nextColor) => {
        props.editor.setGeneratedMode('manual');
        props.editor.setActiveRecommendationId(null);
        props.editor.appearance.setWorkspaceSurfacePalette(
          props.editor.appearance.workspaceSurfacePalette.map((color, paletteIndex) => (
            paletteIndex === index ? nextColor : color
          ))
        );
      }}
      position={{ x: activeEditorState.x, y: activeEditorState.y }}
    />
  );
}
