// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('iOS Capacitor runtime plugin contract', () => {
  it.each([
    ['@capacitor/app', 'CapacitorApp'],
    ['@capacitor/local-notifications', 'CapacitorLocalNotifications']
  ])('keeps %s linked into the generated iOS SPM target', (dependency, product) => {
    const packageSource = read('ios/App/CapApp-SPM/Package.swift');

    expect(packageSource).toContain(`.package(name: "${product}", path: "../../../node_modules/${dependency}")`);
    expect(packageSource).toContain(`.product(name: "${product}", package: "${product}")`);
  });

  it('keeps lifecycle and reminder plugins as direct runtime dependencies', () => {
    const packageJson = JSON.parse(read('package.json'));

    expect(packageJson.dependencies['@capacitor/app']).toBeTypeOf('string');
    expect(packageJson.dependencies['@capacitor/local-notifications']).toBeTypeOf('string');
  });
});
