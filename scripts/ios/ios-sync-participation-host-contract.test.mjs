import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('iOS Sync Group participation host contract', () => {
  it('exposes Web bridge methods backed by persistent native participation facts', () => {
    const plugin = read('ios/App/App/FolioleCompanionSyncPlugin.swift');
    const participation = read('ios/App/App/FolioleCompanionSyncParticipation.swift');

    for (const method of ['loadSyncParticipationState', 'setSyncEnabled', 'setSyncPaused']) {
      expect(plugin).toContain(`CAPPluginMethod(name: "${method}"`);
      expect(participation).toContain(`@objc func ${method}`);
    }
    expect(participation).toContain('UserDefaults.standard');
    expect(participation.match(/Task \{ @MainActor in/gu)).toHaveLength(3);
    expect(participation).toContain('UIApplication.shared.applicationState == .active');
    expect(participation).toContain('"participating": lifecycleActive && enabled && !paused');
  });
});
