import { spawn } from 'node:child_process';
import path from 'node:path';

type DiscoveredService = { port: number; txt: Record<string, string> };

export function discoverFolioleService() {
  const namespace = process.env.FOLIOLE_LINUX_MDNS_NAMESPACE;
  if (!namespace) throw new Error('Linux mDNS acceptance namespace is not configured');
  const peerAddress = process.env.FOLIOLE_LINUX_MDNS_PEER_ADDRESS;
  if (!peerAddress) throw new Error('Linux mDNS acceptance peer address is not configured');
  const observer = spawn('sudo', [
    'ip', 'netns', 'exec', namespace,
    process.execPath, path.resolve('scripts/linux/discover-foliole-mdns.mjs'),
    `--interface=${peerAddress}`
  ], { cwd: process.cwd(), env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  observer.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
  observer.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
  return new Promise<DiscoveredService>((resolve, reject) => {
    observer.once('error', reject);
    observer.once('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Linux mDNS observer exited with ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim()) as DiscoveredService);
      } catch (error) {
        reject(error);
      }
    });
  });
}
