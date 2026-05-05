import { useEffect } from 'react';

import { AppButton, SettingsSection } from '../../../../shared/ui';
import { useAppearanceSettings } from '../../context/AppearanceSettingsProvider';
import { type WorkspaceSurfaceRegionId } from '../../model/workspaceSurfaceSettings';

import { WorkspaceSurfaceColorModePanel } from './WorkspaceSurfaceColorModePanel';
import { WorkspaceSurfaceColorPaletteStrip } from './WorkspaceSurfaceColorPaletteStrip';
import {
  applyAutoModeToWorkspace,
  applyGeneratedPaletteToWorkspace,
  createRandomWorkspaceSurfacePalettes,
  openWorkspaceSurfaceColorEditor,
  resetWorkspaceSurfaceToDefault,
  useWorkspaceSurfaceEditor,
  useWorkspaceSurfacePainting
} from './WorkspaceSurfaceColorSection.logic';
import { WorkspaceSurfaceGrid } from './WorkspaceSurfaceGrid';
import { WorkspaceSurfacePaletteEditor } from './WorkspaceSurfacePaletteEditor';

export function WorkspaceSurfaceColorSection(props: { onEnterPreview: () => void }) {
  const appearance = useAppearanceSettings();
  const editor = useWorkspaceSurfaceEditor(appearance);
  const paintRegion = (regionId: WorkspaceSurfaceRegionId) => {
    editor.appearance.setWorkspaceSurfaceAssignments({
      ...editor.appearance.workspaceSurfaceAssignments,
      [regionId]: editor.activeBrushIndex
    });
  };
  const painting = useWorkspaceSurfacePainting(paintRegion);
  return <WorkspaceSurfaceColorSectionBody editor={editor} onEnterPreview={props.onEnterPreview} paintRegion={paintRegion} painting={painting} />;
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
    }
  }, [
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
    <div className="flex items-center gap-2"><AppButton onClick={props.onEnterPreview} variant="primary">Preview</AppButton><AppButton onClick={() => resetWorkspaceSurfaceToDefault(props.editor)} variant="primary">Reset</AppButton></div>
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
      <WorkspaceSurfaceModes editor={props.editor} />
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

function WorkspaceSurfaceModes(props: {
  editor: ReturnType<typeof useWorkspaceSurfaceEditor>;
}) {
  const currentPalette = props.editor.appearance.workspaceSurfacePalette.slice(0, 5);

  return (
    <WorkspaceSurfaceColorModePanel
      activeMode={props.editor.generatedMode}
      autoOptions={props.editor.autoOptions}
      autoSeedColor={props.editor.autoSeedColor}
      currentPalette={currentPalette}
      onApplyAutomaticPalette={() => {
        props.editor.setGeneratedMode('automatic');
        applyAutoModeToWorkspace(props.editor);
      }}
      onApplyRandomPalette={(palette) => {
        props.editor.setGeneratedMode('random');
        applyGeneratedPaletteToWorkspace(props.editor, palette);
      }}
      onAutoOptionsChange={(options) => props.editor.setAutoOptions(options)}
      onAutoSeedColorChange={(color) => {
        props.editor.setGeneratedMode('automatic');
        props.editor.setAutoSeedColor(color);
      }}
      onRefreshRandomPalettes={() => props.editor.setRandomPalettes(
        createRandomWorkspaceSurfacePalettes(props.editor.autoOptions, 7, [currentPalette])
      )}
      randomPalettes={props.editor.randomPalettes}
    />
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
