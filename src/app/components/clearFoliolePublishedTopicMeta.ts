import { removeFolioleWebBinding } from '../../../lib/core/foliolePublish/folioleWebPublishFrontmatter';
import { createEditorTextReplaySave } from '../../features/editor/model/editorTextReplaySave';
import { loadWorkspaceNodeDocumentFromRuntime } from '../../shared/platform/workspaceRuntimeDocumentRepository';
import { useWorkspaceStore } from '../../store/workspaceStore';

export async function clearFoliolePublishedTopicMeta(
  nodeIds: readonly string[], libraryScope: string | undefined, failureMessage: string
) {
  if (useWorkspaceStore.getState().libraryScope !== libraryScope) throw new Error(failureMessage);
  for (const nodeId of nodeIds) {
    const document = await loadWorkspaceNodeDocumentFromRuntime(nodeId);
    if (useWorkspaceStore.getState().libraryScope !== libraryScope) throw new Error(failureMessage);
    if (!document) {
      if (useWorkspaceStore.getState().nodesById[nodeId]) throw new Error(failureMessage);
      continue;
    }
    const content = removeFolioleWebBinding(document.content);
    if (content === document.content) continue;
    let reportFailure!: (saved: boolean) => void;
    const failed = new Promise<boolean>(resolve => { reportFailure = resolve; });
    const historySave = createEditorTextReplaySave(() => reportFailure(false));
    const accepted = await useWorkspaceStore.getState().updateNodeContent(nodeId, content, {
      historySave,
      baseContent: document.content,
      baseVersionId: document.currentVersionId ?? null,
      preserveTitle: true
    });
    if (!accepted || historySave.status === 'unbound' || !await Promise.race([historySave.completion, failed])
      || useWorkspaceStore.getState().libraryScope !== libraryScope) {
      throw new Error(failureMessage);
    }
  }
}
