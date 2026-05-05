import { type PointerEvent as ReactPointerEvent } from 'react';

import { type WorkspaceSurfaceRegionId } from '../../model/workspaceSurfaceSettings';

const GRID_TEMPLATE_COLUMNS = '40fr 120fr 180fr 627fr 213fr';
const GRID_TEMPLATE_ROWS = '40fr 420fr 56fr';
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

export function WorkspaceSurfaceGrid(props: {
  appearance: {
    workspaceSurfaceAssignments: Record<WorkspaceSurfaceRegionId, number>;
    workspaceSurfacePalette: string[];
  };
  isPainting: boolean;
  onPaintStart: (event: ReactPointerEvent<HTMLButtonElement>, regionId: WorkspaceSurfaceRegionId) => void;
  paintRegion: (regionId: WorkspaceSurfaceRegionId) => void;
}) {
  return (
    <div className="overflow-hidden rounded-sm bg-transparent">
      <div className="grid gap-px bg-settings-divider" style={{ aspectRatio: '16 / 9', gridTemplateColumns: GRID_TEMPLATE_COLUMNS, gridTemplateRows: GRID_TEMPLATE_ROWS }}>
        {GRID_CELLS.map((cell) => {
          const swatchIndex = props.appearance.workspaceSurfaceAssignments[cell.id];
          const backgroundColor = props.appearance.workspaceSurfacePalette[swatchIndex] ?? props.appearance.workspaceSurfacePalette[0];
          return (
            <button
              aria-label={cell.label}
              className="group relative min-h-0 min-w-0 bg-settings-control text-left transition-colors"
              data-workspace-region-id={cell.id}
              key={cell.id}
              onPointerDown={(event) => props.onPaintStart(event, cell.id)}
              onPointerEnter={() => props.isPainting && props.paintRegion(cell.id)}
              style={{ backgroundColor, gridColumn: cell.column, gridRow: cell.row }}
              type="button"
            >
            </button>
          );
        })}
      </div>
    </div>
  );
}
