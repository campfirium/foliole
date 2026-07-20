import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('iOS Bonjour discovery lifecycle host contract', () => {
  it('retains overlapping bridge calls independently until each discovery completes', () => {
    const discovery = read('ios/App/App/FolioleCompanionBonjourDiscovery.swift');
    const plugin = read('ios/App/App/FolioleCompanionSyncPlugin.swift');

    expect(discovery).toContain('private var active: [UUID: FolioleCompanionBonjourDiscovery] = [:]');
    expect(discovery).toMatch(/let id = UUID\(\)[\s\S]*self\.active\[id\] = discovery/);
    expect(discovery).toMatch(/FolioleCompanionBonjourDiscovery[\s\S]*self\?\.active\[id\] = nil/);
    expect(plugin).toContain('private let discoveries = FolioleCompanionBonjourDiscoveryPool()');
    expect(plugin).toContain('discoveries.start(contract: contract)');
    expect(plugin).not.toContain('private var discovery: FolioleCompanionBonjourDiscovery?');
  });
});
