/* global document, window */

const { ipcRenderer } = require('electron');

const SUBMIT_CHANNEL = 'foliole:global-capture-panel:submit';
const CANCEL_CHANNEL = 'foliole:global-capture-panel:cancel';
const FOCUS_CHANNEL = 'foliole:global-capture-panel:focus';
const READY_CHANNEL = 'foliole:global-capture-panel:ready';
const RESIZE_CHANNEL = 'foliole:global-capture-panel:resize';
const HINT_VISIBLE_CHANNEL = 'foliole:global-capture-panel:hint-visible';
const DRAG_START_CHANNEL = 'foliole:global-capture-panel:drag-start';
const DRAG_MOVE_CHANNEL = 'foliole:global-capture-panel:drag-move';
const DRAG_END_CHANNEL = 'foliole:global-capture-panel:drag-end';

const FOOTER_HEIGHT = 44;
const GUTTER = 26;
const INPUT_MAX_HEIGHT = 376;
const INPUT_MIN_HEIGHT = 144;
const SURFACE_MAX_HEIGHT = 420;
const SURFACE_MIN_HEIGHT = 188;

function submitCapture() {
  const input = document.getElementById('capture');
  ipcRenderer.send(SUBMIT_CHANNEL, typeof input?.value === 'string' ? input.value : '');
}

function cancelCapture() {
  ipcRenderer.send(CANCEL_CHANNEL);
}

function setHintVisible(visible) {
  ipcRenderer.send(HINT_VISIBLE_CHANNEL, Boolean(visible));
}

function toScreenPoint(event) {
  return { x: event.screenX, y: event.screenY };
}

function bindDragStrip(dragStrip) {
  let dragging = false;
  dragStrip?.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    dragging = true;
    dragStrip.setPointerCapture?.(event.pointerId);
    ipcRenderer.send(DRAG_START_CHANNEL, toScreenPoint(event));
  });
  dragStrip?.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    event.preventDefault();
    ipcRenderer.send(DRAG_MOVE_CHANNEL, toScreenPoint(event));
  });
  const stopDrag = (event) => {
    if (!dragging) return;
    dragging = false;
    dragStrip.releasePointerCapture?.(event.pointerId);
    ipcRenderer.send(DRAG_END_CHANNEL);
  };
  dragStrip?.addEventListener('pointerup', stopDrag);
  dragStrip?.addEventListener('pointercancel', stopDrag);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function resizeCaptureSurface() {
  const input = document.getElementById('capture');
  if (!input || typeof input.scrollHeight !== 'number') return;
  input.style.height = 'auto';
  const inputHeight = clamp(input.scrollHeight, INPUT_MIN_HEIGHT, INPUT_MAX_HEIGHT);
  input.style.height = `${inputHeight}px`;
  input.style.overflowY = input.scrollHeight > INPUT_MAX_HEIGHT ? 'auto' : 'hidden';
  const surfaceHeight = clamp(inputHeight + FOOTER_HEIGHT, SURFACE_MIN_HEIGHT, SURFACE_MAX_HEIGHT);
  ipcRenderer.send(RESIZE_CHANNEL, surfaceHeight + GUTTER * 2);
}

function focusCaptureInput() {
  const input = document.getElementById('capture');
  if (input && typeof input.value === 'string') input.value = '';
  input?.focus();
  resizeCaptureSurface();
}

function runAfterInitialPaint(callback) {
  let completed = false;
  const finish = () => {
    if (completed) return;
    completed = true;
    callback();
  };
  if (typeof window.requestAnimationFrame !== 'function') {
    window.setTimeout(finish, 0);
    return;
  }
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(finish);
  });
  window.setTimeout(finish, 32);
}

window.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('capture');
  const form = document.getElementById('form');
  const hideHint = document.getElementById('hide-hint');
  const showHint = document.getElementById('show-hint');
  const close = document.getElementById('close');
  const dragStrip = document.getElementById('drag-strip');
  focusCaptureInput();
  bindDragStrip(dragStrip);
  runAfterInitialPaint(() => ipcRenderer.send(READY_CHANNEL));
  ipcRenderer.on(FOCUS_CHANNEL, focusCaptureInput);
  input?.addEventListener('input', resizeCaptureSurface);
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    submitCapture();
  });
  close?.addEventListener('click', (event) => {
    event.preventDefault();
    cancelCapture();
  });
  hideHint?.addEventListener('click', (event) => {
    event.preventDefault();
    document.body.dataset.hintVisible = 'false';
    setHintVisible(false);
  });
  showHint?.addEventListener('click', (event) => {
    event.preventDefault();
    document.body.dataset.hintVisible = 'true';
    setHintVisible(true);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelCapture();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submitCapture();
    }
  }, true);
});
