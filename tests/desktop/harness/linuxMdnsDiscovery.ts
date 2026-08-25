import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

type DiscoveredService = { port: number; txt: Record<string, string> };
type ObserverMessage = DiscoveredService | { status: 'ready' };

async function readRootNetworkEvidence(interfaceName: string) {
  const [devices, memberships, routes] = await Promise.all([
    readFile('/proc/net/dev', 'utf8'),
    readFile('/proc/net/igmp', 'utf8'),
    readFile('/proc/net/route', 'utf8')
  ]);
  const values = devices.split('\n').find((line) => line.trimStart().startsWith(`${interfaceName}:`))
    ?.split(':')[1].trim().split(/\s+/u).map(Number);
  const counters = values ? {
    received: { bytes: values[0], dropped: values[3], errors: values[2], packets: values[1] },
    transmitted: { bytes: values[8], dropped: values[11], errors: values[10], packets: values[9] }
  } : null;
  return { counters, devices, interfaceName, memberships, routes };
}

function bindControlledObserver(
  observer: ChildProcessWithoutNullStreams,
  writeEvidence: (exitCode: number | null, stderr: string) => Promise<void>
) {
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
  observer.once('close', async (code) => {
    await writeEvidence(code, stderr).catch((error) => { stderr += `\n${String(error)}`; });
    if (code !== 0 || !resultResolved) {
      rejectObserver(new Error(stderr.trim() || `Linux mDNS observer exited with ${code}`));
    }
  });
  return {
    ready,
    discover: () => {
      observer.stdin.end('discover\n');
      return result;
    }
  };
}

export function startControlledMdnsObserver(
  command: string, args: string[], options: {
    env?: NodeJS.ProcessEnv; evidencePath?: string; rootInterface?: string;
  } = {}
) {
  const rootBefore = options.rootInterface
    ? readRootNetworkEvidence(options.rootInterface).catch(() => null) : Promise.resolve(null);
  const observer = spawn(command, args, {
    cwd: process.cwd(), env: options.env ?? process.env, stdio: ['pipe', 'pipe', 'pipe']
  });
  const writeEvidence = async (exitCode: number | null, stderr: string) => {
    if (!options.evidencePath || !options.rootInterface) return;
    const before = await rootBefore;
    const after = await readRootNetworkEvidence(options.rootInterface).catch(() => null);
    const delta = before?.counters && after?.counters ? {
      received: {
        bytes: after.counters.received.bytes - before.counters.received.bytes,
        packets: after.counters.received.packets - before.counters.received.packets
      },
      transmitted: {
        bytes: after.counters.transmitted.bytes - before.counters.transmitted.bytes,
        packets: after.counters.transmitted.packets - before.counters.transmitted.packets
      }
    } : null;
    const evidence = { after, before, delta, observer: { exitCode, stderr: stderr.trim() } };
    await writeFile(options.evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  };
  return bindControlledObserver(observer, writeEvidence);
}

export function prepareFolioleServiceDiscovery() {
  const namespace = process.env.FOLIOLE_LINUX_MDNS_NAMESPACE;
  if (!namespace) throw new Error('Linux mDNS acceptance namespace is not configured');
  const peerAddress = process.env.FOLIOLE_LINUX_MDNS_PEER_ADDRESS;
  if (!peerAddress) throw new Error('Linux mDNS acceptance peer address is not configured');
  const evidenceDirectory = path.resolve('.tmp/artifacts/linux-deb-acceptance');
  return startControlledMdnsObserver('sudo', [
    'ip', 'netns', 'exec', namespace,
    process.execPath, path.resolve('scripts/linux/discover-foliole-mdns.mjs'),
    `--interface=${peerAddress}`, '--controlled',
    `--evidence=${path.join(evidenceDirectory, 'mdns-observer.json')}`
  ], {
    evidencePath: path.join(evidenceDirectory, 'mdns-root-network.json'),
    rootInterface: process.env.FOLIOLE_LINUX_MDNS_ROOT_INTERFACE
  });
}
