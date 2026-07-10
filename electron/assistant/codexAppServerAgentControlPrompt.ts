import type { NativeAssistantWorkspaceContext } from '../../lib/platform/nativeAssistantContract.js';

export function formatAgentControlContext(context: NativeAssistantWorkspaceContext) {
  if (!context.agentControl) return [];
  const canRead = hasAgentControlCapability(context, 'materials.read');
  const canSearch = hasAgentControlCapability(context, 'materials.search');
  const canListChildren = hasAgentControlCapability(context, 'materials.listChildren');
  const canListVirtualFolders = hasAgentControlCapability(context, 'virtualFolders.list');
  const canReadVirtualFolders = hasAgentControlCapability(context, 'virtualFolders.read');
  const lines = [
    `- Local Agent Control API state: ${context.agentControl.state}.`,
    `- Agent Control enabled capabilities: ${context.agentControl.capabilities.length ? context.agentControl.capabilities.join(', ') : 'none'}.`,
    `- Agent Control descriptor env var: ${context.agentControl.descriptorEnvVar}.`,
    `- Agent Control descriptor path: ${context.agentControl.descriptorPath}.`
  ];
  if (context.agentControl.cliPath) lines.push(`- Agent Control CLI path: ${context.agentControl.cliPath}.`);
  if (context.agentControl.tracePath) lines.push(`- Agent Control MCP trace path: ${context.agentControl.tracePath}.`);
  if (context.agentControl.endpoint) lines.push(`- Agent Control endpoint: ${context.agentControl.endpoint}.`);
  if (context.agentControl.state !== 'running') {
    lines.push('- Agent Control is not running for this turn; do not claim access to Foliole content that was not included in the context packet.');
    return lines;
  }
  lines.push(...formatAvailableToolGuidance(context, {
    canListChildren,
    canListVirtualFolders,
    canRead,
    canReadVirtualFolders,
    canSearch
  }));
  lines.push(...formatMissingCapabilityGuidance({
    canListChildren,
    canListVirtualFolders,
    canRead,
    canReadVirtualFolders,
    canSearch
  }));
  lines.push('- Do not call Agent Control write routes unless the user explicitly asks to change Foliole data; read-only MCP tools cannot update, delete, or create Foliole materials.');
  return lines;
}

interface AgentControlPromptCapabilities {
  canListChildren: boolean;
  canListVirtualFolders: boolean;
  canRead: boolean;
  canReadVirtualFolders: boolean;
  canSearch: boolean;
}

function formatAvailableToolGuidance(
  context: NativeAssistantWorkspaceContext,
  capabilities: AgentControlPromptCapabilities
) {
  const lines = [
    '- Agent Control MCP tools are expected as foliole_health, foliole_capabilities, foliole_materials_search, foliole_materials_list_children, foliole_materials_read, foliole_virtual_folders_list, and foliole_virtual_folders_read.',
    '- MCP exposes only discovery and read tools; enabled write capabilities in the descriptor do not mean write tools are available through MCP.',
    '- MCP tool calls are recorded in the local trace path for diagnostics; do not treat the trace file itself as Foliole content.'
  ];
  if (capabilities.canListChildren) {
    lines.push('- foliole_materials_list_children lists direct child materials; omit parent_id to inspect workspace top-level materials, or pass a material id to inspect that folder/topic; when parent_id is provided, use parent.id/title/kind/special_kind/parent_titles to verify which folder or topic was listed.');
  }
  if (capabilities.canSearch) {
    lines.push('- foliole_materials_search returns bounded results with ids, titles, excerpts, source, match data, parent_titles for node path disambiguation, anchor_kind/special_kind material identity, and source.readable_material_id when a result can be opened with foliole_materials_read.');
  }
  if (capabilities.canRead) lines.push(...formatMaterialReadGuidance(context));
  if (capabilities.canListVirtualFolders) {
    lines.push('- foliole_virtual_folders_list lists user- or agent-curated material sets that may be more relevant than raw workspace search for collection-oriented questions.');
  }
  if (capabilities.canReadVirtualFolders) {
    lines.push('- foliole_virtual_folders_read returns ordered virtual folder items with item ids and material ids; read material ids with foliole_materials_read when content detail is needed.');
  }
  lines.push(...formatUsageStrategyGuidance(context, capabilities));
  lines.push('- Treat anchor_kind=highlight/cloze as derived Topic identity and special_kind as Home/Inbox/Trash/Virtual entry identity when interpreting Agent Control results.');
  return lines;
}

function formatUsageStrategyGuidance(
  context: NativeAssistantWorkspaceContext,
  capabilities: AgentControlPromptCapabilities
) {
  const lines: string[] = [];
  if (capabilities.canRead && capabilities.canSearch) {
    lines.push('- When the current context is broad or ambiguous, search first, compare parent_titles, then read the most relevant material ids.');
  }
  if (capabilities.canListChildren && context.scope === 'workspace') {
    lines.push('- For workspace-level questions about what exists here, list top-level materials before asking the user for folder names.');
  }
  if (capabilities.canListChildren && context.activeNodeId) {
    lines.push('- For folder-style questions about the current material, list children with parent_id set to the active material id when the included child list is missing or truncated.');
  }
  if (capabilities.canListChildren && context.activeParentNodeId) {
    lines.push('- For sibling or containing-folder questions, list children with parent_id set to the active parent material id from the context packet.');
  }
  if (Object.values(capabilities).some(Boolean)) {
    lines.push('- If MCP tools are unavailable, the descriptor also supports CLI/API read routes: materials/read with { id }, materials/search with { query, limit }, materials/list-children with optional { parent_id, limit }, virtual-folders/list with optional { limit }, and virtual-folders/read with { id, limit }.');
  }
  lines.push('- Descriptor write routes such as materials/update, materials/delete-soft, and virtual-folder mutations require an explicit user request to change Foliole data and must use their optimistic-locking and backup rules.');
  lines.push(`- When a write is explicitly requested and the matching capability is enabled, use the local CLI entrypoint \`node ${context.agentControl?.cliPath ?? '<cliPath>'} <route> --descriptor <descriptorPath> ...\`; successful write responses include backup_path for recovery evidence.`);
  lines.push('- If the local CLI entrypoint is unavailable in this turn, say the write cannot be performed instead of implying the read-only MCP tools can do it.');
  return lines;
}

function formatMissingCapabilityGuidance(capabilities: AgentControlPromptCapabilities) {
  const lines: string[] = [];
  if (!capabilities.canRead) lines.push('- materials.read is not enabled in this turn; do not try to read material ids beyond the included context.');
  if (!capabilities.canSearch) lines.push('- materials.search is not enabled in this turn; do not claim workspace-wide search results.');
  if (!capabilities.canListChildren) lines.push('- materials.listChildren is not enabled in this turn; do not claim workspace or folder child listings beyond the included context.');
  if (!capabilities.canListVirtualFolders) lines.push('- virtualFolders.list is not enabled in this turn; do not claim access to existing virtual folder lists.');
  if (!capabilities.canReadVirtualFolders) lines.push('- virtualFolders.read is not enabled in this turn; do not claim virtual folder item membership.');
  return lines;
}

function formatMaterialReadGuidance(context: NativeAssistantWorkspaceContext) {
  return [
    '- foliole_materials_read returns bounded material content, parent_id, parents, parent_titles, and direct child summaries; use child ids for follow-up reads instead of asking the user to paste folder contents.',
    '- When the user asks about sibling materials or what else is in the containing folder, use the active parent material id when present; otherwise read the active material first, then call foliole_materials_list_children with the returned parent_id.',
    context.anchor?.parentNodeId
      ? '- For active anchors, use foliole_materials_read with the parent material id when the user asks for source context.'
      : context.activeSpecialKind
      ? '- For active special entries, prefer the included direct children or search; use foliole_materials_read on child ids when the user asks for details.'
      : '- Use foliole_materials_read with the active material id when the user asks about the current topic or folder and the included preview is insufficient.'
  ];
}

function hasAgentControlCapability(context: NativeAssistantWorkspaceContext, capability: string) {
  return context.agentControl?.capabilities.includes(capability) ?? false;
}
