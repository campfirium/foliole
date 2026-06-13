import { ipcMain, type BrowserWindow, type IpcMainEvent } from 'electron';

import {
  GLOBAL_CAPTURE_PANEL_DRAG_END_CHANNEL,
  GLOBAL_CAPTURE_PANEL_DRAG_MOVE_CHANNEL,
  GLOBAL_CAPTURE_PANEL_DRAG_START_CHANNEL
} from './globalCaptureChannels.js';

interface CapturePanelDragState {
  originX: number;
  originY: number;
  startX: number;
  startY: number;
}

function isDragPoint(value: unknown): value is { x: number; y: number } {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as { x?: unknown }).x === 'number' &&
    typeof (value as { y?: unknown }).y === 'number'
  );
}

export function bindGlobalCapturePanelDrag(panel: BrowserWindow) {
  let dragState: CapturePanelDragState | null = null;
  const isPanelSender = (event: IpcMainEvent) => event.sender.id === panel.webContents.id;

  const handleDragStart = (event: IpcMainEvent, value: unknown) => {
    if (!isPanelSender(event) || !isDragPoint(value)) return;
    const bounds = panel.getBounds();
    dragState = { originX: bounds.x, originY: bounds.y, startX: value.x, startY: value.y };
  };
  const handleDragMove = (event: IpcMainEvent, value: unknown) => {
    if (!isPanelSender(event) || !dragState || !isDragPoint(value)) return;
    const bounds = panel.getBounds();
    panel.setBounds({
      ...bounds,
      x: dragState.originX + value.x - dragState.startX,
      y: dragState.originY + value.y - dragState.startY
    }, false);
  };
  const handleDragEnd = (event: IpcMainEvent) => {
    if (!isPanelSender(event)) return;
    dragState = null;
  };

  ipcMain.on(GLOBAL_CAPTURE_PANEL_DRAG_START_CHANNEL, handleDragStart);
  ipcMain.on(GLOBAL_CAPTURE_PANEL_DRAG_MOVE_CHANNEL, handleDragMove);
  ipcMain.on(GLOBAL_CAPTURE_PANEL_DRAG_END_CHANNEL, handleDragEnd);
  panel.on('closed', () => {
    dragState = null;
    ipcMain.removeListener(GLOBAL_CAPTURE_PANEL_DRAG_START_CHANNEL, handleDragStart);
    ipcMain.removeListener(GLOBAL_CAPTURE_PANEL_DRAG_MOVE_CHANNEL, handleDragMove);
    ipcMain.removeListener(GLOBAL_CAPTURE_PANEL_DRAG_END_CHANNEL, handleDragEnd);
  });
}
