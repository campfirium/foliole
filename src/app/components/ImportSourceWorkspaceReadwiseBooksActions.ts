import { useCallback, useState } from 'react';

import type { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  resetRuntimeReadwiseBookImport
} from '../../shared/platform/readwiseBooksRuntimeRepository';

import { applyResetReadwiseBookImportToWorkspace, selectReadwiseBookNode } from './importSourceWorkspaceReadwiseBooks';

type ReadwiseBooksTranslate = ReturnType<typeof useTranslation>;

async function runReadwiseBookReset(input: { nodeId: string; t: ReadwiseBooksTranslate; title: string }) {
  const result = await resetRuntimeReadwiseBookImport(input.nodeId);
  if (result?.status === 'blocked_secondary') {
    throw new Error(input.t('desktop.importInventory.readwise.primaryDeviceOnly'));
  }
  if (!result || result.status !== 'reset' || !result.node_id || result.content === null || !result.updated_at) {
    throw new Error(input.t('desktop.importInventory.readwise.importFailed', { title: input.title }));
  }

  applyResetReadwiseBookImportToWorkspace({
    content: result.content,
    node_id: result.node_id,
    removed_node_ids: result.removed_node_ids,
    title: result.title ?? input.title,
    updated_at: result.updated_at
  });
  return result.node_id;
}

export function useReadwiseBookActions(props: {
  onOpenChange: (open: boolean) => void;
  onSelectNode?: (nodeId: string) => void;
  refreshBooksInventory: () => Promise<void>;
  t: ReadwiseBooksTranslate;
}) {
  const [resettingNodeId, setResettingNodeId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState('');
  const handleOpenBookNode = useCallback(
    (nodeId: string) => {
      selectReadwiseBookNode(nodeId, props.onSelectNode);
      props.onOpenChange(false);
    },
    [props.onOpenChange, props.onSelectNode]
  );
  const handleReimportBook = useCallback(
    async (input: { nodeId: string; title: string }) => {
      setResettingNodeId(input.nodeId);
      try {
        const nodeId = await runReadwiseBookReset({ ...input, t: props.t });
        setActionMessage('');
        handleOpenBookNode(nodeId);
      } catch {
        setActionMessage(props.t('desktop.importInventory.readwise.importFailed', { title: input.title }));
      } finally {
        setResettingNodeId(null);
        await props.refreshBooksInventory();
      }
    },
    [handleOpenBookNode, props.refreshBooksInventory, props.t]
  );

  return { actionMessage, handleOpenBookNode, handleReimportBook, resettingNodeId };
}
