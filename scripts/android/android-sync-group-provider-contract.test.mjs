// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const javaRoot = path.join(root, 'android/app/src/main/java/com/foliole/android');
const readJava = (name) => readFile(path.join(javaRoot, name), 'utf8');

it('serves the established content blob batch route instead of provisioning through single blob requests', async () => {
  const server = await readJava('FolioleCompanionSyncGroupServer.java');
  const batch = await readJava('FolioleCompanionSyncGroupContentBlobBatch.java');
  expect(server).toContain('pathOnly.equals("/companion/content-blobs")');
  expect(batch).toContain('private static final int MAX_BATCH_SIZE = 32;');
  expect(batch).toContain('WHERE cb.hash IN (');
  expect(batch).toContain('X-Blob-Hash: ');
});

it('listens on the same stable port persisted by bidirectional peer pairing', async () => {
  const server = await readJava('FolioleCompanionSyncGroupServer.java');
  expect(server).toContain('private static final int SYNC_PORT = 38641;');
  expect(server).toContain('new ServerSocket(SYNC_PORT)');
  expect(server).not.toContain('new ServerSocket(0)');
});

it('admits complete nonempty library facts while preserving Sync Group identity checks', async () => {
  const server = await readJava('FolioleCompanionSyncGroupServer.java');
  const facts = await readJava('FolioleCompanionSyncGroupLibraryFacts.java');
  const createRequest = server.slice(server.indexOf('private void createRequest('),
    server.indexOf('private void completePair('));
  expect(createRequest).toContain('sync_group_identity_mismatch');
  expect(createRequest).toContain('FolioleCompanionSyncGroupLibraryFacts.valid(facts)');
  expect(createRequest).not.toContain('sync_group_requires_empty_library');
  expect(facts).toContain('((Number) value).longValue() < 0');
  expect(facts).not.toContain('== 0');
});

it('normalizes the Android NSD trailing-dot service type without changing the requested type', async () => {
  const discovery = await readJava('FolioleCompanionNsdDiscovery.java');
  expect(discovery).toContain('normalizeServiceType(requested).equalsIgnoreCase');
  expect(discovery).toContain('return serviceType.endsWith(".")');
  expect(discovery).toContain('? serviceType.substring(0, serviceType.length() - 1)');
  expect(discovery).toContain('return normalized.isEmpty() ? normalized : normalized + ".";');
});

it('keeps Android fact-change discovery foreground-bound and excludes its own resolved service', async () => {
  const monitor = await readJava('FolioleCompanionNsdMonitor.java');
  const plugin = await readJava('FolioleCompanionSyncPlugin.java');
  expect(monitor).toContain('manager.resolveService(service');
  expect(monitor).toContain('FolioleCompanionSyncGroupProvider.runtimeInstanceId()');
  expect(monitor).toContain('ownRuntimeId.equals(new String(runtimeId');
  expect(monitor).toContain('pendingResolutions.offer(service.getServiceName(), service)');
  expect(monitor).toContain('syncGroupProviderServiceHintKey(context, "endpointUrl")');
  expect(plugin).toContain('serviceMonitor.start()');
  expect(plugin).toContain('serviceMonitor.stop()');
  expect(plugin).toContain('syncGroupProviderServiceHintEvent');
  expect(plugin).toContain('notifyListeners(name, event)');
});

it('serializes Android NSD resolution so one active resolve cannot hide another group member', async () => {
  const discovery = await readJava('FolioleCompanionNsdDiscovery.java');
  const addresses = await readJava('FolioleCompanionNsdAddresses.java');
  expect(discovery).toContain('pendingResolutions.addLast(serviceInfo)');
  expect(discovery).toContain('if (resolving) return;');
  expect(discovery).toMatch(/onServiceResolved[\s\S]*addResolvedEndpoint[\s\S]*resolveNext\(\)/u);
  expect(discovery).toContain('FolioleCompanionNsdAddresses.endpointHosts(serviceInfo)');
  expect(addresses).toContain('serviceInfo.getHostAddresses()');
  expect(addresses).toContain('? "[" + value + "]" : value');
  expect(addresses).toContain('get("ipv4_addresses")');
  expect(addresses).toContain('if (isIpv4(candidate)) result.add(candidate)');
});

it('coalesces obsolete hint revisions without suppressing another device', async () => {
  const monitor = await readJava('FolioleCompanionNsdMonitor.java');
  const queue = await readJava('FolioleCompanionLatestServiceQueue.java');
  expect(monitor).toContain('pendingResolutions.offer(service.getServiceName(), service)');
  expect(queue).toContain('latestByService.put(key, service)');
  expect(queue).toContain('if (!latestByService.containsKey(key)) serviceOrder.addLast(key)');
  expect(queue).toContain('lastIndexOf(REVISION_SEPARATOR)');
});

it('releases the Android NSD queue when a platform resolve callback never arrives', async () => {
  const monitor = await readJava('FolioleCompanionNsdMonitor.java');
  expect(monitor).toContain('handler.postDelayed(resolutionTimeout, RESOLVE_TIMEOUT_MS)');
  expect(monitor).toMatch(/finishResolution[\s\S]*generation != resolutionGeneration[\s\S]*resolveNext\(\)/u);
  expect(monitor).toMatch(/void stop\(\)[\s\S]*resolutionGeneration \+= 1[\s\S]*resolving = false/u);
});

it('waits for Android NSD unregistration before publishing a newer fact revision', async () => {
  const advertisement = await readJava('FolioleCompanionNsdAdvertisement.java');
  const provider = await readJava('FolioleCompanionSyncGroupProvider.java');
  expect(advertisement).toContain('unregistered.await(5, TimeUnit.SECONDS)');
  expect(advertisement).toContain('unregistered.countDown()');
  expect(provider).toMatch(/restartAdvertisement[\s\S]*stopAndAwait\(\)[\s\S]*start\(/u);
});

it('versions every device-specific Android DNS-SD fact hint', async () => {
  const advertisement = await readJava('FolioleCompanionNsdAdvertisement.java');
  expect(advertisement).toContain('info.setServiceName(serviceInstanceName(config))');
  expect(advertisement).toContain('config.getString("runtime_instance_id")');
  expect(advertisement).not.toContain('"protocol_capabilities"');
  expect(advertisement).toContain('config.getString("facts_revision").hashCode()');
});

it('authorizes every Android provider data request with both the channel secret and member fact', async () => {
  const auth = await readJava('FolioleCompanionSyncGroupRequestAuth.java');
  const database = await readJava('FolioleCompanionSyncGroupDatabase.java');
  const provider = await readJava('FolioleCompanionSyncGroupProvider.java');
  expect(auth).toContain('FolioleCompanionCurrentGroupCredential.load(');
  expect(provider).toContain('FolioleCompanionSyncGroupDatabase.isAuthorizedMember(');
  expect(database).toContain('bridge.request("authorize_member"');
});

it('revokes both directions of a departed peer credential before accepting departure', async () => {
  const server = await readJava('FolioleCompanionSyncGroupServer.java');
  const departure = server.slice(server.indexOf('private void departure('),
    server.indexOf('private void contentBlob('));
  expect(departure).toContain('FolioleCompanionSyncGroupPeerStore.remove(context, authenticatedAuthorizationId)');
  expect(departure).toContain('FolioleCompanionSyncGroupOutboundPeerStore.remove(context, authenticatedAuthorizationId)');
  expect(departure.indexOf('recordDeparture')).toBeLessThan(departure.indexOf('SyncGroupPeerStore.remove'));
  expect(departure.indexOf('SyncGroupOutboundPeerStore.remove')).toBeLessThan(departure.indexOf('status", "accepted'));
});

it('keeps the live companion database under the Capacitor owner', async () => {
  const names = [
    'FolioleCompanionSyncGroupDatabase.java',
    'FolioleCompanionSyncGroupProvider.java',
    'FolioleCompanionSyncGroupRequestAuth.java',
    'FolioleCompanionSyncGroupServer.java'
  ];
  const sources = await Promise.all(names.map(readJava));
  for (const source of sources) {
    expect(source).not.toContain('android.database.sqlite');
    expect(source).not.toContain('SQLiteDatabase.openDatabase');
    expect(source).not.toContain('database_path');
  }
  const server = sources[3];
  const snapshot = await readJava('FolioleCompanionSyncGroupSnapshot.java');
  expect(server).toContain('snapshots.refresh(');
  expect(server).toContain('snapshots.read(');
  expect(snapshot).toMatch(/bridge\.request\(\s*"create_snapshot"/u);
});

it('pins one independent database snapshot to each peer sync-pack cycle', async () => {
  const server = await readJava('FolioleCompanionSyncGroupServer.java');
  const snapshot = await readJava('FolioleCompanionSyncGroupSnapshot.java');
  expect(server).toMatch(/syncPack[\s\S]*snapshots\.refresh\([\s\S]*peer/u);
  expect(server).toMatch(/contentBlobs[\s\S]*snapshots\.read\([\s\S]*peer/u);
  expect(server).toMatch(/attachment[\s\S]*snapshots\.read\([\s\S]*peer/u);
  expect(snapshot).toContain('snapshots.put(peerDeviceId, next)');
  expect(snapshot).toContain('File previous = snapshots.put');
  expect(snapshot).toContain('delete(previous)');
});

it('promotes an approved join only after the new member proves key possession', async () => {
  const auth = await readJava('FolioleCompanionSyncGroupRequestAuth.java');
  const grantStore = await readJava('FolioleCompanionSyncGroupJoinGrantStore.java');
  const provider = await readJava('FolioleCompanionSyncGroupProvider.java');
  const server = await readJava('FolioleCompanionSyncGroupServer.java');
  const approve = provider.slice(provider.indexOf('static synchronized JSObject approve'),
    provider.indexOf('static synchronized JSObject reject'));
  const promote = provider.slice(provider.indexOf('static void promoteApprovedJoin'),
    provider.indexOf('static synchronized void pruneExpired'));
  expect(approve).toContain('FolioleCompanionSyncGroupJoinGrantStore.save');
  expect(approve).toContain('FolioleCompanionCurrentGroupCredential.load(');
  expect(approve).not.toContain('FolioleCompanionSyncGroupPeerStore.createSecret');
  expect(approve).not.toContain('FolioleCompanionSyncGroupPeerStore.remove');
  expect(approve).not.toContain('registerMember');
  expect(auth.indexOf('MessageDigest.isEqual')).toBeLessThan(auth.indexOf('promoteApprovedJoin'));
  expect(auth).not.toContain('requireAuthorizedMember');
  expect(grantStore).toContain('AES/GCM/NoPadding');
  expect(grantStore).toContain('AndroidKeyStore');
  expect(grantStore).not.toContain('device_secret');
  expect(grantStore).not.toContain('provider_secret');
  expect(server).toContain('groupForApprovedRequest');
  expect(server).toContain('FolioleCompanionCurrentGroupCredential.load(');
  expect(server).not.toContain('/companion/sync-group/activate');
  expect(provider).not.toContain('static synchronized void promoteApprovedJoin');
  expect(promote).toMatch(/isAuthorizedMember[\s\S]*request != null[\s\S]*consumeApprovedJoin\(request\)/u);
  const assign = provider.slice(provider.indexOf('static synchronized void assignApprovedProfile'),
    provider.indexOf('private static void consumeApprovedJoin'));
  expect(assign).not.toContain('saveSecret(context, request.deviceId, request.deviceSecret)');
  expect(assign).not.toContain('remove(context, previousDeviceId)');
});

it('keeps the Android screen awake only around foreground provider activity', async () => {
  const provider = await readJava('FolioleCompanionSyncGroupProvider.java');
  const plugin = await readJava('FolioleCompanionSyncPlugin.java');
  const awake = await readJava('FolioleCompanionSyncScreenAwake.java');
  expect(provider).toContain('FolioleCompanionSyncScreenAwake.touch()');
  expect(provider).toContain('FolioleCompanionSyncScreenAwake.clear()');
  expect(plugin).toContain('FolioleCompanionSyncGroupProvider.pause(this)');
  expect(plugin).toContain('FolioleCompanionSyncGroupProvider.reconcile(this, getActivity(), isParticipating())');
  expect(plugin).toContain('lifecycleActive = false;');
  expect(plugin).toContain('lifecycleActive = true;');
  expect(provider).toContain('if (!participating) stopRuntime();');
  expect(provider).toContain('if (owner != activeOwner) return;');
  expect(awake).toContain('FLAG_KEEP_SCREEN_ON');
});

it('refreshes the provider data bridge after Activity recreation', async () => {
  const bridge = await readJava('FolioleCompanionSyncGroupDataBridge.java');
  const plugin = await readJava('FolioleCompanionSyncPlugin.java');
  const provider = await readJava('FolioleCompanionSyncGroupProvider.java');
  const sameProvider = provider.slice(
    provider.indexOf('if (FolioleCompanionSyncGroupProviderConfig.sameProvider(activeConfig, next))'),
    provider.indexOf('if (activeConfig != null) stopActiveProvider()')
  );
  expect(bridge).toContain('private volatile Dispatcher dispatcher;');
  expect(bridge).toContain('private static Object activeOwner;');
  expect(bridge).toContain('if (owner != activeOwner) return;');
  expect(bridge).toContain('void replaceDispatcher(Dispatcher dispatcher)');
  expect(plugin).toContain('FolioleCompanionSyncGroupDataBridge.install(getContext(), this,');
  expect(plugin).toContain('FolioleCompanionSyncGroupDataBridge.uninstall(this);');
  expect(sameProvider).toContain('requireDataBridge().replaceDispatcher(dispatcher);');
  expect(sameProvider.indexOf('replaceDispatcher')).toBeLessThan(sameProvider.indexOf('startRuntime'));
});

it('records the exact cursor returned by the Android pack snapshot', async () => {
  const provider = await readJava('FolioleCompanionSyncPackProvider.java');
  const server = await readJava('FolioleCompanionSyncGroupServer.java');
  expect(provider).toContain('pack.execSQL("BEGIN")');
  expect(provider).toContain('new BuildResult(zip(');
  expect(server).toContain('peer, after, pack.toSeq');
});

it('encrypts authenticated not-found responses without losing their HTTP status', async () => {
  const server = await readJava('FolioleCompanionSyncGroupServer.java');
  const workgroupHttp = await readJava('FolioleCompanionWorkgroupHttp.java');
  expect(server).toContain('workgroupJson(request, output, 404, new JSONObject().put("error", "blob_not_found"))');
  expect(server).toContain('workgroupJson(request, output, 404, new JSONObject().put("error", "missing_file"))');
  expect(workgroupHttp).toContain('output, status, ENVELOPE_CONTENT_TYPE, contentType, encrypted');
});
