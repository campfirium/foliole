import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import type { TranslationKey } from '../../../../shared/localization/translations';
import { settingsButtonClassName } from '../../../../shared/ui';
import { NodeTreeRowIcon } from '../../../nodes/components/NodeTreeRowIcon';
import type { NodeTreeRowIconKind, NodeTreeRowIconState } from '../../../nodes/components/NodeTreeRowIconModel';

type EditableIconKind = Extract<NodeTreeRowIconKind, 'reading' | 'review'>;

type OverviewTile = {
  baseOnly?: boolean;
  kind: EditableIconKind;
  label: [TranslationKey, TranslationKey];
  state: NodeTreeRowIconState;
  titleKey: TranslationKey;
};

const OVERVIEW_TILES: OverviewTile[] = [
  { baseOnly: true, kind: 'reading', label: ['settings.icons.node.topic', 'settings.icons.node.icon'], state: 'scheduled', titleKey: 'settings.icons.node.icon' },
  { kind: 'reading', label: ['settings.icons.node.topic', 'settings.icons.node.pending'], state: 'pending', titleKey: 'settings.icons.node.pending' },
  { kind: 'reading', label: ['settings.icons.node.topic', 'settings.icons.node.scheduled'], state: 'scheduled', titleKey: 'settings.icons.node.scheduled' },
  { kind: 'reading', label: ['settings.icons.node.topic', 'settings.icons.node.dismissed'], state: 'dismissed', titleKey: 'settings.icons.node.dismissed' },
  { baseOnly: true, kind: 'review', label: ['settings.icons.node.item', 'settings.icons.node.icon'], state: 'scheduled', titleKey: 'settings.icons.node.icon' },
  { kind: 'review', label: ['settings.icons.node.item', 'settings.icons.node.pending'], state: 'pending', titleKey: 'settings.icons.node.pending' },
  { kind: 'review', label: ['settings.icons.node.item', 'settings.icons.node.scheduled'], state: 'scheduled', titleKey: 'settings.icons.node.scheduled' }
];

export function NodeIconSettingsOverview(props: { onEdit: () => void }) {
  const t = useTranslation();
  return (
    <div className="grid gap-4 p-5">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-[0.95rem] font-semibold text-foreground">{t('settings.icons.node.title')}</h3>
        <button className={settingsButtonClassName()} onClick={props.onEdit} type="button">
          {t('settings.icons.node.edit')}
        </button>
      </div>
      <div className="grid grid-cols-7 gap-2 max-[1180px]:grid-cols-4 max-[980px]:grid-cols-2">
        {OVERVIEW_TILES.map((tile) => (
          <div
            aria-label={`${t(tile.label[0])} ${t(tile.titleKey)}`}
            className="grid h-24 content-center justify-items-center gap-2 rounded-md bg-settings-control/60 px-2 py-3"
            key={`${tile.kind}-${tile.titleKey}-${tile.state}`}
            role="group"
          >
            <span className="inline-grid size-8 place-items-center text-foreground">
              <NodeTreeRowIcon {...(tile.baseOnly !== undefined ? { baseOnly: tile.baseOnly } : {})} kind={tile.kind} preview state={tile.state} />
            </span>
            <span className="grid min-w-0 justify-items-center text-center text-[0.78rem] leading-4 text-foreground/72">
              <span>{t(tile.label[0])}</span>
              <span>{t(tile.label[1])}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
