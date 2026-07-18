#!/usr/bin/env node
/* global console, fetch, process */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildAgentCliBody } from './foliole-agent-arguments.mjs';
import { normalizeAgentCliCommand, resolveAgentCliHelp } from './foliole-agent-help.mjs';
import { AGENT_CLI_ROUTES as ROUTES } from './foliole-agent-routes.mjs';
import { resolveAgentControlDescriptorPath } from './foliole-agent-runtime-paths.mjs';
import { readAgentCliVersion } from './foliole-agent-version.mjs';
import { writeAgentBackup } from './foliole-agent-write-backup.mjs';

const JSON_HEADERS = { 'content-type': 'application/json' };

export async function runAgentCli(argv, options = {}) {
  if (argv.length === 1 && argv[0] === '--version') return runVersion(options);
  const help = resolveAgentCliHelp(argv);
  if (help) return help;
  const parsed = parseArgv(normalizeAgentCliCommand(argv));
  if (!parsed.ok) return failure(parsed.error, parsed.statusCode);
  const route = ROUTES[parsed.command];
  if (!route) return failure('unknown_command', 2);
  const descriptorResult = await readDescriptor(parsed.flags.descriptor, options);
  if (!descriptorResult.ok) return failure(descriptorResult.error, descriptorResult.statusCode);
  const descriptor = descriptorResult.descriptor;
  if (route.capability && !descriptor.capabilities?.includes(route.capability)) {
    return failure('capability_disabled', 3);
  }
  const bodyResult = buildAgentCliBody(parsed.command, parsed.flags);
  if (!bodyResult.ok) return failure(bodyResult.error, bodyResult.statusCode);
  if (route.writeKind === 'material') return runMaterialWriteCommand(parsed.command, bodyResult.body, descriptor, parsed.flags, options);
  if (route.writeKind === 'virtual_folder') return runVirtualFolderWriteCommand(parsed.command, bodyResult.body, descriptor, parsed.flags, options);
  return callApi(route, descriptor, bodyResult.body, options);
}

async function runVersion(options) {
  const version = await readAgentCliVersion(options);
  return version
    ? { output: version, status: 0 }
    : failure('product_version_unavailable', 3);
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
    const separatorIndex = token.indexOf('=');
    if (separatorIndex > 2) {
      const key = token.slice(2, separatorIndex).replaceAll('-', '_');
      const value = token.slice(separatorIndex + 1);
      if (!value) throw new Error(`missing_${key}`);
      flags[key] = value;
      continue;
    }
    const key = token.slice(2).replaceAll('-', '_');
    const value = tokens[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`missing_${key}`);
    flags[key] = value;
    index += 1;
  }
  return flags;
}

async function readDescriptor(flagPath, options) {
  const env = options.env ?? process.env;
  const descriptorPath = flagPath ?? resolveAgentControlDescriptorPath({ env, homeDir: options.homeDir, platform: options.platform });
  try {
    const descriptor = JSON.parse(await readFile(descriptorPath, 'utf8'));
    return isDescriptor(descriptor) ? { descriptor, ok: true } : { error: 'invalid_descriptor', ok: false, statusCode: 3 };
  } catch {
    return { error: 'session_unavailable', ok: false, statusCode: 3 };
  }
}

function isDescriptor(value) {
  return Boolean(value && typeof value === 'object' && typeof value.endpoint === 'string' &&
    typeof value.token === 'string' && Array.isArray(value.capabilities));
}

async function runMaterialWriteCommand(command, body, descriptor, flags, options) {
  if (command === 'materials/create') {
    const backup = await writeBackup(command, 'material', 'new', null, body, flags, options);
    if (!backup.ok) return failure(backup.error, 4);
    const result = await callApi(ROUTES[command], descriptor, body, options);
    return { ...result, output: { ...result.output, backup_path: backup.path } };
  }
  if (command === 'materials/reorder') {
    if (!descriptor.capabilities?.includes('materials.listChildren')) return failure('backup_capability_disabled', 3);
    const previous = await callApi(ROUTES['materials/list-children'], descriptor, { parent_id: body.parent_id }, options);
    if (previous.status !== 0) return previous;
    const targetId = body.parent_id ?? 'root';
    const backup = await writeBackup(command, 'material', targetId, previous.output, body, flags, options);
    if (!backup.ok) return failure(backup.error, 4);
    const result = await callApi(ROUTES[command], descriptor, body, options);
    return { ...result, output: { ...result.output, backup_path: backup.path } };
  }
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
  const folderId = body.folder_id ?? body.id ?? 'new';
  if (command === 'virtual-folders/restore') {
    const backup = await writeBackup(command, 'virtual_folder', body.id, null, body, flags, options);
    if (!backup.ok) return failure(backup.error, 4);
    const result = await callApi(ROUTES[command], descriptor, body, options);
    return { ...result, output: { ...result.output, backup_path: backup.path } };
  }
  if (folderId !== 'new' && !descriptor.capabilities?.includes('virtualFolders.read')) {
    return failure('backup_capability_disabled', 3);
  }
  const previous = folderId !== 'new' ? await callApi(ROUTES['virtual-folders/read'], descriptor, { id: folderId }, options) : null;
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
  console.log(typeof result.output === 'string' ? result.output : JSON.stringify(result.output));
  process.exitCode = result.status;
}
