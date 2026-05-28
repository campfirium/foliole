import { Pencil } from 'lucide-react';

import { settingsButtonClassName } from '../../../../shared/ui';
import { NodeTreeRowIcon } from '../../../nodes/components/NodeTreeRowIcon';
import type { NodeTreeRowIconKind, NodeTreeRowIconState } from '../../../nodes/components/NodeTreeRowIconModel';

type EditableIconKind = Extract<NodeTreeRowIconKind, 'reading' | 'review'>;

type OverviewTile = {
  baseOnly?: boolean;
  kind: EditableIconKind;
  label: [string, string];
  state: NodeTreeRowIconState;
  title: string;
};

const OVERVIEW_TILES: OverviewTile[] = [
  { baseOnly: true, kind: 'reading', label: ['Topic', 'icon'], state: 'scheduled', title: 'Topic icon' },
  { kind: 'reading', label: ['Topic', 'pending'], state: 'pending', title: 'Topic pending' },
  { kind: 'reading', label: ['Topic', 'scheduled'], state: 'scheduled', title: 'Topic scheduled' },
  { kind: 'reading', label: ['Topic', 'dismissed'], state: 'dismissed', title: 'Topic dismissed' },
  { baseOnly: true, kind: 'review', label: ['Item', 'icon'], state: 'scheduled', title: 'Item icon' },
  { kind: 'review', label: ['Item', 'pending'], state: 'pending', title: 'Item pending' },
  { kind: 'review', label: ['Item', 'scheduled'], state: 'scheduled', title: 'Item scheduled' }
];

export function NodeIconSettingsOverview(props: { onEdit: () => void }) {
  return (
    <div className="grid gap-4 p-5">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-[0.95rem] font-semibold text-foreground">Navigation icons</h3>
        <button className={settingsButtonClassName('gap-2')} onClick={props.onEdit} type="button">
          <Pencil aria-hidden="true" size={16} strokeWidth={1.9} />
          Edit
        </button>
      </div>
      <div className="grid grid-cols-7 gap-2 max-[1180px]:grid-cols-4 max-[980px]:grid-cols-2">
        {OVERVIEW_TILES.map((tile) => (
          <div
            aria-label={tile.title}
            className="grid h-24 content-center justify-items-center gap-2 rounded-md bg-settings-control/60 px-2 py-3"
            key={`${tile.kind}-${tile.title}`}
            role="group"
          >
            <span className="inline-grid size-8 place-items-center text-foreground">
              <NodeTreeRowIcon {...(tile.baseOnly !== undefined ? { baseOnly: tile.baseOnly } : {})} kind={tile.kind} preview state={tile.state} />
            </span>
            <span className="grid min-w-0 justify-items-center text-center text-[0.78rem] leading-4 text-foreground/72">
              <span>{tile.label[0]}</span>
              <span>{tile.label[1]}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
