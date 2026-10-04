import { expect } from 'vitest';

import { writeNodeOpenStateWithSync } from '../../../lib/core/database/nodeOpenState.js';

import { edit } from './operations.js';
import { converge, type ScenarioContext } from './scenarios.js';
import { pull } from './transport.js';

export async function openStateBatch(ctx: ScenarioContext) {
  edit(ctx.a, '', 'root', { kind: 'folder' });
  for (let index = 0; index < 32; index++) {
    edit(ctx.a, `body-${index}`, `opened-${index}`, { parentNodeId: 'root' });
  }
  await converge(ctx);
  for (let index = 0; index < 32; index++) {
    writeNodeOpenStateWithSync(ctx.a.driver, { hostName: ctx.a.name,
      nodeId: `opened-${index}`, lastOpenedAt: '2026-10-01T00:00:00.000Z' });
  }
  await pull(ctx.sa, ctx.b);
  await converge(ctx);
  expect(ctx.b.sqlite.prepare('SELECT node_id, last_opened_at FROM node_open_state ORDER BY node_id').all())
    .toEqual(ctx.a.sqlite.prepare('SELECT node_id, last_opened_at FROM node_open_state ORDER BY node_id').all());
  expect(ctx.b.sqlite.prepare('SELECT count(*) FROM node_open_state').pluck().get()).toBe(32);
}
