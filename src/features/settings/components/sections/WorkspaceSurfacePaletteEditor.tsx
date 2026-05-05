import {
  formatWorkspaceSurfaceColorCss,
  parseWorkspaceSurfaceColor
} from '../../model/workspaceSurfaceColor';

import { WorkspaceSurfaceColorEditor } from './WorkspaceSurfaceColorEditor';

type WorkspaceSurfacePaletteEditorProps = {
  activeColor: string;
  bounds: { height: number; width: number };
  index: number;
  onClose: () => void;
  onCommit: (index: number, color: string) => void;
  position: { x: number; y: number };
};

export function WorkspaceSurfacePaletteEditor(props: WorkspaceSurfacePaletteEditorProps) {
  return (
    <WorkspaceSurfaceColorEditor
      anchorPoint={props.position}
      bounds={props.bounds}
      onClose={props.onClose}
      onCommit={(value) => {
        const parsed = parseWorkspaceSurfaceColor(value);
        if (!parsed) {
          return;
        }
        props.onCommit(props.index, formatWorkspaceSurfaceColorCss(parsed));
      }}
      value={props.activeColor}
    />
  );
}
