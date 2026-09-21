import { Capacitor, registerPlugin } from '@capacitor/core';

import { createIsolatedCapacitorDatabaseManager } from '../shared/platform/capacitorSqliteDbPort';

import { measureCapacityCase } from './capacityAcceptanceMeasure';
import { assertIdentity, requireValue } from './capacityAcceptanceSafety';

// Fixed test resource only: no SQL, path, database or command input surface.
export async function runCapacityAcceptance() {
  const platform = Capacitor.getPlatform();
  const app = registerPlugin<{ getInfo(): Promise<{ id: string }> }>('App');
  const identity = await app.getInfo();
  assertIdentity(platform, identity.id);
  const sqlite = createIsolatedCapacitorDatabaseManager(platform);
  for (const count of [1000, 10000]) {
    requireValue(await sqlite.exists(`t219-capacity-${count}`) === false,
      'Dedicated database already exists or its absence is unverified; inspect it before reuse');
  }
  const results = [];
  for (const count of [1000, 10000]) {
    const name = `t219-capacity-${count}`;
    const database = await sqlite.create(name);
    try {
      await database.open();
      results.push(await measureCapacityCase(database, count));
    } finally {
      // Retain the isolated database for evidence; do not delete on failure.
      await database.close();
    }
  }
  return { status: 'passed', scenario: 'library-capacity', appId: identity.id, platform, results };
}

export function mountCapacityAcceptance(root: HTMLElement) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Run T219 capacity';
  button.dataset.testid = 't219-run-capacity';
  const result = document.createElement('textarea');
  result.readOnly = true;
  result.setAttribute('aria-label', 'T219 capacity result');
  result.dataset.testid = 't219-capacity-result';
  result.rows = 12;
  result.dataset.status = 'ready';
  root.replaceChildren(button, result);
  button.onclick = async () => {
    button.disabled = true;
    result.dataset.status = 'running';
    try { result.value = JSON.stringify(await runCapacityAcceptance()); }
    catch (error) { result.value = JSON.stringify({ status: 'failed', error: String(error) }); }
    result.setAttribute('data-result', result.value);
    result.dataset.status = JSON.parse(result.value).status;
  };
}
