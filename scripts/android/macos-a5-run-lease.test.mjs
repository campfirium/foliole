// @vitest-environment node
/* global process */

import fs from 'node:fs';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { createMacosA5ExecutionContext } from './macos-a5-execution-context.mjs';
import {
  acquireMacosA5DeviceLease, releaseMacosA5DeviceLease
} from './macos-a5-run-lease.mjs';

const roots = [];

function context(runId) {
  const parent = path.join(process.cwd(), '.tmp/artifacts');
  fs.mkdirSync(parent, { recursive: true });
  const repoRoot = fs.mkdtempSync(path.join(parent, 'macos-a5-lease-'));
  roots.push(repoRoot);
  return createMacosA5ExecutionContext({ action: 'deploy', repoRoot, runId });
}

function processLookup(tokens) {
  return (_command, args) => {
    const token = tokens.get(Number(args.at(-1)));
    if (!token) throw Object.assign(new Error('missing process'), { status: 1 });
    return `${token}\n`;
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { force: true, recursive: true });
});

it('rejects a concurrent live owner without waiting or replacing it', () => {
  const first = context('11111111-1111-1111-1111-111111111111');
  const second = { ...first, runId: '22222222-2222-2222-2222-222222222222' };
  const execute = processLookup(new Map([[101, 'token-a'], [202, 'token-b']]));
  const lease = acquireMacosA5DeviceLease(first, 'mutation', {
    execute, pid: 101, processToken: 'token-a'
  });

  expect(() => acquireMacosA5DeviceLease(second, 'readonly-lifecycle', {
    execute, pid: 202, processToken: 'token-b'
  })).toThrow(/already owned by run 11111111/u);

  releaseMacosA5DeviceLease(lease);
});

it('recovers a dead or SIGTERM-abandoned owner before acquiring once', () => {
  const first = context('33333333-3333-3333-3333-333333333333');
  const second = { ...first, runId: '44444444-4444-4444-4444-444444444444' };
  const firstLookup = processLookup(new Map([[303, 'token-old']]));
  acquireMacosA5DeviceLease(first, 'mutation', {
    execute: firstLookup, pid: 303, processToken: 'token-old'
  });
  const secondLookup = processLookup(new Map([[404, 'token-new']]));

  const recovered = acquireMacosA5DeviceLease(second, 'mutation', {
    execute: secondLookup, pid: 404, processToken: 'token-new'
  });

  expect(recovered.owner.runId).toBe(second.runId);
  releaseMacosA5DeviceLease(recovered);
});

it('refuses cleanup when the owner marker has been replaced', () => {
  const run = context('55555555-5555-5555-5555-555555555555');
  const execute = processLookup(new Map([[505, 'token-live']]));
  const lease = acquireMacosA5DeviceLease(run, 'mutation', {
    execute, pid: 505, processToken: 'token-live'
  });
  const replacement = { ...lease.owner, runId: 'another-run' };
  fs.writeFileSync(lease.ownerPath, JSON.stringify(replacement));

  expect(() => releaseMacosA5DeviceLease(lease)).toThrow(/another run/u);
  expect(fs.existsSync(lease.leasePath)).toBe(true);
});

it('refuses recursive cleanup when another file appears inside the lease', () => {
  const run = context('66666666-6666-6666-6666-666666666666');
  const execute = processLookup(new Map([[606, 'token-live']]));
  const lease = acquireMacosA5DeviceLease(run, 'mutation', {
    execute, pid: 606, processToken: 'token-live'
  });
  fs.writeFileSync(path.join(lease.leasePath, 'unexpected.txt'), 'keep');

  expect(() => releaseMacosA5DeviceLease(lease)).toThrow(/non-empty/u);
  expect(fs.existsSync(lease.ownerPath)).toBe(true);
});

it('fails closed when the previous process identity cannot be inspected', () => {
  const first = context('77777777-7777-7777-7777-777777777777');
  const second = { ...first, runId: '88888888-8888-8888-8888-888888888888' };
  acquireMacosA5DeviceLease(first, 'mutation', {
    execute: processLookup(new Map([[707, 'token-live']])),
    pid: 707, processToken: 'token-live'
  });
  const unavailable = () => { throw Object.assign(new Error('ps unavailable'), { code: 'ENOENT' }); };

  expect(() => acquireMacosA5DeviceLease(second, 'mutation', {
    execute: unavailable, pid: 808, processToken: 'token-new'
  })).toThrow('ps unavailable');
});
