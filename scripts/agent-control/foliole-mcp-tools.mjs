const MCP_TOOL_DEFINITIONS = [
  {
    description: 'Check whether the Foliole Agent Control API is reachable.',
    inputSchema: { additionalProperties: false, properties: {}, type: 'object' },
    name: 'foliole_health',
    title: 'Foliole health'
  },
  {
    description: 'List capabilities enabled for the current Agent Control session.',
    inputSchema: { additionalProperties: false, properties: {}, type: 'object' },
    name: 'foliole_capabilities',
    title: 'Foliole capabilities'
  },
  {
    capability: 'materials.search',
    description: 'Search readable Foliole materials by query. Results include ids, titles, excerpts, match/source metadata, parent_titles for node path disambiguation, anchor_kind/special_kind material identity when available, and source.readable_material_id when foliole_materials_read can open the result.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        limit: { description: 'Maximum result count.', minimum: 1, type: 'number' },
        query: { description: 'Search query text.', minLength: 1, type: 'string' }
      },
      required: ['query'],
      type: 'object'
    },
    name: 'foliole_materials_search',
    title: 'Search Foliole materials'
  },
  {
    capability: 'materials.listChildren',
    description: 'List direct Foliole material children. Omit parent_id to list workspace top-level materials; pass a folder/topic id to list its direct children. When parent_id is provided, returns parent metadata with id/title/kind/special_kind/parent_titles for path and identity checks. Child summaries may include anchor_kind and special_kind material identity.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        limit: { description: 'Maximum child count.', minimum: 1, type: 'number' },
        parent_id: { description: 'Optional Foliole parent material id. Omit for workspace top-level materials.', minLength: 1, type: 'string' }
      },
      type: 'object'
    },
    name: 'foliole_materials_list_children',
    title: 'List Foliole material children'
  },
  {
    capability: 'materials.read',
    description: 'Read a Foliole material by id. Returns bounded content, parent_titles, material identity fields such as anchor_kind/special_kind, and direct child summaries for folder-style follow-up reads.',
    inputSchema: {
      additionalProperties: false,
      properties: { id: { description: 'Foliole material id from the active context or search results.', minLength: 1, type: 'string' } },
      required: ['id'],
      type: 'object'
    },
    name: 'foliole_materials_read',
    title: 'Read Foliole material'
  },
  {
    capability: 'virtualFolders.list',
    description: 'List Foliole virtual folders. Virtual folders are user- or agent-curated material sets, separate from the source material tree.',
    inputSchema: {
      additionalProperties: false,
      properties: { limit: { description: 'Maximum virtual folder count.', minimum: 1, type: 'number' } },
      type: 'object'
    },
    name: 'foliole_virtual_folders_list',
    title: 'List Foliole virtual folders'
  },
  {
    capability: 'virtualFolders.read',
    description: 'Read a Foliole virtual folder by id. Returns folder metadata plus ordered material items with item ids and material ids.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        id: { description: 'Foliole virtual folder id from foliole_virtual_folders_list.', minLength: 1, type: 'string' },
        limit: { description: 'Maximum item count.', minimum: 1, type: 'number' }
      },
      required: ['id'],
      type: 'object'
    },
    name: 'foliole_virtual_folders_read',
    title: 'Read Foliole virtual folder'
  }
];

export const MCP_TOOLS = publicTools(MCP_TOOL_DEFINITIONS);

export function listMcpToolsForCapabilities(capabilities) {
  if (!Array.isArray(capabilities)) return MCP_TOOLS;
  const enabled = new Set(capabilities);
  return publicTools(MCP_TOOL_DEFINITIONS.filter((tool) => !tool.capability || enabled.has(tool.capability)));
}

export function isMcpToolAvailable(name, capabilities) {
  if (!Array.isArray(capabilities)) return Boolean(TOOL_COMMANDS[name]);
  const tool = MCP_TOOL_DEFINITIONS.find((candidate) => candidate.name === name);
  return Boolean(tool && (!tool.capability || capabilities.includes(tool.capability)));
}

function publicTools(tools) {
  return tools.map((tool) => ({
    description: tool.description,
    inputSchema: tool.inputSchema,
    name: tool.name,
    title: tool.title
  }));
}

const TOOL_COMMANDS = {
  foliole_capabilities: { argv: () => ['capabilities'] },
  foliole_health: { argv: () => ['health'] },
  foliole_materials_list_children: { argv: (args) => listChildrenArgv(args) },
  foliole_materials_read: { argv: (args) => requireArgs(args, ['id'], () => ['materials/read', '--id', args.id]) },
  foliole_materials_search: { argv: (args) => requireArgs(args, ['query'], () => searchArgv(args)) },
  foliole_virtual_folders_list: { argv: (args) => virtualFolderListArgv(args) },
  foliole_virtual_folders_read: { argv: (args) => requireArgs(args, ['id'], () => virtualFolderReadArgv(args)) }
};

export function buildMcpToolArgv(name, args = {}) {
  const tool = TOOL_COMMANDS[name];
  if (!tool) return { error: 'unknown_tool', ok: false };
  return tool.argv(args);
}

function requireArgs(args, names, build) {
  for (const name of names) {
    if (typeof args[name] !== 'string' || args[name].length === 0) return { error: `missing_${name}`, ok: false };
  }
  return { argv: build(), ok: true };
}

function searchArgv(args) {
  const argv = ['materials/search', '--query', args.query];
  if (args.limit !== undefined) argv.push('--limit', String(args.limit));
  return argv;
}

function listChildrenArgv(args) {
  const argv = ['materials/list-children'];
  if (args.parent_id !== undefined) {
    if (typeof args.parent_id !== 'string' || args.parent_id.length === 0) return { error: 'missing_parent_id', ok: false };
    argv.push('--parent-id', args.parent_id);
  }
  if (args.limit !== undefined) argv.push('--limit', String(args.limit));
  return { argv, ok: true };
}

function virtualFolderListArgv(args) {
  const argv = ['virtual-folders/list'];
  if (args.limit !== undefined) argv.push('--limit', String(args.limit));
  return { argv, ok: true };
}

function virtualFolderReadArgv(args) {
  const argv = ['virtual-folders/read', '--id', args.id];
  if (args.limit !== undefined) argv.push('--limit', String(args.limit));
  return argv;
}
