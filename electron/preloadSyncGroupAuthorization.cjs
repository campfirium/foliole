const { contextBridge, ipcRenderer } = require('electron');

const channel = (method) => `foliole:sync-group-authorization-prepare:${method}`;

contextBridge.exposeInMainWorld('folioleSyncGroupAuthorizationPrepare', {
  loadSyncGroupMemberRoute: (args) => ipcRenderer.invoke(channel('load'), args),
  migrateLegacyPairingToMemberRoute: (args) => ipcRenderer.invoke(channel('migrate'), args),
  revokeSyncGroupMemberRoute: (args) => ipcRenderer.invoke(channel('revoke'), args),
  signSyncGroupMemberRequest: (args) => ipcRenderer.invoke(channel('sign'), args)
});
