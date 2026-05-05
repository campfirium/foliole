import { RotateCcw } from 'lucide-react';
import { useEffect } from 'react';

import {
  SETTINGS_SURFACE_SIDEBAR_GRID_CLASS_NAME,
  SettingsSection,
  settingsButtonClassName,
  settingsUtilityIconButtonClassName
} from '../../../../shared/ui';
import { useAppearanceSettings } from '../../context/AppearanceSettingsProvider';
import { type WorkspaceSurfaceRegionId } from '../../model/workspaceSurfaceSettings';

import { WorkspaceSurfaceAutomaticPanel, WorkspaceSurfaceColorModePanel, WorkspaceSurfacePreferences } from './WorkspaceSurfaceColorModePanel';
import { WorkspaceSurfaceColorPaletteStrip } from './WorkspaceSurfaceColorPaletteStrip';
import {
  addCurrentWorkspaceSurfaceFavorite,
  applyAutoModeToWorkspace,
  applyGeneratedPaletteToWorkspace,
  createRandomWorkspaceSurfacePalettes,
  openWorkspaceSurfaceColorEditor,
  removeWorkspaceSurfaceFavoriteEntry,
  resetWorkspaceSurfaceFreePalette,
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
    <div className="flex items-center gap-2">
      <button className={settingsButtonClassName()} onClick={props.onEnterPreview} type="button">Preview</button>
      <button className={settingsButtonClassName()} onClick={() => resetWorkspaceSurfaceToDefault(props.editor)} type="button">Reset</button>
    </div>
  );
}

function WorkspaceSurfaceSectionContent(props: {
  editor: ReturnType<typeof useWorkspaceSurfaceEditor>;
  paintRegion: (regionId: WorkspaceSurfaceRegionId) => void;
  painting: ReturnType<typeof useWorkspaceSurfacePainting>;
}) {
  return (
    <div className={`relative grid gap-5 px-5 py-5 ${SETTINGS_SURFACE_SIDEBAR_GRID_CLASS_NAME}`} ref={props.editor.editorHostRef}>
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
      <WorkspaceSurfaceSideRail editor={props.editor} />
      <div className="xl:col-span-2">
        <WorkspaceSurfaceModes editor={props.editor} />
      </div>
      <WorkspaceSurfacePaletteEditorHost editor={props.editor} />
    </div>
  );
}

function WorkspaceSurfaceSideRail(props: {
  editor: ReturnType<typeof useWorkspaceSurfaceEditor>;
}) {
  return (
    <div className="space-y-4 xl:pt-0">
      <WorkspaceSurfacePreferences
        onOptionsChange={(options) => {
          props.editor.setGeneratedMode('automatic');
          props.editor.setAutoOptions(options);
          applyAutoModeToWorkspace(props.editor, { nextAutoOptions: options, trackHistory: true });
        }}
        options={props.editor.autoOptions}
      />
      <WorkspaceSurfaceAutomaticPanel
        activeMode={props.editor.generatedMode}
        autoSeedColor={props.editor.autoSeedColor}
        onApplyAutomaticPalette={() => {
          props.editor.setGeneratedMode('automatic');
          applyAutoModeToWorkspace(props.editor, { trackHistory: true });
        }}
        onAutoSeedColorChange={(color) => {
          props.editor.setGeneratedMode('automatic');
          props.editor.setAutoSeedColor(color);
          applyAutoModeToWorkspace(props.editor, { nextAutoSeedColor: color, trackHistory: true });
        }}
        options={props.editor.autoOptions}
        resolvedBaseColorMode={props.editor.mode}
      />
      <WorkspaceSurfaceFreePalette editor={props.editor} />
    </div>
  );
}

function WorkspaceSurfaceFreePalette(props: {
  editor: ReturnType<typeof useWorkspaceSurfaceEditor>;
}) {
  return (
    <div className="space-y-2">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-medium text-foreground">Free palette</h4>
          <button
            aria-label="Reset free palette"
            className={settingsUtilityIconButtonClassName(false, 'size-8 rounded-sm px-0')}
            onClick={() => resetWorkspaceSurfaceFreePalette(props.editor)}
            type="button"
          >
            <RotateCcw aria-hidden="true" className="text-current" size={18} strokeWidth={1.9} />
          </button>
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

function WorkspaceSurfaceModes(props: {
  editor: ReturnType<typeof useWorkspaceSurfaceEditor>;
}) {
  const currentPalette = props.editor.appearance.workspaceSurfacePalette.slice(0, 5);
  const currentPaletteSignature = currentPalette.map((color) => color.toLowerCase()).join('|');
  const isFavorited = props.editor.favorites.some((palette) => palette.map((color) => color.toLowerCase()).join('|') === currentPaletteSignature);

  return (
    <WorkspaceSurfaceColorModePanel
      activeMode={props.editor.generatedMode}
      autoOptions={props.editor.autoOptions}
      autoSeedColor={props.editor.autoSeedColor}
      currentPalette={currentPalette}
      favorites={props.editor.favorites}
      history={props.editor.randomHistory}
      isFavorited={isFavorited}
      onAddFavorite={() => addCurrentWorkspaceSurfaceFavorite(props.editor)}
      onApplyAutomaticPalette={() => {
        props.editor.setGeneratedMode('automatic');
        applyAutoModeToWorkspace(props.editor, { trackHistory: true });
      }}
      onApplyFavorite={(palette) => applyGeneratedPaletteToWorkspace(props.editor, palette, { markManual: true })}
      onApplyHistory={(palette) => applyGeneratedPaletteToWorkspace(props.editor, palette, { markManual: true })}
      onApplyRandomPalette={(palette) => {
        props.editor.setGeneratedMode('random');
        applyGeneratedPaletteToWorkspace(props.editor, palette);
      }}
      onAutoOptionsChange={(options) => {
        props.editor.setGeneratedMode('automatic');
        props.editor.setAutoOptions(options);
        applyAutoModeToWorkspace(props.editor, { nextAutoOptions: options, trackHistory: true });
      }}
      onAutoSeedColorChange={(color) => {
        props.editor.setGeneratedMode('automatic');
        props.editor.setAutoSeedColor(color);
        applyAutoModeToWorkspace(props.editor, { nextAutoSeedColor: color, trackHistory: true });
      }}
      onRemoveFavorite={(palette) => removeWorkspaceSurfaceFavoriteEntry(props.editor, palette)}
      onRefreshRandomPalettes={() => props.editor.setRandomPalettes(
        createRandomWorkspaceSurfacePalettes(props.editor.autoOptions, 8, [], props.editor.mode)
      )}
      randomPalettes={props.editor.randomPalettes}
      resolvedBaseColorMode={props.editor.mode}
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
