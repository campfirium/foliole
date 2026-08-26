const { contextBridge, ipcRenderer } = require('electron');

const IPC_SYNC_GROUP_JOIN_PREPARE_CHANNEL = 'foliole:sync-group-join-prepare';

function invoke(operation, payload = {}) {
  return ipcRenderer.invoke(IPC_SYNC_GROUP_JOIN_PREPARE_CHANNEL, { operation, payload });
}

contextBridge.exposeInMainWorld('folioleSyncGroupJoinPrepare', {
  acceptRequest: (requestId) => invoke('accept_request', { request_id: requestId }),
  collectAcceptance: (requestId) => invoke('collect_acceptance', { request_id: requestId }),
  loadRequests: () => invoke('load_requests'),
  receiveRequest: (request) => invoke('receive_request', { request }),
  rejectRequest: (requestId) => invoke('reject_request', { request_id: requestId })
});
