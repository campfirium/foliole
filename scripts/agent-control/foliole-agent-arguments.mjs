export function buildAgentCliBody(command, flags) {
  if (command === 'health' || command === 'capabilities') return { body: null, ok: true };
  if (command === 'materials/create') return buildMaterialCreateBody(flags);
  if (command === 'materials/list-children') return requireFields(flags, [], ['parent_id', 'limit']);
  if (command === 'materials/move') return requireFields(flags, ['id', 'parent_id', 'expected_updated_at']);
  if (command === 'materials/read') return requireFields(flags, ['id']);
  if (command === 'materials/search') return requireFields(flags, ['query'], ['limit']);
  if (command === 'materials/reorder') return buildMaterialReorderBody(flags);
  if (command === 'materials/restore') return requireFields(flags, ['id', 'expected_updated_at']);
  if (command === 'materials/update') return buildUpdateBody(flags);
  if (command === 'materials/delete-soft') return requireFields(flags, ['id'], ['expected_updated_at']);
  if (command === 'virtual-folders/list') return requireFields(flags, [], ['limit']);
  if (command === 'virtual-folders/read') return requireFields(flags, ['id'], ['limit']);
  if (command === 'virtual-folders/create') return requireFields(flags, ['title']);
  if (command === 'virtual-folders/delete-soft' || command === 'virtual-folders/restore') {
    return requireFields(flags, ['id', 'expected_updated_at']);
  }
  if (command === 'virtual-folders/reorder') return buildVirtualFolderReorderBody(flags);
  if (command === 'virtual-folders/update') return buildVirtualFolderUpdateBody(flags);
  return requireFields(flags, ['folder_id', 'material_ids']);
}

function buildMaterialCreateBody(flags) {
  const result = requireFields(flags, ['kind', 'title'], ['content', 'parent_id']);
  return result.ok ? { body: { parent_id: null, ...result.body }, ok: true } : result;
}

function buildMaterialReorderBody(flags) {
  const result = requireFields(flags, ['material_ids'], ['parent_id']);
  return result.ok ? { body: { parent_id: null, ...result.body }, ok: true } : result;
}

function buildVirtualFolderUpdateBody(flags) {
  return requireFields(flags, ['id', 'expected_updated_at', 'title']);
}

function buildVirtualFolderReorderBody(flags) {
  const base = requireFields(flags, ['folder_id']);
  if (!base.ok) return base;
  if (flags.material_ids) return { body: { ...base.body, material_ids: normalizeFieldValue('material_ids', flags.material_ids) }, ok: true };
  return { error: 'missing_material_ids', ok: false, statusCode: 2 };
}

function requireFields(flags, required, optional = []) {
  const body = {};
  for (const field of required) {
    if (!flags[field]) return { error: `missing_${field}`, ok: false, statusCode: 2 };
    body[field] = normalizeFieldValue(field, flags[field]);
  }
  for (const field of optional) {
    if (flags[field]) body[field] = normalizeFieldValue(field, flags[field]);
  }
  return { body, ok: true };
}

function buildUpdateBody(flags) {
  const base = requireFields(flags, ['id', 'expected_updated_at']);
  if (!base.ok) return base;
  if (!flags.title && !Object.hasOwn(flags, 'content')) return { error: 'missing_patch', ok: false, statusCode: 2 };
  return { body: { ...base.body, ...(flags.title ? { title: flags.title } : {}), ...(Object.hasOwn(flags, 'content') ? { content: flags.content } : {}) }, ok: true };
}

function normalizeFieldValue(field, value) {
  if (field === 'limit') return Number(value);
  if (field === 'material_ids') return value.split(',').map((item) => item.trim()).filter(Boolean);
  if (field === 'parent_id' && value === 'root') return null;
  return value;
}
