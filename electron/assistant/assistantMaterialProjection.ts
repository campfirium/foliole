import type { NativeAssistantWorkspaceContext } from '../../lib/platform/nativeAssistantContract.js';

export function formatCodexMaterialProjection(context: NativeAssistantWorkspaceContext) {
  return [
    ...(context.activeKind ? [`- Active Foliole object type: ${context.activeKind}.`] : []),
    ...(context.activeSpecialKind ? [`- Active Foliole special entry: ${context.activeSpecialKind}.`] : []),
    ...(context.activeNodeId ? [`- Active Foliole material id: ${context.activeNodeId}.`] : []),
    ...(context.activeParentNodeId ? [`- Active Foliole parent material id: ${context.activeParentNodeId}.`] : []),
    ...(context.activeTitle ? [`- Active title: ${context.activeTitle}.`] : []),
    ...(context.path?.length ? [`- Active path: ${context.path.join(' / ')}.`] : []),
    ...formatScopeGuidance(context, true),
    ...formatAnchorContext(context),
    ...formatDocumentContext(context),
    ...formatSelectionContext(context),
    ...formatFolderContext(context),
    ...formatParentFolderContext(context)
  ];
}

export function formatToolFreeMaterialProjection(context?: NativeAssistantWorkspaceContext) {
  if (!context) return '';
  return [
    'Current Foliole material:',
    `- Scope: ${context.scope}.`,
    ...(context.activeKind ? [`- Object type: ${context.activeKind}.`] : []),
    ...(context.activeSpecialKind ? [`- Special entry: ${context.activeSpecialKind}.`] : []),
    ...(context.activeTitle ? [`- Title: ${context.activeTitle}.`] : []),
    ...(context.path?.length ? [`- Path: ${context.path.join(' / ')}.`] : []),
    ...formatScopeGuidance(context, false),
    ...formatAnchorContext(context),
    ...formatDocumentContext(context),
    ...formatSelectionContext(context),
    ...formatFolderContext(context),
    ...formatParentFolderContext(context)
  ].join('\n');
}

function formatScopeGuidance(context: NativeAssistantWorkspaceContext, codex: boolean) {
  const lines = codex
    ? ['- Treat this packet as the current Foliole working context, not as the development repository context.']
    : ['- Treat this as the current Foliole material, not as development repository context.'];
  if (context.scope === 'node') {
    lines.push('- By default, answer as if the user is asking about the active Foliole topic or folder unless they name a broader scope.');
  } else {
    lines.push('- By default, answer as if the user is asking about the Foliole workspace as a whole.');
  }
  if (context.selection) {
    lines.push('- If a selection is present, treat it as the most specific focus for explain, rewrite, summarize, or edit-style questions.');
  }
  if (context.folder) {
    if (context.scope === 'workspace') {
      lines.push('- The included direct topics and folders are workspace-level top-level Foliole materials.');
    }
    lines.push(codex
      ? '- For Folder questions, use the included direct Topics and Folders first; when the list is truncated or details are needed, use the available Foliole actions.'
      : '- For Folder questions, use the included direct Topics and Folders; say when the included list is insufficient.');
  }
  if (context.parentFolder) {
    lines.push('- The included parent-folder entries are the active material directory siblings; use them for nearby-material questions before broad search.');
  }
  if (context.document?.preview) {
    lines.push('- The included document preview is authoritative for the visible active topic, but it may be truncated.');
  }
  return lines;
}

function formatAnchorContext(context: NativeAssistantWorkspaceContext) {
  if (!context.anchor) return [];
  const lines = [`- Active Foliole anchor: ${context.anchor.kind}, id=${context.anchor.id}.`];
  if (context.anchor.parentNodeId) lines.push(`- Anchor parent material id: ${context.anchor.parentNodeId}.`);
  if (context.anchor.parentTitle) lines.push(`- Anchor parent title: ${context.anchor.parentTitle}.`);
  if (context.anchor.page) lines.push(`- Anchor page: ${context.anchor.page}.`);
  if (context.anchor.text) lines.push('- Anchor text:', context.anchor.text);
  return lines;
}

function formatDocumentContext(context: NativeAssistantWorkspaceContext) {
  if (!context.document) return [];
  const lines = [
    `- Active Foliole document body status: ${context.document.bodyStatus}${typeof context.document.charCount === 'number' ? `, ${context.document.charCount} chars` : ''}.`
  ];
  if (context.document.preview) {
    lines.push(
      `- Active Foliole document body preview${context.document.truncated ? ' (truncated)' : ''}:`,
      context.document.preview
    );
  }
  return lines;
}

function formatSelectionContext(context: NativeAssistantWorkspaceContext) {
  if (!context.selection) return [];
  return [
    `- Current editor selection${context.selection.truncated ? ' (truncated)' : ''}, ${context.selection.charCount} chars:`,
    context.selection.text
  ];
}

function formatFolderContext(context: NativeAssistantWorkspaceContext) {
  if (!context.folder) return [];
  const lines = [
    `- Direct Foliole children: ${context.folder.children.length} of ${context.folder.childCount}${context.folder.truncated ? ' shown' : ''}.`
  ];
  for (const child of context.folder.children) {
    const meta = [child.kind, `id=${child.nodeId}`];
    if (child.specialKind) meta.push(`special=${child.specialKind}`);
    if (child.anchorKind) meta.push(`anchor=${child.anchorKind}`);
    lines.push(`  - ${child.title} [${meta.join(', ')}]${child.preview ? `: ${child.preview}` : ''}`);
  }
  return lines;
}

function formatParentFolderContext(context: NativeAssistantWorkspaceContext) {
  if (!context.parentFolder) return [];
  const lines = [
    `- Parent Foliole folder entries: ${context.parentFolder.children.length} of ${context.parentFolder.childCount}${context.parentFolder.truncated ? ' shown' : ''}.`
  ];
  for (const child of context.parentFolder.children) {
    const meta = [child.kind, `id=${child.nodeId}`];
    if (child.isActive) meta.push('active');
    if (child.specialKind) meta.push(`special=${child.specialKind}`);
    if (child.anchorKind) meta.push(`anchor=${child.anchorKind}`);
    lines.push(`  - ${child.title} [${meta.join(', ')}]${child.preview ? `: ${child.preview}` : ''}`);
  }
  return lines;
}
