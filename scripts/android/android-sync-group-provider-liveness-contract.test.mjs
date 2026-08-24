// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const javaRoot = path.join(root, 'android/app/src/main/java/com/foliole/android');
const readJava = (name) => readFile(path.join(javaRoot, name), 'utf8');

it('publishes provider runtime state without making bridge reads wait for lifecycle work', async () => {
  const provider = await readJava('FolioleCompanionSyncGroupProvider.java');
  const state = await readJava('FolioleCompanionSyncGroupProviderState.java');
  const stateMethod = provider.slice(
    provider.indexOf('static JSObject state()'),
    provider.indexOf('static synchronized String runtimeInstanceId()')
  );
  expect(provider).toContain('private static volatile FolioleCompanionSyncGroupProviderState.Runtime publishedRuntime');
  expect(provider).not.toContain('static synchronized JSObject state()');
  expect(stateMethod).toContain('return publishedRuntime.create()');
  expect(state).toContain('static final class Runtime');
  expect(state).toContain('private final FolioleCompanionSyncGroupServer server;');
  expect(state).toContain('private final FolioleCompanionNsdAdvertisement advertisement;');
});

it('publishes only complete running or stopped provider views', async () => {
  const provider = await readJava('FolioleCompanionSyncGroupProvider.java');
  const start = provider.slice(provider.indexOf('private static void startRuntime()'),
    provider.indexOf('private static void restartAdvertisement()'));
  const stop = provider.slice(provider.indexOf('private static void stopRuntime()'),
    provider.indexOf('private static void startRuntime()'));
  expect(start.indexOf('FolioleCompanionNsdAdvertisement.start')).toBeLessThan(start.indexOf('publishRuntime()'));
  expect(stop.indexOf('advertisement = null; server = null;')).toBeLessThan(
    stop.indexOf('FolioleCompanionSyncGroupProviderState.stopped()')
  );
  expect(provider).toMatch(/restartAdvertisement[\s\S]*FolioleCompanionNsdAdvertisement\.start[\s\S]*publishRuntime\(\)/u);
});

it('does not hold the provider lifecycle monitor across a data-owner roundtrip', async () => {
  const provider = await readJava('FolioleCompanionSyncGroupProvider.java');
  const providerStart = await readJava('FolioleCompanionSyncGroupProviderStart.java');
  const plugin = await readJava('FolioleCompanionSyncPlugin.java');
  const ready = provider.slice(provider.indexOf('static synchronized JSObject startReady('),
    provider.indexOf('static synchronized JSObject stop('));
  expect(providerStart).not.toContain('synchronized');
  expect(providerStart).toContain('FolioleCompanionCurrentGroupCredential.load(');
  expect(ready).toContain('boolean participating = participation.call();');
  expect(plugin).toContain('private volatile boolean lifecycleActive = true;');
  expect(plugin).toContain('FolioleCompanionSyncGroupProviderStart.run(');
  expect(plugin).toContain('this::dispatchDataRequest, this::isParticipating');
});
