import { spawn } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath, URL } from 'node:url';

const HOST = '127.0.0.1';
const PORT = 43077;
const PREVIEW_URL = `http://${HOST}:${PORT}/demo/`;
const NODE = 'D:\\R\\nodejs\\node.exe';
const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url));

function waitForDemo(timeoutMs = 15000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const request = http.get(PREVIEW_URL, (response) => {
        response.resume();
        if (response.statusCode && response.statusCode < 500) {
          resolve();
          return;
        }
        retry();
      });
      request.on('error', retry);
      request.setTimeout(1000, () => {
        request.destroy();
        retry();
      });
    };
    const retry = () => {
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error(`Demo preview did not respond at ${PREVIEW_URL}`));
        return;
      }
      setTimeout(check, 300);
    };
    check();
  });
}

function isDemoReady() {
  return waitForDemo(1000).then(() => true, () => false);
}

function openBrowser() {
  spawn('cmd.exe', ['/c', 'start', '', PREVIEW_URL], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  }).unref();
}

if (await isDemoReady()) {
  console.log(`[demo-web-preview] already running: ${PREVIEW_URL}`);
  openBrowser();
} else {
  const vite = spawn(NODE, [
    'node_modules\\vite\\bin\\vite.js',
    '--config',
    'vite.demo.config.ts',
    '--host',
    HOST,
    '--port',
    String(PORT),
    '--strictPort'
  ], {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    windowsHide: false
  });

  waitForDemo()
    .then(() => {
      console.log(`[demo-web-preview] opened ${PREVIEW_URL}`);
      openBrowser();
    })
    .catch((error) => {
      console.error(`[demo-web-preview] ${error.message}`);
    });

  vite.on('exit', (code) => {
    process.exitCode = code ?? 0;
  });
}
