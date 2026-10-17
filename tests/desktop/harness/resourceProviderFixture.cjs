/* global Buffer, process */
const { createHash, randomUUID } = require('node:crypto');
const { mkdir, mkdtemp, rm, writeFile } = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');

const production = (name) => require(path.join(process.cwd(), 'dist', name));

exports.startResourceProvider = async function startResourceProvider(nativeImage) {
  const connection = production('electron/database/connection.js');
  const state = await connection.runWithDatabaseConnectionOwner(() => {
    const store = production('electron/database/syncGroupStore.js');
    const group = store.loadDesktopSyncGroup();
    const identity = production('lib/platform/syncGroupUnifiedContract.js').createSyncGroupDeviceIdentity({
      device_anchor: randomUUID(), group_id: group.group_id, library_path: '/fixture/resource-provider', path_flavor: 'posix'
    });
    store.registerSyncGroupDevice({ device: identity, deviceName: 'Resource provider', platform: 'ios-capacitor' });
    const secret = production('electron/sync/workgroupKeyStore.js').loadDesktopWorkgroupKey(group.group_id);
    return { identity, secret, group, remoteLibraryEpoch: randomUUID(), requests: [], healthy: false };
  });
  const source = nativeImage.createFromPath(path.join(process.cwd(), 'assets/brand/foliole-leaf-tight.png'));
  const files = [128, 129, 130, 131].map(width => source.resize({ width, height: 80 }).toPNG());
  state.keys = files.map(bytes => `${createHash('sha256').update(bytes).digest('hex')}.png`);
  await mkdir(path.join(process.cwd(), '.tmp/artifacts'), { recursive: true });
  state.directory = await mkdtemp(path.join(process.cwd(), '.tmp/artifacts/s203-request-source-'));
  for (const [index, bytes] of files.entries()) await writeFile(path.join(state.directory, state.keys[index]), bytes);
  state.source = production('electron/sync/desktopAttachmentBlockSource.js').createDesktopAttachmentBlockSource(state.directory, state.directory);
  state.server = http.createServer((request, response) => {
    handle(state, request, response).catch(error => response.destroy(error));
  });
  await new Promise(resolve => state.server.listen(0, '127.0.0.1', resolve));
  state.endpoint = `http://127.0.0.1:${state.server.address().port}`;
  state.peerDeviceId = state.identity.identity_key;
  return state;
};

exports.closeResourceProvider = async function closeResourceProvider(state) {
  await new Promise((resolve, reject) => state.server.close(error => error ? reject(error) : resolve()));
  await rm(state.directory, { recursive: true, force: true });
};

function attachmentHost(state, request, response) {
  return {
    needs: async () => [],
    needsSlice: async () => ({ keys: [], pending: false }),
    status: async () => { throw new Error('unexpected_attachment_push'); },
    receive: async () => { throw new Error('unexpected_attachment_push'); },
    async withFile(key, consume) {
      const index = state.keys.indexOf(key);
      if (!state.healthy && (index === 1 || index === 2)) {
        state.requests.push(key.slice(0, 64));
        if (index === 1) { response.writeHead(404); response.end('missing_file'); }
        else request.socket.destroy();
        throw new Error(index === 1 ? 'missing_file' : 'fixture_disconnected');
      }
      return state.source.withFile(key, file => consume({ ...file, read: async (offset, count) => {
        if (offset === 0) state.requests.push(key.slice(0, 64));
        return file.read(offset, count);
      } }));
    }
  };
}

async function handle(state, request, response) {
  const connection = production('electron/database/connection.js');
  const auth = await connection.runWithDatabaseConnectionOwner(() =>
    production('electron/sync/companionRequestAuth.js').authenticateCompanionRequest({
      request, bodySha256: request.headers['x-foliole-body-sha256'], requireMemberState: false
    }));
  const { handleCompanionLanFramedSyncPost } = production('electron/sync/companionLanFramedSyncPost.js');
  const { respondRequestSyncAttachments } = production('lib/core/sync/requestSyncAttachmentResponse.js');
  const { prepareDesktopRequestSyncBody } = production('electron/sync/desktopRequestSyncBody.js');
  await handleCompanionLanFramedSyncPost({ request, response, authenticate: () => auth,
    localIdentity: { deviceId: state.peerDeviceId, libraryEpoch: state.remoteLibraryEpoch },
    onStream: ({ context, stream }) => respondRequestSyncAttachments(attachmentHost(state, request, response), {
      context, stream, groupKey: new Uint8Array(Buffer.from(state.secret.group_key, 'base64url'))
    }, prepareDesktopRequestSyncBody)
  });
}
