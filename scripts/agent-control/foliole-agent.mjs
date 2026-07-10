#!/usr/bin/env node
/* global console, fetch, process */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readAgentTrace } from './foliole-agent-trace.mjs';
import { writeAgentBackup } from './foliole-agent-write-backup.mjs';

const JSON_HEADERS = { 'content-type': 'application/json' };
const ROUTES = {
  capabilities: { method: 'GET', path: 'capabilities' },
  health: { auth: false, method: 'GET', path: 'health' },
  'materials/delete-soft': { capability: 'materials.deleteSoft', method: 'POST', path: 'materials/delete-soft', writeKind: 'material' },
  'materials/list-children': { capability: 'materials.listChildren', method: 'POST', path: 'materials/list-children' },
  'materials/read': { capability: 'materials.read', method: 'POST', path: 'materials/read' },
  'materials/search': { capability: 'materials.search', method: 'POST', path: 'materials/search' },
  'materials/update': { capability: 'materials.update', method: 'POST', path: 'materials/update', writeKind: 'material' },
  'virtual-folders/add-items': { capability: 'virtualFolders.addItems', method: 'POST', path: 'virtual-folders/add-items', writeKind: 'virtual_folder' },
  'virtual-folders/create': { capability: 'virtualFolders.create', method: 'POST', path: 'virtual-folders/create', writeKind: 'virtual_folder' },
  'virtual-folders/list': { capability: 'virtualFolders.list', method: 'POST', path: 'virtual-folders/list' },
  'virtual-folders/read': { capability: 'virtualFolders.read', method: 'POST', path: 'virtual-folders/read' },
  'virtual-folders/remove-items': { capability: 'virtualFolders.removeItems', method: 'POST', path: 'virtual-folders/remove-items', writeKind: 'virtual_folder' },
  'virtual-folders/reorder': { capability: 'virtualFolders.reorder', method: 'POST', path: 'virtual-folders/reorder', writeKind: 'virtual_folder' }
};

export async function runAgentCli(argv, options = {}) {
  const parsed = parseArgv(argv);
  if (!parsed.ok) return failure(parsed.error, parsed.statusCode);
  if (parsed.command === 'trace/read') return readAgentTrace(parsed.flags, options);
  const route = ROUTES[parsed.command];
  if (!route) return failure('unknown_command', 2);
  const descriptorResult = await readDescriptor(parsed.flags.descriptor, options);
  if (!descriptorResult.ok) return failure(descriptorResult.error, descriptorResult.statusCode);
  const descriptor = descriptorResult.descriptor;
  if (route.capability && !descriptor.capabilities?.includes(route.capability)) {
    return failure('capability_disabled', 3);
  }
  const bodyResult = buildBody(parsed.command, parsed.flags);
  if (!bodyResult.ok) return failure(bodyResult.error, bodyResult.statusCode);
  if (parsed.command === 'virtual-folders/reorder' && bodyResult.body.material_ids) {
    return runVirtualFolderReorderByMaterialIds(bodyResult.body, descriptor, parsed.flags, options);
  }
  if (route.writeKind === 'material') return runMaterialWriteCommand(parsed.command, bodyResult.body, descriptor, parsed.flags, options);
  if (route.writeKind === 'virtual_folder') return runVirtualFolderWriteCommand(parsed.command, bodyResult.body, descriptor, parsed.flags, options);
  return callApi(route, descriptor, bodyResult.body, options);
}

function parseArgv(argv) {
  const [command, ...tokens] = argv;
  if (!command) return { error: 'missing_command', ok: false, statusCode: 2 };
  try {
    return { command, flags: parseFlags(tokens), ok: true };
  } catch (error) {
    return { error: error.message, ok: false, statusCode: 2 };
  }
}

function parseFlags(tokens) {
  const flags = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token?.startsWith('--')) throw new Error('invalid_argument');
    const key = token.slice(2).replaceAll('-', '_');
    const value = tokens[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`missing_${key}`);
    flags[key] = value;
    index += 1;
  }
  return flags;
}

async function readDescriptor(flagPath, options) {
  const descriptorPath = flagPath ?? options.env?.FOLIOLE_AGENT_DESCRIPTOR ?? process.env.FOLIOLE_AGENT_DESCRIPTOR;
  if (!descriptorPath) return { error: 'descriptor_not_found', ok: false, statusCode: 3 };
  try {
    const descriptor = JSON.parse(await readFile(descriptorPath, 'utf8'));
    return isDescriptor(descriptor) ? { descriptor, ok: true } : { error: 'invalid_descriptor', ok: false, statusCode: 3 };
  } catch {
    return { error: 'descriptor_not_found', ok: false, statusCode: 3 };
  }
}

function isDescriptor(value) {
  return Boolean(value && typeof value === 'object' && typeof value.endpoint === 'string' &&
    typeof value.token === 'string' && Array.isArray(value.capabilities));
}

function buildBody(command, flags) {
  if (command === 'health' || command === 'capabilities') return { body: null, ok: true };
  if (command === 'materials/list-children') return requireFields(flags, [], ['parent_id', 'limit']);
  if (command === 'materials/read') return requireFields(flags, ['id']);
  if (command === 'materials/search') return requireFields(flags, ['query'], ['limit']);
  if (command === 'materials/update') return buildUpdateBody(flags);
  if (command === 'materials/delete-soft') return requireFields(flags, ['id'], ['expected_updated_at']);
  if (command === 'virtual-folders/list') return requireFields(flags, [], ['limit']);
  if (command === 'virtual-folders/read') return requireFields(flags, ['id'], ['limit']);
  if (command === 'virtual-folders/create') return requireFields(flags, ['title'], ['description']);
  if (command === 'virtual-folders/reorder') return buildVirtualFolderReorderBody(flags);
  return requireFields(flags, ['folder_id'], command.endsWith('add-items') ? ['material_ids'] : ['item_ids']);
}

function buildVirtualFolderReorderBody(flags) {
  const base = requireFields(flags, ['folder_id']);
  if (!base.ok) return base;
  if (flags.item_ids) return { body: { ...base.body, item_ids: normalizeFieldValue('item_ids', flags.item_ids) }, ok: true };
  if (flags.material_ids) return { body: { ...base.body, material_ids: normalizeFieldValue('material_ids', flags.material_ids) }, ok: true };
  return { error: 'missing_item_ids', ok: false, statusCode: 2 };
}

function requireFields(flags, required, optional = []) {
  const body = {};
  for (const field of required) {
    if (!flags[field]) return { error: `missing_${field}`, ok: false, statusCode: 2 };
    body[field] = flags[field];
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
  if (field === 'item_ids' || field === 'material_ids') return value.split(',').map((item) => item.trim()).filter(Boolean);
  return value;
}

async function runVirtualFolderReorderByMaterialIds(body, descriptor, flags, options) {
  const read = await callApi(ROUTES['virtual-folders/read'], descriptor, { id: body.folder_id }, options);
  if (read.status !== 0) return read;
  const itemIds = resolveReorderItemIds(read.output.items, body.material_ids);
  if (!itemIds.ok) return failure(itemIds.error, 2);
  const patch = { folder_id: body.folder_id, item_ids: itemIds.itemIds, material_ids: body.material_ids };
  const backup = await writeBackup('virtual-folders/reorder', 'virtual_folder', body.folder_id, read.output, patch, flags, options);
  if (!backup.ok) return failure(backup.error, 4);
  const result = await callApi(ROUTES['virtual-folders/reorder'], descriptor, { folder_id: body.folder_id, item_ids: itemIds.itemIds }, options);
  return { ...result, output: { ...result.output, backup_path: backup.path } };
}

function resolveReorderItemIds(items, materialIds) {
  if (!Array.isArray(items)) return { error: 'invalid_folder_items', ok: false };
  const byMaterialId = new Map(items.map((item) => [item?.material_id, item?.id]));
  const itemIds = [];
  for (const materialId of materialIds) {
    const itemId = byMaterialId.get(materialId);
    if (typeof itemId !== 'string') return { error: 'material_not_in_folder', ok: false };
    itemIds.push(itemId);
  }
  return { itemIds, ok: true };
}

async function runMaterialWriteCommand(command, body, descriptor, flags, options) {
  if (!descriptor.capabilities?.includes('materials.read')) {
    return failure('backup_capability_disabled', 3);
  }
  const materialId = body.id;
  const read = await callApi(ROUTES['materials/read'], descriptor, { id: materialId }, options);
  if (read.status !== 0) return read;
  const material = read.output.material;
  if (material?.content_truncated) return failure('backup_source_truncated', 4);
  const mutationBody = buildMaterialMutationBody(command, body, material);
  if (!mutationBody.ok) return failure(mutationBody.error, 4);
  const backup = await writeBackup(command, 'material', materialId, material, mutationBody.body, flags, options);
  if (!backup.ok) return failure(backup.error, 4);
  const result = await callApi(ROUTES[command], descriptor, mutationBody.body, options);
  return { ...result, output: { ...result.output, backup_path: backup.path } };
}

function buildMaterialMutationBody(command, body, material) {
  if (command !== 'materials/delete-soft' || body.expected_updated_at) return { body, ok: true };
  const expectedUpdatedAt = typeof material?.updated_at === 'string' ? material.updated_at.trim() : '';
  if (!expectedUpdatedAt) return { error: 'backup_source_missing_updated_at', ok: false };
  return { body: { ...body, expected_updated_at: expectedUpdatedAt }, ok: true };
}

async function runVirtualFolderWriteCommand(command, body, descriptor, flags, options) {
  const folderId = body.folder_id ?? 'new';
  if (body.folder_id && !descriptor.capabilities?.includes('virtualFolders.read')) {
    return failure('backup_capability_disabled', 3);
  }
  const previous = body.folder_id ? await callApi(ROUTES['virtual-folders/read'], descriptor, { id: body.folder_id }, options) : null;
  if (previous && previous.status !== 0) return previous;
  const backup = await writeBackup(command, 'virtual_folder', folderId, previous?.output ?? null, body, flags, options);
  if (!backup.ok) return failure(backup.error, 4);
  const result = await callApi(ROUTES[command], descriptor, body, options);
  return { ...result, output: { ...result.output, backup_path: backup.path } };
}

async function writeBackup(command, kind, targetId, previous, patch, flags, options) {
  return writeAgentBackup({ command, flags, kind, options, patch, previous, targetId });
}

async function callApi(route, descriptor, body, options) {
  const url = `${descriptor.endpoint.replace(/\/$/u, '')}/agent-control/v1/${route.path}`;
  let response;
  try {
    response = await (options.fetch ?? fetch)(url, {
      body: route.method === 'GET' ? undefined : JSON.stringify(body ?? {}),
      headers: route.auth === false ? JSON_HEADERS : { ...JSON_HEADERS, authorization: `Bearer ${descriptor.token}` },
      method: route.method
    });
  } catch {
    return failure('connection_failed', 3);
  }
  try {
    const output = await response.json();
    return { output, status: response.ok ? 0 : 1 };
  } catch {
    return failure('invalid_response', 3);
  }
}

function failure(error, status) {
  return { output: { error }, status };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await runAgentCli(process.argv.slice(2));
  console.log(JSON.stringify(result.output));
  process.exitCode = result.status;
}
