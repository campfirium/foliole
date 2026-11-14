import { LibraryBig, Link2 } from 'lucide-react';

import type { NativeAssistantThreadOpeningLocation } from '../../../lib/platform/nativeAssistantContract';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { useTranslation } from '../../shared/localization/LocalizationProvider';

export function WorkspaceRightSidebarAssistantMaterialTags(props: {
  activeNodeId?: string | null;
  location: NativeAssistantThreadOpeningLocation | null;
  nodesById: Record<string, Node>;
  onOpenMaterial: (nodeId: string) => void;
  trashedNodeIds?: readonly string[] | undefined;
}) {
  const t = useTranslation();
  const nodeId = props.location?.type === 'node' ? props.location.nodeId : null;
  const node = nodeId ? props.nodesById[nodeId] : null;
  const unavailable = nodeId !== null && (!node || props.trashedNodeIds?.includes(nodeId));
  const className = 'inline-flex min-h-6 min-w-0 max-w-full items-center gap-1 rounded-md border border-border px-1.5 text-ui-xs text-foreground/65';
  if (unavailable) {
    return <span className={className}>{t('desktop.rightPanel.assistant.location.topicUnavailable')}</span>;
  }
  if (!nodeId || !node || node.kind === 'folder' || node.specialKind) {
    return (
      <span className={className}>
        <LibraryBig aria-hidden className="size-3 shrink-0" />
        {t('desktop.rightPanel.assistant.materialTag.library')}
      </span>
    );
  }
  const title = node.title.trim() || t('desktop.rightPanel.assistant.location.untitledTopic');
  return (
    <button
      aria-label={t('desktop.rightPanel.assistant.materialTag.open', { title })}
      className={`${className} hover:bg-foreground/[0.05] focus-visible:outline focus-visible:outline-1`}
      onClick={() => props.onOpenMaterial(nodeId)}
      title={title}
      type="button"
    >
      <Link2 aria-hidden className="size-3 shrink-0" />
      <span className="max-w-[12em] truncate">
        {props.activeNodeId === nodeId ? t('desktop.rightPanel.assistant.materialTag.current') : title}
      </span>
    </button>
  );
}
