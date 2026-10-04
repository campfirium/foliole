import { spawn } from 'node:child_process';
import { open, rm } from 'node:fs/promises';

export async function transferAdbFile(adb, args, destination) {
  const file = await open(destination, 'w');
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(adb, args, { stdio: ['ignore', file.fd, 'pipe'], windowsHide: true });
      let detail = '';
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk) => { detail = (detail + chunk).slice(-4096); });
      child.once('error', reject);
      child.once('close', (code, signal) => {
        if (code === 0) resolve();
        else reject(Object.assign(new Error(`Android file transfer failed: ${detail || signal || code}`),
          { code, signal }));
      });
    });
    return {};
  } catch (error) {
    await file.close();
    await rm(destination, { force: true });
    throw error;
  } finally {
    await file.close();
  }
}
