import { useCallback, useEffect, useMemo, useState } from 'react';

import type { NativeFoliolePublishedTopic } from '../../../lib/platform/nativeFoliolePublishContract';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { subscribeFoliolePublishedTopicsChanged } from '../../shared/platform/foliolePublishedManagement';
import { loadFoliolePublishedTopicsFromRuntime } from '../../shared/platform/foliolePublishRepository';

export function useFoliolePublishedTopics(args: {
  nodesById: Record<string, Node>;
  trashedNodeIds: string[];
}) {
  const t = useTranslation();
  const [topics, setTopics] = useState<NativeFoliolePublishedTopic[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await loadFoliolePublishedTopicsFromRuntime();
      setTopics(result.topics);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('desktop.foliolePublish.delete.failed'));
    }
  }, [t]);

  useEffect(() => {
    void load();
    return subscribeFoliolePublishedTopicsChanged(() => void load());
  }, [load]);

  const nodes = useMemo(() => (topics ?? []).flatMap((topic) => {
    const node = args.nodesById[topic.node_id];
    return node && topic.source_state === 'active' && !args.trashedNodeIds.includes(node.id) ? [node] : [];
  }), [args.nodesById, args.trashedNodeIds, topics]);

  return { error, load, nodes, topics };
}
