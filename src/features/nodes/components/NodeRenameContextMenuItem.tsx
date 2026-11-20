
import { useTranslation } from '../../../shared/localization/LocalizationProvider';

import { NodeContextMenuItem, RenameMenuIcon } from './nodeListContextMenuPresentation';

export function NodeRenameContextMenuItem(props: { onSelect: () => void }) {
  const t = useTranslation();
  return (
    <NodeContextMenuItem icon={RenameMenuIcon} onSelect={props.onSelect}>
      {t('desktop.nodeList.menu.rename')}
    </NodeContextMenuItem>
  );
}
