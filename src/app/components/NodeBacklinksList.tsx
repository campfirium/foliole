import type { BacklinkItem } from '../../features/nodes/model/internalLinks';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  InspectorList,
  InspectorListRow,
  inspectorListBodyClassName,
  inspectorListMetaClassName,
  inspectorListTitleClassName
} from '../../shared/ui';

interface NodeBacklinksListProps {
  backlinks: BacklinkItem[];
  emptyLabel: string;
  onSelectNode: (nodeId: string) => void;
}

export function NodeBacklinksList({ backlinks, emptyLabel, onSelectNode }: NodeBacklinksListProps) {
  const t = useTranslation();
  if (backlinks.length === 0) {
    return <p className="text-sm text-foreground/60">{emptyLabel}</p>;
  }

  return (
    <InspectorList ariaLabel={t('desktop.links.backlinks')} className="gap-1.5">
      {backlinks.map((backlink) => (
        <li key={backlink.sourceNodeId}>
          <InspectorListRow
            className="flex-col items-start gap-2 rounded-md bg-transparent px-2 py-2"
            onClick={() => onSelectNode(backlink.sourceNodeId)}
            type="button"
          >
            <span className={inspectorListTitleClassName}>{backlink.sourceTitle}</span>
            <span className={`${inspectorListBodyClassName} line-clamp-3 leading-7`}>{backlink.context}</span>
            {backlink.matchCount > 1 ? <span className={inspectorListMetaClassName}>{t('desktop.links.mentionedTimes', { count: backlink.matchCount })}</span> : null}
          </InspectorListRow>
        </li>
      ))}
    </InspectorList>
  );
}
