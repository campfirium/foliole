import type { AgentControlCapability } from '../agentControl/agentControlTypes.js';

export interface AideToolDefinition {
  capability: AgentControlCapability;
  description: string;
  inputSchema: Record<string, unknown>;
  // Local tools run in the main process instead of through the Agent Control HTTP route.
  local?: boolean;
  mutates: boolean;
  path: string;
}

const OBJECT = { additionalProperties: false, type: 'object' } as const;
const STRING = { minLength: 1, type: 'string' } as const;
const TEXT = { type: 'string' } as const;
const NULLABLE_STRING = { minLength: 1, type: ['string', 'null'] } as const;
const IDS = { items: STRING, minItems: 1, type: 'array', uniqueItems: true } as const;
const LIMIT = { minimum: 1, type: 'integer' } as const;
const OFFSET = { minimum: 0, type: 'integer' } as const;

// What the model is shown. Codex renders a top-level oneOf/anyOf in place of the field list, so the model
// would see none of the fields; those rules are stated in the description and enforced on arrival.
export function modelFacingToolSchema(inputSchema: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(inputSchema).filter(([key]) => key !== 'anyOf' && key !== 'oneOf'));
}

function schema(
  properties: Record<string, unknown>,
  required: string[] = [],
  extra: Record<string, unknown> = {}
) {
  return { ...OBJECT, ...extra, properties, ...(required.length ? { required } : {}) };
}

export const AIDE_TOOL_REGISTRY: Record<string, AideToolDefinition> = {
  read_material: localTool('Read one Foliole Topic, Folder, or Item by id, within the places the AI permissions open. Long text comes in segments: pass offset (a character position, from 0) and length to continue where content_end stopped.',
    schema({ id: STRING, length: LIMIT, offset: OFFSET }, ['id'])),
  search_in_material: localTool('Find text inside one Foliole material (a PDF searches its pages). Returns each match with its character position or PDF page.',
    schema({ id: STRING, limit: LIMIT, query: STRING }, ['id', 'query'])),
  trace_source: localTool('Get the Base Topic a derived Topic or Item came from: its id, title, folder path, where the derived material sits in it, the quoted text of each excerpt in between, and every material derived from that Base Topic. Those materials can be read and searched by id when the AI permissions open them.',
    schema({ id: STRING }, ['id'])),
  read_external_document: localTool('Read an External document (a file outside the library that Foliole searches) by the path a search returned. Long text comes in segments: pass offset and length to continue where content_end stopped.',
    schema({ length: LIMIT, offset: OFFSET, path: STRING }, ['path'])),
  read_pdf_page: localTool('Read the text of one page of the PDF attached to a Foliole material.',
    schema({ id: STRING, page: LIMIT }, ['id', 'page'])),
  search_materials: tool('materials.search', 'Search Foliole Topics, Folders, PDFs and External documents. An External hit has source.kind external and its file path as id; read it with read_external_document.', 'materials/search',
    schema({ limit: LIMIT, query: STRING }, ['query'])),
  list_folder: tool('materials.listChildren', 'List the direct Topics and Folders in a Foliole Folder, or the top-level Folders and Topics of Home when parent_id is null.', 'materials/list-children',
    schema({ limit: LIMIT, parent_id: NULLABLE_STRING })),
  list_trash: tool('materials.listTrash', 'Find restorable materials in the Foliole Trash.', 'materials/list-trash',
    schema({ limit: LIMIT, offset: { minimum: 0, type: 'integer' }, query: STRING })),
  create_text_excerpt: tool('materials.createTextExcerpt', 'Create an anchored excerpt from a Topic using offsets in its stored Markdown.', 'materials/create-text-excerpt',
    schema({ source_id: STRING, expected_updated_at: STRING, from: { minimum: 0, type: 'integer' },
      to: LIMIT }, ['source_id', 'expected_updated_at', 'from', 'to'])),
  create_material: tool('materials.create', 'Create a Foliole Topic, Folder, or question-answer Item only when the user explicitly asks to save one. For a topic or folder pass kind, parent_id and title (content is optional), without reveal. For an item pass kind, parent_id, content (the question) and reveal (the answer), without title. parent_id is null for Home.', 'materials/create',
    schema({ content: TEXT, kind: { enum: ['folder', 'item', 'topic'], type: 'string' }, parent_id: NULLABLE_STRING, reveal: TEXT, title: STRING }, ['kind', 'parent_id'], {
      oneOf: [
        { not: { required: ['title'] }, properties: { kind: { const: 'item' } }, required: ['content', 'reveal'] },
        { not: { required: ['reveal'] }, properties: { kind: { enum: ['folder', 'topic'] } }, required: ['title'] }
      ]
    })),
  move_material: tool('materials.move', 'Move a Foliole Topic, Folder, or Item.', 'materials/move',
    schema({ expected_updated_at: STRING, id: STRING, parent_id: NULLABLE_STRING }, ['expected_updated_at', 'id', 'parent_id'])),
  reorder_materials: tool('materials.reorder', 'Set the order of all direct children in a Foliole Folder.', 'materials/reorder',
    schema({ material_ids: IDS, parent_id: NULLABLE_STRING }, ['material_ids', 'parent_id'])),
  restore_material: tool('materials.restore', 'Restore a Foliole Topic, Folder, or Item from trash.', 'materials/restore',
    schema({ expected_updated_at: STRING, id: STRING }, ['expected_updated_at', 'id'])),
  update_material: tool('materials.update', 'Update a Foliole Topic, Item, or Folder: body text, title, an Item answer, or a Folder name. Pass at least one of content, title, or reveal.', 'materials/update',
    schema({ content: TEXT, expected_updated_at: STRING, id: STRING, reveal: TEXT, title: TEXT }, ['expected_updated_at', 'id'], {
      anyOf: [{ required: ['content'] }, { required: ['reveal'] }, { required: ['title'] }]
    })),
  delete_material: tool('materials.deleteSoft', 'Move a Foliole Topic, Folder, or Item to trash.', 'materials/delete-soft',
    schema({ expected_updated_at: STRING, id: STRING }, ['expected_updated_at', 'id'])),
  list_virtual_folders: tool('virtualFolders.list', 'List Foliole Virtual indexes (manual lists of Topics, shown under Virtual).', 'virtual-folders/list',
    schema({ limit: LIMIT })),
  read_virtual_folder: tool('virtualFolders.read', 'Read one Foliole Virtual index and its ordered Topics.', 'virtual-folders/read',
    schema({ id: STRING, limit: LIMIT }, ['id'])),
  create_virtual_folder: tool('virtualFolders.create', 'Create a Foliole Virtual index.', 'virtual-folders/create',
    schema({ title: STRING }, ['title'])),
  add_virtual_folder_items: tool('virtualFolders.addItems', 'Add Topics to a Foliole Virtual index.', 'virtual-folders/add-items',
    schema({ folder_id: STRING, material_ids: IDS }, ['folder_id', 'material_ids'])),
  remove_virtual_folder_items: tool('virtualFolders.removeItems', 'Remove Topics from a Foliole Virtual index.', 'virtual-folders/remove-items',
    schema({ folder_id: STRING, material_ids: IDS }, ['folder_id', 'material_ids'])),
  reorder_virtual_folder_items: tool('virtualFolders.reorder', 'Set the Topic order in a Foliole Virtual index.', 'virtual-folders/reorder',
    schema({ folder_id: STRING, material_ids: IDS }, ['folder_id', 'material_ids'])),
  update_virtual_folder: tool('virtualFolders.update', 'Rename a Foliole Virtual index.', 'virtual-folders/update',
    schema({ expected_updated_at: STRING, id: STRING, title: STRING }, ['expected_updated_at', 'id', 'title'])),
  delete_virtual_folder: tool('virtualFolders.deleteSoft', 'Move a Foliole Virtual index to Trash.', 'virtual-folders/delete-soft',
    schema({ expected_updated_at: STRING, id: STRING }, ['expected_updated_at', 'id'])),
  restore_virtual_folder: tool('virtualFolders.restore', 'Restore a Foliole Virtual index from Trash.', 'virtual-folders/restore',
    schema({ expected_updated_at: STRING, id: STRING }, ['expected_updated_at', 'id'])),
  list_dives: localTool('List Foliole Dives (topic collections that gather Topics and Folders without moving them) with their direct source ids.',
    schema({}), 'virtualFolders.list'),
  create_dive: localTool('Create a Foliole Dive, optionally with source Topics or Folders.',
    schema({ source_ids: { items: STRING, type: 'array', uniqueItems: true }, title: STRING }, ['title']), 'virtualFolders.create', true),
  rename_dive: localTool('Rename a Foliole Dive.',
    schema({ id: STRING, title: STRING }, ['id', 'title']), 'virtualFolders.update', true),
  add_dive_sources: localTool('Add Topics or Folders to a Foliole Dive.',
    schema({ id: STRING, source_ids: IDS }, ['id', 'source_ids']), 'virtualFolders.addItems', true),
  remove_dive_sources: localTool('Remove Topics or Folders from a Foliole Dive; the materials themselves stay where they are.',
    schema({ id: STRING, source_ids: IDS }, ['id', 'source_ids']), 'virtualFolders.removeItems', true)
};

// Dive tools borrow the virtual Folder capabilities: a Dive is a virtual Folder of sources.
function localTool(
  description: string,
  inputSchema: Record<string, unknown>,
  capability: AgentControlCapability = 'materials.read',
  mutates = false
): AideToolDefinition {
  return { capability, description, inputSchema, local: true, mutates, path: '' };
}

function tool(
  capability: AgentControlCapability,
  description: string,
  path: string,
  inputSchema: Record<string, unknown>,
  mutates = !['materials.read', 'materials.search', 'materials.listChildren', 'materials.listTrash', 'virtualFolders.list', 'virtualFolders.read']
    .includes(capability)
): AideToolDefinition {
  return { capability, description, inputSchema, mutates, path };
}
