import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import { AppButton, SettingsSection } from '../../../../shared/ui';
import { useAppearanceSettings } from '../../context/AppearanceSettingsProvider';
import { formatWorkspaceSurfaceColorCss, parseWorkspaceSurfaceColor } from '../../model/workspaceSurfaceColor';
import { WORKSPACE_SURFACE_REGION_IDS, type WorkspaceSurfaceRegionId } from '../../model/workspaceSurfaceSettings';

import { WorkspaceSurfaceColorEditor } from './WorkspaceSurfaceColorEditor';

import { cn } from '@/shared/lib/utils';

const GRID_TEMPLATE_COLUMNS = '40fr 120fr 180fr 627fr 213fr';
const GRID_TEMPLATE_ROWS = '40fr 420fr 56fr';
const COMPACT_CELLS = new Set<WorkspaceSurfaceRegionId>(['titlebar-rail', 'main-rail', 'footer-rail']);
const GRID_CELLS: Array<{ id: WorkspaceSurfaceRegionId; label: string; row: number; column: number }> = [
  { column: 1, id: 'titlebar-rail', label: 'Top rail', row: 1 },
  { column: 2, id: 'titlebar-folder', label: 'Top folder', row: 1 },
  { column: 3, id: 'titlebar-topic', label: 'Top topic', row: 1 },
  { column: 4, id: 'titlebar-document', label: 'Top doc', row: 1 },
  { column: 5, id: 'titlebar-sidebar', label: 'Top sidebar', row: 1 },
  { column: 1, id: 'main-rail', label: 'Main rail', row: 2 },
  { column: 2, id: 'main-folder', label: 'Main folder', row: 2 },
  { column: 3, id: 'main-topic', label: 'Main topic', row: 2 },
  { column: 4, id: 'main-document', label: 'Main doc', row: 2 },
  { column: 5, id: 'main-sidebar', label: 'Main sidebar', row: 2 },
  { column: 1, id: 'footer-rail', label: 'Bottom rail', row: 3 },
  { column: 2, id: 'footer-folder', label: 'Bottom folder', row: 3 },
  { column: 3, id: 'footer-topic', label: 'Bottom topic', row: 3 },
  { column: 4, id: 'footer-document', label: 'Bottom doc', row: 3 },
  { column: 5, id: 'footer-sidebar', label: 'Bottom sidebar', row: 3 }
];

function clampBrushIndex(value: number, paletteLength: number) {
  return Math.min(Math.max(value, 0), Math.max(paletteLength - 1, 0));
}

function useWorkspaceSurfaceEditor() {
  const appearance = useAppearanceSettings();
  const [activeBrushIndex, setActiveBrushIndex] = useState(0);
  const [editorState, setEditorState] = useState<{ bounds: { height: number; width: number }; index: number; x: number; y: number } | null>(null);
  const editorHostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setActiveBrushIndex((current) => clampBrushIndex(current, appearance.workspaceSurfacePalette.length));
  }, [appearance.workspaceSurfacePalette.length]);

  return { activeBrushIndex, appearance, editorHostRef, editorState, setActiveBrushIndex, setEditorState };
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

function WorkspaceSurfaceGrid(props: {
  appearance: ReturnType<typeof useWorkspaceSurfaceEditor>['appearance'];
  isPainting: boolean;
  onPaintStart: (event: ReactPointerEvent<HTMLButtonElement>, regionId: WorkspaceSurfaceRegionId) => void;
  paintRegion: (regionId: WorkspaceSurfaceRegionId) => void;
}) {
  return (
    <div className="overflow-hidden rounded-sm border border-settings-divider/30 bg-settings-divider/30">
      <div className="grid gap-px bg-settings-divider/30 p-px" style={{ aspectRatio: '1180 / 516', gridTemplateColumns: GRID_TEMPLATE_COLUMNS, gridTemplateRows: GRID_TEMPLATE_ROWS }}>
        {GRID_CELLS.map((cell) => {
          const swatchIndex = props.appearance.workspaceSurfaceAssignments[cell.id];
          const backgroundColor = props.appearance.workspaceSurfacePalette[swatchIndex] ?? props.appearance.workspaceSurfacePalette[0];
          return (
            <button
              aria-label={cell.label}
              className="group relative min-h-0 min-w-0 bg-bg-elevated text-left transition-colors"
              data-workspace-region-id={cell.id}
              key={cell.id}
              onPointerDown={(event) => props.onPaintStart(event, cell.id)}
              onPointerEnter={() => props.isPainting && props.paintRegion(cell.id)}
              style={{ backgroundColor, gridColumn: cell.column, gridRow: cell.row }}
              type="button"
            >
              <span className={cn('absolute left-3 top-2 text-[11px] text-foreground/55', COMPACT_CELLS.has(cell.id) && 'left-2 text-[10px]')}>
                {WORKSPACE_SURFACE_REGION_IDS.indexOf(cell.id) + 1}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WorkspaceSurfacePalette(props: ReturnType<typeof useWorkspaceSurfaceEditor> & { onAddPaletteColor: () => void }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2.5">
      {props.appearance.workspaceSurfacePalette.map((color, index) => (
        <button
          aria-label={`Palette color ${index + 1}`}
          className={cn('h-9 w-9 rounded-sm border transition-transform hover:scale-[1.04]', index === props.activeBrushIndex ? 'border-foreground/85' : 'border-border/55')}
          key={`${color}-${index}`}
          onClick={() => props.setActiveBrushIndex(index)}
          onDoubleClick={(event) => {
            const hostRect = props.editorHostRef.current?.getBoundingClientRect();
            props.setEditorState({
              bounds: hostRect ? { height: hostRect.height, width: hostRect.width } : { height: window.innerHeight, width: window.innerWidth },
              index,
              x: hostRect ? event.clientX - hostRect.left + 12 : event.clientX,
              y: hostRect ? event.clientY - hostRect.top + 12 : event.clientY
            });
          }}
          style={{ backgroundColor: color }}
          type="button"
        />
      ))}
      <button aria-label="Add palette color" className="flex h-9 w-9 items-center justify-center rounded-sm border border-dashed border-border/55 bg-bg-elevated text-lg text-foreground/70" onClick={props.onAddPaletteColor} type="button">
        +
      </button>
    </div>
  );
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

function WorkspaceSurfaceColorSectionBody(props: {
  editor: ReturnType<typeof useWorkspaceSurfaceEditor>;
  onEnterPreview: () => void;
  paintRegion: (regionId: WorkspaceSurfaceRegionId) => void;
  painting: ReturnType<typeof useWorkspaceSurfacePainting>;
}) {
  return (
    <SettingsSection
      actions={
        <div className="flex items-center gap-2">
          <AppButton onClick={props.onEnterPreview} variant="primary">Preview</AppButton>
          <AppButton onClick={props.editor.appearance.resetWorkspaceSurfaceSettings} variant="primary">Reset</AppButton>
        </div>
      }
      ariaLabel="Workspace surface color section"
      description="Paint the real workspace shell using the same rough proportions as the desktop client."
      title="Workspace surface colors"
    >
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
        <WorkspaceSurfacePalette
          {...props.editor}
          onAddPaletteColor={() => {
            const fallbackColor = props.editor.appearance.workspaceSurfacePalette[props.editor.activeBrushIndex] ?? '#d8d8d8';
            props.editor.appearance.setWorkspaceSurfacePalette([...props.editor.appearance.workspaceSurfacePalette, fallbackColor]);
            props.editor.setActiveBrushIndex(props.editor.appearance.workspaceSurfacePalette.length);
          }}
        />
        <WorkspaceSurfacePaletteEditor editor={props.editor} />
      </div>
    </SettingsSection>
  );
}

function WorkspaceSurfacePaletteEditor(props: { editor: ReturnType<typeof useWorkspaceSurfaceEditor> }) {
  const activeEditorState = props.editor.editorState;
  if (!activeEditorState) {
    return null;
  }
  const activeEditorColor =
    props.editor.appearance.workspaceSurfacePalette[activeEditorState.index] ??
    props.editor.appearance.workspaceSurfacePalette[0];

  return (
    <WorkspaceSurfaceColorEditor
      anchorPoint={{ x: activeEditorState.x, y: activeEditorState.y }}
      bounds={activeEditorState.bounds}
      onClose={() => props.editor.setEditorState(null)}
      onCommit={(value) => {
        const parsed = parseWorkspaceSurfaceColor(value);
        if (!parsed) {
          return;
        }
        props.editor.appearance.setWorkspaceSurfacePalette(
          props.editor.appearance.workspaceSurfacePalette.map((color, paletteIndex) => (
            paletteIndex === activeEditorState.index ? formatWorkspaceSurfaceColorCss(parsed) : color
          ))
        );
      }}
      value={activeEditorColor}
    />
  );
}
