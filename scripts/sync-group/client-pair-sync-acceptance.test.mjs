// @vitest-environment node

import fs from 'node:fs';
import { URL } from 'node:url';

import { expect, it } from 'vitest';

function source(pathname) {
  return fs.readFileSync(new URL(pathname, import.meta.url), 'utf8');
}

function expectJoinParticipationBeforeRequest(contents, enableCall) {
  expect(contents.indexOf(enableCall)).toBeGreaterThan(-1);
  expect(contents.indexOf(enableCall)).toBeLessThan(
    contents.indexOf("request_sync_group_join")
  );
}

it('activates each joiner before it requests Sync Group membership', () => {
  expectJoinParticipationBeforeRequest(
    source('./client-pair-sync-acceptance.mjs'),
    "invokeMac(session, 'enable_companion_sync')"
  );
  expectJoinParticipationBeforeRequest(
    source('../../tests/desktop/client-pair-sync-participant.spec.ts'),
    "invoke('enable_companion_sync')"
  );
});

it('bounds product commands on both clients', () => {
  expect(source('./client-pair-sync-acceptance.mjs')).toContain('COMMAND_TIMEOUT_MS = 30_000');
  expect(source('../../tests/desktop/client-pair-sync-participant.spec.ts'))
    .toContain('Windows command ${command} timed out.');
});
