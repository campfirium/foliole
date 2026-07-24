import { useCallback, useEffect, useState } from 'react';

import type { NativeFoliolePublishedTopic } from '../../../lib/platform/nativeFoliolePublishContract';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { useTranslation, type Translate } from '../../shared/localization/LocalizationProvider';
import {
  notifyFoliolePublishedTopicsChanged,
  subscribeFoliolePublishedTopicsChanged
} from '../../shared/platform/foliolePublishedManagement';
import {
  loadFoliolePublishedTopicsFromRuntime,
  migrateFoliolePublishedTopicsFromRuntime,
  unpublishFolioleTopicsFromRuntime
} from '../../shared/platform/foliolePublishRepository';
import { AppButton, AppErrorState, AppLoadingState, requestAppConfirmation } from '../../shared/ui';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';

import { VirtualResultListPanel } from './VirtualResultListPanel';

interface PublishedVirtualDocumentSurfaceProps {
  activeNodeId: string | null;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string) => void;
  trashedNodeIds: string[];
}

function usePublishedTopics(t: Translate) {
  const [topics, setTopics] = useState<NativeFoliolePublishedTopic[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      let result = await loadFoliolePublishedTopicsFromRuntime();
      if (result.status === 'migration_required') {
        const confirmed = await requestAppConfirmation({
          cancelLabel: t('common.cancel'), confirmLabel: t('desktop.foliolePublish.migration.confirm'),
          description: t('desktop.foliolePublish.migration.description'), title: t('desktop.foliolePublish.migration.title')
        });
        if (!confirmed) {
          setError(t('desktop.foliolePublish.migration.description'));
          return;
        }
        result = await migrateFoliolePublishedTopicsFromRuntime();
      }
      setTopics(result.topics);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('desktop.foliolePublish.delete.failed'));
    }
  }, [t]);
  useEffect(() => {
    void load();
    return subscribeFoliolePublishedTopicsChanged(() => void load());
  }, [load]);
  return { error, load, topics };
}

function OrphanPublishedTopics({ topics, t }: { topics: NativeFoliolePublishedTopic[]; t: Translate }) {
  if (topics.length === 0) return null;
  return (
    <div className="border-t border-border/60 px-5 py-4">
      {topics.map((topic) => (
        <div className="flex items-center justify-between gap-4 py-2" key={topic.source_key}>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{topic.title}</p>
            <p className="text-xs text-foreground/55">{t('desktop.virtualSearch.published.missingSource')}</p>
          </div>
          <AppButton onClick={() => void unpublishOrphan(topic, t)} size="sm" variant="ghost">
            {t('desktop.foliolePublish.unpublish')}
          </AppButton>
        </div>
      ))}
    </div>
  );
}

async function unpublishOrphan(topic: NativeFoliolePublishedTopic, t: Translate) {
  const confirmed = await requestAppConfirmation({
    cancelLabel: t('common.cancel'), confirmLabel: t('desktop.foliolePublish.unpublish'),
    description: t('desktop.foliolePublish.unpublishConfirm.description'),
    title: t('desktop.foliolePublish.unpublishConfirm.title')
  });
  if (!confirmed) return;
  try {
    const result = await unpublishFolioleTopicsFromRuntime([topic.source_key]);
    if (result.status !== 'unpublished') return showAppRuntimeNotice(result.warning);
    notifyFoliolePublishedTopicsChanged();
  } catch (reason) {
    showAppRuntimeNotice(reason instanceof Error ? reason.message : t('desktop.foliolePublish.delete.failed'));
  }
}

export function PublishedVirtualDocumentSurface(props: PublishedVirtualDocumentSurfaceProps) {
  const t = useTranslation();
  const { error, load, topics } = usePublishedTopics(t);

  const activeNodes = (topics ?? []).flatMap((topic) => {
    const node = topic.node_id ? props.nodesById[topic.node_id] : undefined;
    return node && topic.source_state === 'active' && !props.trashedNodeIds.includes(node.id) ? [node] : [];
  });
  const orphanTopics = (topics ?? []).filter((topic) => !activeNodes.some((node) => node.id === topic.node_id));

  if (error) {
    return (
      <AppErrorState
        action={<AppButton onClick={() => void load()}>{t('desktop.document.retry')}</AppButton>}
        description={error}
        title={t('desktop.virtualSearch.published.title')}
      />
    );
  }
  if (!topics) return <AppLoadingState title={t('desktop.virtualSearch.published.title')} />;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <VirtualResultListPanel
        activeNodeId={props.activeNodeId}
        emptyState={{
          description: t('desktop.virtualSearch.published.empty.description'),
          title: t('desktop.virtualSearch.published.empty.title')
        }}
        header={{
          kind: 'description',
          text: t('desktop.virtualSearch.published.description'),
          title: t('desktop.virtualSearch.published.title')
        }}
        nodeOrder={props.nodeOrder}
        nodes={activeNodes}
        nodesById={props.nodesById}
        onSelectNode={props.onSelectNode}
      />
      <OrphanPublishedTopics t={t} topics={orphanTopics} />
    </div>
  );
}
