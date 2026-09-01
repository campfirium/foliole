import type { AgentControlCapability } from '../agentControl/agentControlTypes.js';

export interface AideToolDefinition {
  capability: AgentControlCapability;
  description: string;
  inputSchema: Record<string, unknown>;
  path: string;
}

const OBJECT = { additionalProperties: false, type: 'object' } as const;
const STRING = { minLength: 1, type: 'string' } as const;
const TEXT = { type: 'string' } as const;
const NULLABLE_STRING = { minLength: 1, type: ['string', 'null'] } as const;
const IDS = { items: STRING, minItems: 1, type: 'array', uniqueItems: true } as const;
const LIMIT = { minimum: 1, type: 'integer' } as const;

function schema(
  properties: Record<string, unknown>,
  required: string[] = [],
  extra: Record<string, unknown> = {}
) {
  return { ...OBJECT, ...extra, properties, ...(required.length ? { required } : {}) };
}

export const AIDE_TOOL_REGISTRY: Record<string, AideToolDefinition> = {
  read_material: tool('materials.read', 'Read one Foliole Topic, Folder, or Item by id.', 'materials/read',
    schema({ id: STRING }, ['id'])),
  search_materials: tool('materials.search', 'Search readable Foliole Topics and Folders.', 'materials/search',
    schema({ limit: LIMIT, query: STRING }, ['query'])),
  list_folder: tool('materials.listChildren', 'List the direct Topics and Folders in a Foliole Folder or at the workspace root.', 'materials/list-children',
    schema({ limit: LIMIT, parent_id: NULLABLE_STRING })),
  create_material: tool('materials.create', 'Create a Foliole Topic, Folder, or question-answer Item only when the user explicitly asks to save one.', 'materials/create',
    schema({ content: TEXT, kind: { enum: ['folder', 'item', 'topic'], type: 'string' }, parent_id: NULLABLE_STRING, reveal: TEXT, title: STRING }, [], {
      oneOf: [
        { not: { required: ['title'] }, properties: { kind: { const: 'item' } }, required: ['content', 'kind', 'parent_id', 'reveal'] },
        { not: { required: ['reveal'] }, properties: { kind: { enum: ['folder', 'topic'] } }, required: ['kind', 'parent_id', 'title'] }
      ]
    })),
  move_material: tool('materials.move', 'Move a Foliole Topic, Folder, or Item.', 'materials/move',
    schema({ expected_updated_at: STRING, id: STRING, parent_id: NULLABLE_STRING }, ['expected_updated_at', 'id', 'parent_id'])),
  reorder_materials: tool('materials.reorder', 'Set the order of all direct children in a Foliole Folder.', 'materials/reorder',
    schema({ material_ids: IDS, parent_id: NULLABLE_STRING }, ['material_ids', 'parent_id'])),
  restore_material: tool('materials.restore', 'Restore a Foliole Topic, Folder, or Item from trash.', 'materials/restore',
    schema({ expected_updated_at: STRING, id: STRING }, ['expected_updated_at', 'id'])),
  update_material: tool('materials.update', 'Update a Foliole Topic or Item, including an Item answer.', 'materials/update',
    schema({ content: TEXT, expected_updated_at: STRING, id: STRING, reveal: TEXT, title: TEXT }, ['expected_updated_at', 'id'], {
      anyOf: [{ required: ['content'] }, { required: ['reveal'] }, { required: ['title'] }]
    })),
  delete_material: tool('materials.deleteSoft', 'Move a Foliole Topic, Folder, or Item to trash.', 'materials/delete-soft',
    schema({ expected_updated_at: STRING, id: STRING }, ['expected_updated_at', 'id'])),
  list_virtual_folders: tool('virtualFolders.list', 'List Foliole virtual Folders.', 'virtual-folders/list',
    schema({ limit: LIMIT })),
  read_virtual_folder: tool('virtualFolders.read', 'Read one Foliole virtual Folder and its ordered Topics.', 'virtual-folders/read',
    schema({ id: STRING, limit: LIMIT }, ['id'])),
  create_virtual_folder: tool('virtualFolders.create', 'Create a Foliole virtual Folder.', 'virtual-folders/create',
    schema({ title: STRING }, ['title'])),
  add_virtual_folder_items: tool('virtualFolders.addItems', 'Add Topics to a Foliole virtual Folder.', 'virtual-folders/add-items',
    schema({ folder_id: STRING, material_ids: IDS }, ['folder_id', 'material_ids'])),
  remove_virtual_folder_items: tool('virtualFolders.removeItems', 'Remove Topics from a Foliole virtual Folder.', 'virtual-folders/remove-items',
    schema({ folder_id: STRING, material_ids: IDS }, ['folder_id', 'material_ids'])),
  reorder_virtual_folder_items: tool('virtualFolders.reorder', 'Set the Topic order in a Foliole virtual Folder.', 'virtual-folders/reorder',
    schema({ folder_id: STRING, material_ids: IDS }, ['folder_id', 'material_ids'])),
  update_virtual_folder: tool('virtualFolders.update', 'Rename a Foliole virtual Folder.', 'virtual-folders/update',
    schema({ expected_updated_at: STRING, id: STRING, title: STRING }, ['expected_updated_at', 'id', 'title'])),
  delete_virtual_folder: tool('virtualFolders.deleteSoft', 'Move a Foliole virtual Folder to trash.', 'virtual-folders/delete-soft',
    schema({ expected_updated_at: STRING, id: STRING }, ['expected_updated_at', 'id'])),
  restore_virtual_folder: tool('virtualFolders.restore', 'Restore a Foliole virtual Folder from trash.', 'virtual-folders/restore',
    schema({ expected_updated_at: STRING, id: STRING }, ['expected_updated_at', 'id']))
};

function tool(
  capability: AgentControlCapability,
  description: string,
  path: string,
  inputSchema: Record<string, unknown>
): AideToolDefinition {
  return { capability, description, inputSchema, path };
}
