import { spawn } from 'node:child_process';
import path from 'node:path';

type DiscoveredService = { port: number; txt: Record<string, string> };
type ObserverMessage = DiscoveredService | { status: 'ready' };

export function prepareFolioleServiceDiscovery() {
  const namespace = process.env.FOLIOLE_LINUX_MDNS_NAMESPACE;
  if (!namespace) throw new Error('Linux mDNS acceptance namespace is not configured');
  const peerAddress = process.env.FOLIOLE_LINUX_MDNS_PEER_ADDRESS;
  if (!peerAddress) throw new Error('Linux mDNS acceptance peer address is not configured');
  const observer = spawn('sudo', [
    'ip', 'netns', 'exec', namespace,
    process.execPath, path.resolve('scripts/linux/discover-foliole-mdns.mjs'),
    `--interface=${peerAddress}`, '--controlled',
    `--evidence=${path.resolve('.tmp/artifacts/linux-deb-acceptance/mdns-observer.json')}`
  ], { cwd: process.cwd(), env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  let resolveReady: () => void;
  let resolveResult: (service: DiscoveredService) => void;
  let rejectReady: (error: Error) => void;
  let rejectResult: (error: Error) => void;
  let resultResolved = false;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const result = new Promise<DiscoveredService>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  const rejectObserver = (error: Error) => {
    rejectReady(error);
    rejectResult(error);
  };
  const consumeLine = (line: string) => {
    if (!line) return;
    const message = JSON.parse(line) as ObserverMessage;
    if ('status' in message) resolveReady();
    else {
      resultResolved = true;
      resolveResult(message);
    }
  };
  observer.stdout.setEncoding('utf8').on('data', (chunk) => {
    stdout += chunk;
    const lines = stdout.split(/\r?\n/u);
    stdout = lines.pop() ?? '';
    try { lines.forEach(consumeLine); } catch (error) { rejectObserver(error as Error); }
  });
  observer.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
  observer.once('error', rejectObserver);
  observer.once('close', (code) => {
    if (code !== 0 || !resultResolved) {
      rejectObserver(new Error(stderr.trim() || `Linux mDNS observer exited with ${code}`));
    }
  });
  return {
    ready,
    discover: () => {
      observer.stdin.write('discover\n');
      return result;
    }
  };
}
