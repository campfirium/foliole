// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = (name) => readFile(path.join(ROOT, 'ios/App/App', name), 'utf8');

describe('iOS sync diagnostics host contract', () => {
  it('lands the existing diagnoseSync bridge method in a protected read-only adapter', async () => {
    const plugin = await source('FolioleCompanionSyncPlugin.swift');
    const action = await source('FolioleCompanionSyncDiagnosticsPlugin.swift');
    const queryStore = await source('FolioleCompanionSyncDiagnosticQueryStore.swift');
    const store = await source('FolioleCompanionSyncDiagnosticsStore.swift');

    expect(plugin).toContain('CAPPluginMethod(name: "diagnoseSync"');
    expect(action).toContain('@objc func diagnoseSync(_ call: CAPPluginCall)');
    expect(queryStore).toContain('SQLITE_OPEN_READONLY | SQLITE_OPEN_FULLMUTEX');
    expect(queryStore).toContain('PRAGMA query_only = ON');
    expect(store).toContain('"host": "ios"');
    expect(store).toContain('queries.metrics("diagnosticStorageMetrics")');
  });
});
