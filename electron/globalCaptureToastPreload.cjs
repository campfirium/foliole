const { contextBridge, ipcRenderer } = require('electron');

const OPEN_CHANNEL = 'foliole:global-capture-toast:open';
const TARGET_CHANNEL = 'foliole:global-capture-toast:target';

let targetNodeId = null;

ipcRenderer.on(TARGET_CHANNEL, (_event, payload) => {
  targetNodeId = typeof payload?.nodeId === 'string' && payload.nodeId.trim() ? payload.nodeId : null;
});

contextBridge.exposeInMainWorld('globalCaptureToast', {
  open: (nextNodeId) => {
    const nodeId = typeof nextNodeId === 'string' && nextNodeId.trim() ? nextNodeId : targetNodeId;
    if (nodeId) {
      ipcRenderer.send(OPEN_CHANNEL, { nodeId });
    }
  }
});
