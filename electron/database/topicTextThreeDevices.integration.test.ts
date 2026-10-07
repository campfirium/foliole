// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { textBranch, textDevice, wholeBodies } from './topicTextState.testSupport.js';

const devices: ReturnType<typeof textDevice>[] = [];
afterEach(() => { devices.splice(0).forEach((value) => value.sqlite.close()); });

it.each([
  [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]
])('converges three independent devices receiving in order %s %s %s', async (...order) => {
  const hosts = [textDevice(), textDevice(), textDevice()]; devices.push(...hosts);
  const base = textBranch('base', 'Base');
  const branches = ['A', 'BB', 'CCC'].map((body, index) => textBranch(`branch-${index}`, body, base));
  for (const [index, host] of hosts.entries()) await host.receive([base, branches[index]!]);
  for (const index of order) {
    for (const host of hosts) await host.receive([branches[index]!]);
  }
  for (let round = 0; round < 3; round++) {
    const heads = await Promise.all(hosts.map((host) => host.current()));
    for (const host of hosts) await host.receive(heads);
  }
  const heads = await Promise.all(hosts.map((host) => host.current()));
  expect(new Set(heads.map((head) => head.version_id)).size).toBe(1);
  for (const head of heads) {
    expect(head.body_text).toBe('CCC');
    expect(wholeBodies(head)).toEqual(new Set(['A', 'BB', 'CCC']));
  }
  for (const host of hosts) {
    expect((await host.receive(branches)).version_id).toBe(heads[0]!.version_id);
  }
});
