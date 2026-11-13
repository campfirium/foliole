export function buildAgentCliBody(command, flags) {
  if (command === 'health' || command === 'capabilities') return { body: null, ok: true };
  if (command === 'materials/create') return buildMaterialCreateBody(flags);
  if (command === 'materials/list-children') return requireFields(flags, [], ['parent_id', 'limit', 'offset']);
  if (command === 'materials/move') return requireFields(flags, ['id', 'parent_id', 'expected_updated_at']);
  if (command === 'materials/read') return buildMaterialReadBody(flags);
  if (command === 'materials/search') return requireFields(flags, ['query'], ['limit', 'offset']);
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

function buildMaterialReadBody(flags) {
  const mode = flags.content_mode;
  if (mode !== undefined && mode !== 'preview' && mode !== 'full') {
    return { error: 'invalid_content_mode', ok: false, statusCode: 2 };
  }
  if (flags.include_learning !== undefined && !['true', 'false'].includes(flags.include_learning)) {
    return { error: 'invalid_include_learning', ok: false, statusCode: 2 };
  }
  if (flags.include_relations !== undefined && !['true', 'false'].includes(flags.include_relations)) {
    return { error: 'invalid_include_relations', ok: false, statusCode: 2 };
  }
  return requireFields(flags, ['id'], ['content_mode', 'include_learning', 'include_relations']);
}

function buildMaterialCreateBody(flags) {
  const required = flags.kind === 'item' ? ['kind', 'content', 'reveal'] : ['kind', 'title'];
  const optional = flags.kind === 'item' ? ['parent_id'] : ['content', 'parent_id'];
  const result = requireFields(flags, required, optional);
  if (!result.ok) return result;
  const body = { parent_id: null, ...result.body };
  for (const field of ['reading_schedule', 'review_schedule']) {
    if (!Object.hasOwn(flags, field)) continue;
    try {
      body[field] = JSON.parse(flags[field]);
    } catch {
      return { error: `invalid_${field}`, ok: false, statusCode: 2 };
    }
  }
  return { body, ok: true };
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
  if (!flags.title && !flags.reveal && !Object.hasOwn(flags, 'content')) return { error: 'missing_patch', ok: false, statusCode: 2 };
  return { body: { ...base.body, ...(flags.title ? { title: flags.title } : {}), ...(flags.reveal ? { reveal: flags.reveal } : {}), ...(Object.hasOwn(flags, 'content') ? { content: flags.content } : {}) }, ok: true };
}

function normalizeFieldValue(field, value) {
  if (field === 'include_learning' || field === 'include_relations') return value === 'true';
  if (field === 'limit') return Number(value);
  if (field === 'offset') return /^\d+$/u.test(value) ? Number(value) : null;
  if (field === 'material_ids') return value.split(',').map((item) => item.trim()).filter(Boolean);
  if (field === 'parent_id' && value === 'root') return null;
  return value;
}
