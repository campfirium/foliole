#!/usr/bin/env node
/* global console, fetch, process */

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_BACKUP_DIR = path.join('.tmp', 'agent-control', 'backups');
const JSON_HEADERS = { 'content-type': 'application/json' };
const ROUTES = {
  capabilities: { capability: 'foundation.capabilities', method: 'GET', path: 'capabilities' },
  health: { auth: false, method: 'GET', path: 'health' },
  'materials/delete-soft': { capability: 'materials.deleteSoft', method: 'POST', path: 'materials/delete-soft', write: true },
  'materials/read': { capability: 'materials.read', method: 'POST', path: 'materials/read' },
  'materials/search': { capability: 'materials.search', method: 'POST', path: 'materials/search' },
  'materials/update': { capability: 'materials.update', method: 'POST', path: 'materials/update', write: true },
  'virtual-folders/add-items': { capability: 'virtualFolders.addItems', method: 'POST', path: 'virtual-folders/add-items' },
  'virtual-folders/create': { capability: 'virtualFolders.create', method: 'POST', path: 'virtual-folders/create' },
  'virtual-folders/list': { capability: 'virtualFolders.list', method: 'POST', path: 'virtual-folders/list' },
  'virtual-folders/read': { capability: 'virtualFolders.read', method: 'POST', path: 'virtual-folders/read' },
  'virtual-folders/remove-items': { capability: 'virtualFolders.removeItems', method: 'POST', path: 'virtual-folders/remove-items' },
  'virtual-folders/reorder': { capability: 'virtualFolders.reorder', method: 'POST', path: 'virtual-folders/reorder' }
};

export async function runAgentCli(argv, options = {}) {
  const parsed = parseArgv(argv);
  if (!parsed.ok) return failure(parsed.error, parsed.statusCode);
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
  if (route.write) return runWriteCommand(parsed.command, bodyResult.body, descriptor, parsed.flags, options);
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
  if (command === 'materials/read') return requireFields(flags, ['id']);
  if (command === 'materials/search') return requireFields(flags, ['query'], ['limit']);
  if (command === 'materials/update') return buildUpdateBody(flags);
  if (command === 'materials/delete-soft') return requireFields(flags, ['id'], ['expected_updated_at']);
  if (command === 'virtual-folders/list') return requireFields(flags, [], ['limit']);
  if (command === 'virtual-folders/read') return requireFields(flags, ['id'], ['limit']);
  if (command === 'virtual-folders/create') return requireFields(flags, ['title'], ['description']);
  return requireFields(flags, ['folder_id'], command.endsWith('add-items') ? ['material_ids'] : ['item_ids']);
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

async function runWriteCommand(command, body, descriptor, flags, options) {
  const materialId = body.id;
  const read = await callApi(ROUTES['materials/read'], descriptor, { id: materialId }, options);
  if (read.status !== 0) return read;
  const material = read.output.material;
  if (material?.content_truncated) return failure('backup_source_truncated', 4);
  const backup = await writeBackup(command, materialId, material, body, flags, options);
  if (!backup.ok) return failure(backup.error, 4);
  const result = await callApi(ROUTES[command], descriptor, body, options);
  return { ...result, output: { ...result.output, backup_path: backup.path } };
}

async function writeBackup(command, materialId, material, patch, flags, options) {
  const backupDir = flags.backup_dir ?? options.env?.FOLIOLE_AGENT_BACKUP_DIR ?? process.env.FOLIOLE_AGENT_BACKUP_DIR ?? DEFAULT_BACKUP_DIR;
  const runId = options.randomId?.() ?? randomUUID();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.resolve(backupDir, `agent-material-${command.replace('/', '-')}-${materialId}-${timestamp}-${runId}.json`);
  const payload = { command, created_at: new Date().toISOString(), material_id: materialId, previous_material: material, request_patch: patch, run_id: runId };
  try {
    await mkdir(path.dirname(backupPath), { recursive: true });
    await writeFile(backupPath, `${JSON.stringify(payload, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    return { ok: true, path: backupPath };
  } catch {
    return { error: 'backup_write_failed', ok: false };
  }
}

async function callApi(route, descriptor, body, options) {
  const url = `${descriptor.endpoint.replace(/\/$/u, '')}/agent-control/v1/${route.path}`;
  try {
    const response = await (options.fetch ?? fetch)(url, {
      body: route.method === 'GET' ? undefined : JSON.stringify(body ?? {}),
      headers: route.auth === false ? JSON_HEADERS : { ...JSON_HEADERS, authorization: `Bearer ${descriptor.token}` },
      method: route.method
    });
    const output = await response.json();
    return { output, status: response.ok ? 0 : 1 };
  } catch {
    return failure('connection_failed', 3);
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
