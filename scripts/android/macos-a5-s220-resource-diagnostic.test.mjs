import { expect, it } from 'vitest';

import {
  buildS220ResourceDiagnosticInstrumentationArgs
} from './macos-a5-s220-resource-diagnostic-args.mjs';

it('keeps every S220 resource diagnostic instrumentation value shell-stable', () => {
  const fixture = { nodeId: 'resource-lan-1', images: [
    { hash: 'a'.repeat(64) }, { hash: 'b'.repeat(64) }
  ] };
  const args = buildS220ResourceDiagnosticInstrumentationArgs(fixture, 'group-1');

  expect(args).toEqual([
    '-e', 'resourceNodeId', 'resource-lan-1',
    '-e', 'resourceGroupId', 'group-1',
    '-e', 'availableHash', 'a'.repeat(64),
    '-e', 'recoveringHash', 'b'.repeat(64)
  ]);
  expect(args.filter((value) => value !== '-e').every((value) => !/\s/u.test(value))).toBe(true);
});
