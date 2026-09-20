/* global Buffer, URL, process */
const { createHash, randomUUID } = require('node:crypto');
const http = require('node:http');
const path = require('node:path');

const production = (name) => require(path.join(process.cwd(), 'dist', name));

// Isolated loopback peer fixture; the desktop receiver and AEAD implementation are production modules.
exports.startResourceProvider = async function startResourceProvider(nativeImage) {
  const store = production('electron/database/syncGroupStore.js');
  const group = store.loadDesktopSyncGroup();
  const identity = production('lib/platform/syncGroupUnifiedContract.js').createSyncGroupDeviceIdentity({
    device_anchor: randomUUID(), group_id: group.group_id, library_path: '/fixture/resource-provider', path_flavor: 'posix'
  });
  store.registerSyncGroupDevice({ device: identity, deviceName: 'Resource provider', platform: 'ios-capacitor' });
  const secret = production('electron/sync/workgroupKeyStore.js').loadDesktopWorkgroupKey(group.group_id);
  const source = nativeImage.createFromPath(path.join(process.cwd(), 'assets/brand/foliole-leaf-tight.png'));
  const files = [128, 129, 130, 131].map((width) => source.resize({ width, height: 80 }).toPNG());
  const keys = files.map((bytes) => `${createHash('sha256').update(bytes).digest('hex')}.png`);
  const state = { files, keys, requests: [], queries: [], identity, secret, group };
  const server = http.createServer((request, response) => {
    handle(state, request, response).catch((error) => { response.writeHead(500); response.end(error.message); });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  return { ...state, server, endpoint, peerDeviceId: identity.identity_key };
};

function context(state, request, direction, contentType) {
  return { contentType, direction, groupTag: state.secret.group_tag, method: request.method, pathWithQuery: request.url };
}

function send(state, request, response, status, payload, contentType = 'application/json; charset=utf-8') {
  const crypto = production('electron/sync/workgroupAeadNode.js');
  const plaintext = Buffer.isBuffer(payload) ? payload : Buffer.from(JSON.stringify(payload));
  response.writeHead(status, { 'Content-Type': 'application/vnd.foliole.workgroup-aead+json',
    'X-Foliole-Original-Content-Type': contentType });
  response.end(JSON.stringify(crypto.encryptWorkgroupPayloadNode({
    context: context(state, request, 'response', contentType), groupKey: state.secret.group_key, plaintext
  })));
}

async function handle(state, request, response) {
  if (request.url === '/companion/discovery') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ group_id: state.group.group_id, provider_device_id: state.identity.identity_key,
      provider_platform: 'ios-capacitor', topology_role: 'member',
      protocol: production('lib/platform/syncProtocolContract.js').CURRENT_SYNC_PROTOCOL_DESCRIPTOR }));
    return;
  }
  let payload;
  if (request.method === 'POST') {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const envelope = JSON.parse(Buffer.concat(chunks).toString());
    payload = JSON.parse(production('electron/sync/workgroupAeadNode.js').decryptWorkgroupPayloadNode({
      context: context(state, request, 'request', envelope.content_type), envelope, groupKey: state.secret.group_key
    }).toString());
  }
  if (request.url === '/sync-group/member-state') return send(state, request, response, 200, {
    ...payload, sender_device_identity_key: state.identity.identity_key
  });
  if (request.url === '/companion/resource-availability') {
    state.queries.push(payload.resources);
    const resources = payload.resources.map((need) => {
      const bytes = state.files[state.keys.findIndex((key) => key.startsWith(need.id))];
      return { ...need, status: bytes ? 'available' : 'missing', ...(bytes ? {
        sha256: createHash('sha256').update(bytes).digest('hex'), size_bytes: bytes.length
      } : {}) };
    });
    return send(state, request, response, 200, { provider_device_id: state.identity.identity_key, resources });
  }
  const id = new URL(request.url, 'http://localhost').searchParams.get('attachment_id');
  state.requests.push(id);
  const index = state.keys.findIndex((key) => key.startsWith(id));
  if (index === 2) { request.socket.destroy(); return; }
  if (index === 1) return send(state, request, response, 404, { error: 'missing_file' });
  return send(state, request, response, 200, state.files[index], 'image/png');
}
