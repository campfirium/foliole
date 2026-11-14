import { LibraryBig, Link2, Plus } from 'lucide-react';

import type { NativeAssistantThreadOpeningLocation } from '../../../lib/platform/nativeAssistantContract';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppDropdownMenu, AppDropdownMenuContent, AppDropdownMenuItem, AppDropdownMenuTrigger } from '../../shared/ui';

const tagClassName = 'inline-flex min-h-6 min-w-0 max-w-full items-center gap-1 rounded-md border border-border px-1.5 text-ui-xs text-foreground/65';
const buttonClassName = `${tagClassName} hover:bg-foreground/[0.05] focus-visible:outline focus-visible:outline-1`;

type MaterialTagsProps = {
  activeNodeId?: string | null;
  location: NativeAssistantThreadOpeningLocation | null;
  linkedMaterialIds?: string[] | undefined;
  nodesById: Record<string, Node>;
  onOpenMaterial: (nodeId: string) => void;
  trashedNodeIds?: readonly string[] | undefined;
  addMaterial?: (nodeId: string) => void;
  busy?: boolean;
  draft?: boolean;
};

function isMaterial(node: Node | undefined) {
  return node && node.kind !== 'folder' && !node.specialKind;
}

export function WorkspaceRightSidebarAssistantMaterialTags(props: MaterialTagsProps) {
  const t = useTranslation();
  const sourceId = props.location?.type === 'node' ? props.location.nodeId : null;
  const materialIds = [...new Set([...(sourceId ? [sourceId] : []), ...(props.linkedMaterialIds ?? [])])]
    .filter(id => !props.nodesById[id] || isMaterial(props.nodesById[id]));
  const currentId = props.activeNodeId;
  const addDisabled = !currentId || !isMaterial(props.nodesById[currentId])
    || props.trashedNodeIds?.includes(currentId) || (props.draft ? props.linkedMaterialIds?.includes(currentId) : materialIds.includes(currentId))
    || props.busy;
  return (
    <div className="flex min-w-0 items-center gap-1">
      {materialIds.length === 0 ? <span className={tagClassName}>
        <LibraryBig aria-hidden className="size-3 shrink-0" />
        {t('desktop.rightPanel.assistant.materialTag.library')}
      </span> : null}
      {materialIds.slice(0, 2).map(id => <MaterialTag key={id} id={id} props={props} single={materialIds.length === 1} />)}
      {materialIds.length > 2 ? <MoreMaterials ids={materialIds.slice(2)} props={props} /> : null}
      {props.addMaterial ? <button
        aria-label={t('desktop.rightPanel.assistant.materialTag.add')}
        title={t('desktop.rightPanel.assistant.materialTag.add')}
        className={`${buttonClassName} shrink-0 disabled:opacity-45`}
        disabled={addDisabled}
        onClick={() => { if (currentId) props.addMaterial?.(currentId); }}
        type="button"
      ><Plus aria-hidden className="size-3" /></button> : null}
    </div>
  );
}

function useMaterialTag(id: string, props: MaterialTagsProps) {
  const t = useTranslation();
  const node = props.nodesById[id];
  const title = node?.title.trim() || t('desktop.rightPanel.assistant.location.untitledTopic');
  const unavailable = !node || props.trashedNodeIds?.includes(id);
  return { title, unavailable, label: unavailable
    ? t('desktop.rightPanel.assistant.location.topicUnavailable')
    : t('desktop.rightPanel.assistant.materialTag.open', { title }) };
}

function MaterialTag({ id, props, single }: { id: string; props: MaterialTagsProps; single: boolean }) {
  const t = useTranslation();
  const { title, unavailable, label } = useMaterialTag(id, props);
  const width = single ? 'max-w-[12em]' : 'max-w-[8em]';
  if (unavailable) return <span className={tagClassName} title={label}>
    <span className={`${width} truncate`}>{label}</span>
  </span>;
  return (
    <button aria-label={label} className={buttonClassName}
      onClick={() => props.onOpenMaterial(id)} title={title} type="button"
    >
      <Link2 aria-hidden className="size-3 shrink-0" />
      <span className={`${width} truncate`}>
        {props.activeNodeId === id ? t('desktop.rightPanel.assistant.materialTag.current') : title}
      </span>
    </button>
  );
}

function MoreMaterials({ ids, props }: { ids: string[]; props: MaterialTagsProps }) {
  const t = useTranslation();
  return (
    <AppDropdownMenu>
      <AppDropdownMenuTrigger asChild>
        <button aria-label={t('desktop.rightPanel.assistant.materialTag.more')} className={`${buttonClassName} shrink-0`} type="button">
          +{ids.length}
        </button>
      </AppDropdownMenuTrigger>
      <AppDropdownMenuContent>
        {ids.map(id => <MoreMaterial key={id} id={id} props={props} />)}
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}

function MoreMaterial({ id, props }: { id: string; props: MaterialTagsProps }) {
  const { title, unavailable, label } = useMaterialTag(id, props);
  return <AppDropdownMenuItem disabled={unavailable} onSelect={() => props.onOpenMaterial(id)}>
    {unavailable ? label : title}
  </AppDropdownMenuItem>;
}
