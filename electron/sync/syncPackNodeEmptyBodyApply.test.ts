// @vitest-environment node
import { expect, it } from 'vitest';

import { restoreFixture } from '../database/requestSyncRestoreRecovery.testSupport.js';

import { branch, identity, receive } from './syncPackStoredVersionDependencies.testSupport.js';

it('accepts an empty version body as valid topic text through request replay and reopen', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    for (let replay = 0; replay < 2; replay++) {
      await receive(source, target, [branch('desktop#1', '')]); target.reopen();
      expect(target.sqlite.prepare("SELECT body_text FROM node_sync_versions WHERE version_id = 'desktop#1'").get())
        .toEqual({ body_text: '' });
    }
  } finally { await fixture.close(); }
});

it('imports lightweight ancestry and restores its original body from a later full request', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    const base = branch('desktop#1', 'Packed answer', undefined, '2026-05-04T01:00:00.000Z');
    const head = branch('head', 'Current body', base);
    await receive(source, target, [identity(base), head]);
    expect(target.sqlite.prepare("SELECT body_text FROM node_sync_versions WHERE version_id = 'desktop#1'").get())
      .toEqual({ body_text: null });
    for (let replay = 0; replay < 2; replay++) {
      await receive(source, target, [base, head]); target.reopen();
      expect(target.sqlite.prepare("SELECT body_text FROM node_sync_versions WHERE version_id = 'desktop#1'").get())
        .toEqual({ body_text: 'Packed answer' });
    }
  } finally { await fixture.close(); }
});

it('keeps a full local body when a request only carries its ancestry identity', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    const base = branch('desktop#1', 'Packed answer', undefined, '2026-05-04T01:00:00.000Z');
    await receive(source, target, [base]);
    const original = target.sqlite.prepare("SELECT * FROM node_sync_versions WHERE version_id = 'desktop#1'").get();
    await receive(source, target, [identity(base), branch('head', 'Current body', base)]);
    target.reopen();
    expect(target.sqlite.prepare("SELECT body_text FROM node_sync_versions WHERE version_id = 'desktop#1'").get())
      .toEqual({ body_text: 'Packed answer' });
    expect(target.sqlite.prepare("SELECT * FROM node_sync_versions WHERE version_id = 'desktop#1'").get()).toEqual(original);
  } finally { await fixture.close(); }
});

it('restores a stripped common base supplied by a returning branch through a current request', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    const base = branch('shared-base', 'Original body', undefined, '2026-05-04T01:00:00.000Z');
    const local = branch('local-head', 'Local edit', base);
    await receive(source, target, [identity(base), local]);
    await receive(source, target, [base, branch('returning-head', 'Offline edit', base, '2026-05-04T03:00:00.000Z')]);
    target.reopen();
    expect(target.sqlite.prepare("SELECT body_text FROM node_sync_versions WHERE version_id = 'shared-base'").get())
      .toEqual({ body_text: 'Original body' });
  } finally { await fixture.close(); }
});
