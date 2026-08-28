'use strict';
/* global process */

const { app } = require('electron');

app.commandLine.appendSwitch('remote-debugging-port', '0');
const remotePortIndex = process.argv.indexOf('--remote-debugging-port=0');
if (remotePortIndex >= 0) process.argv.splice(remotePortIndex, 1);
const originalWhenReady = app.whenReady();
const originalEmit = app.emit.bind(app);
let readyEventArgs;
app.emit = (event, ...args) => {
  if (event !== 'ready') return originalEmit(event, ...args);
  readyEventArgs = args;
  return app.listenerCount('ready') > 0;
};
let releaseReady;
const controlledReady = new Promise((resolve) => { releaseReady = resolve; });
app.isReady = () => false;
app.whenReady = () => controlledReady;
globalThis.__playwright_run = async () => {
  const ready = await originalWhenReady;
  app.isReady = () => true;
  releaseReady(ready);
  originalEmit('ready', ...readyEventArgs);
};
