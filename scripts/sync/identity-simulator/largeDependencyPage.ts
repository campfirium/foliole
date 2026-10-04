import { createHash } from 'node:crypto';

import { assertBody } from './assertions.js';
import { edit } from './operations.js';
import { converge, type ScenarioContext } from './scenarios.js';

export async function largeDependencyPage(ctx: ScenarioContext) {
  let body = '';
  for (let version = 0; version < 32; version++) {
    body = Array.from({ length: 1000 }, (_, block) =>
      createHash('sha512').update(`large-page:${version}:${block}`).digest('base64')).join('\n');
    edit(ctx.a, body);
  }
  await converge(ctx);
  assertBody(ctx.b, body);
}

export async function escapedDependencyPage(ctx: ScenarioContext) {
  let body = '';
  for (let version = 0; version < 32; version++) {
    body = `${version}\n${'"'.repeat(24 * 1024)}`;
    edit(ctx.a, body);
  }
  await converge(ctx);
  assertBody(ctx.b, body);
}
