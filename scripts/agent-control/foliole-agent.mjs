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

const JSON_HEADERS = { 'content-type': 'application/json' };

export async function runAgentCli(argv, options = {}) {
  if (argv.length === 1 && argv[0] === '--version') return runVersion(options);
  const help = resolveAgentCliHelp(argv);
  if (help) return help;
  const parsed = parseArgv(normalizeAgentCliCommand(argv));
  if (!parsed.ok) return failure(parsed.error, parsed.statusCode);
  const route = ROUTES[parsed.command];
  if (!route) return failure('unknown_command', 2);
  if (Object.hasOwn(parsed.flags, 'backup_dir')) return failure('unsupported_backup_dir', 2);
  const descriptorResult = await readDescriptor(parsed.flags.descriptor, options);
  if (!descriptorResult.ok) return failure(descriptorResult.error, descriptorResult.statusCode);
  const descriptor = descriptorResult.descriptor;
  if (route.capability && !descriptor.capabilities?.includes(route.capability)) {
    return failure('capability_disabled', 3);
  }
  const bodyResult = buildAgentCliBody(parsed.command, parsed.flags);
  if (!bodyResult.ok) return failure(bodyResult.error, bodyResult.statusCode);
  const { body } = bodyResult;
  if (parsed.command === 'materials/delete-soft' && !body.expected_updated_at) {
    return deleteMaterialWithCurrentRevision(route, descriptor, body, options);
  }
  return callApi(route, descriptor, body, options);
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

async function deleteMaterialWithCurrentRevision(route, descriptor, body, options) {
  if (!descriptor.capabilities.includes('materials.read')) return failure('read_capability_disabled', 3);
  const read = await callApi(ROUTES['materials/read'], descriptor, { id: body.id }, options);
  if (read.status !== 0) return read;
  const updatedAt = read.output.material?.updated_at;
  if (typeof updatedAt !== 'string' || !updatedAt.trim()) return failure('read_source_missing_updated_at', 1);
  return callApi(route, descriptor, { ...body, expected_updated_at: updatedAt.trim() }, options);
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
