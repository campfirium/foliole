import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { clearTimeout, setTimeout } from 'node:timers';

export function checked(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${path.basename(command)} failed with exit ${result.status}`);
  }
}
export function captured(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `${path.basename(command)} failed`);
  }
  return result.stdout.trim();
}

export function execute(command, args, {
  timeoutCode = 'command_timeout', timeoutMs, ...options
}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let stderr = '';
    let stdout = '';
    const collect = (key) => (chunk) => {
      output += chunk;
      if (key === 'stdout') stdout += chunk;
      else stderr += chunk;
    };
    child.stdout.on('data', collect('stdout'));
    child.stderr.on('data', collect('stderr'));
    const result = (code = 1) => ({
      code,
      lines: output.split(/\r?\n/u).filter(Boolean),
      output,
      stderr,
      stdout
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(Object.assign(new Error(`${path.basename(command)} timed out`), {
        code: timeoutCode,
        result: result()
      }));
    }, timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(result(code ?? 1));
    });
  });
}
