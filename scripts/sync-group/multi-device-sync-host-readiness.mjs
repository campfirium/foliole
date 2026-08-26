import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { A5_SERIAL, macosA5Paths } from '../android/macos-a5-dev.mjs';
import { createMacosA5ExecutionContext } from '../android/macos-a5-execution-context.mjs';
import {
  acquireMacosA5DeviceLease, releaseMacosA5DeviceLease
} from '../android/macos-a5-run-lease.mjs';
import { WINDOWS_DEV_DEFAULT_SSH } from '../windows/windows-dev-control.mjs';
import { WINDOWS_DEV_REPO_ROOT_POSIX } from '../windows/windows-dev-paths.mjs';
import { MACOS_ACCEPTANCE_SYNC_PORT } from './multi-device-sync-macos-channel.mjs';
import { assertIsolatedMacosRoot } from './multi-device-sync-workspace.mjs';

/* global process */

const exec = promisify(execFile);
const ACCEPTANCE_APP = 'com.foliole.android.acceptance';
const WINDOWS_NODE = 'C:/Progra~1/nodejs/node.exe';
const WINDOWS_READINESS = `${WINDOWS_DEV_REPO_ROOT_POSIX}/scripts/windows/windows-multi-device-sync-readiness.mjs`;

async function bounded(command, args, options = {}) {
  const result = await exec(command, args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
    timeout: 10_000, ...options });
  return `${result.stdout}${result.stderr}`;
}

export function probeTcpPort(port) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen({ host: '0.0.0.0', port, exclusive: true }, () => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });
}

function fixedDevice(output) {
  const row = output.split(/\r?\n/u).map((line) => line.trim().split(/\s+/u))
    .find(([serial]) => serial === A5_SERIAL);
  if (!row || row[1] !== 'device') throw Object.assign(new Error('Fixed A5 is unavailable.'), {
    missingFact: 'fixed_a5_unavailable', lastSuccessfulAction: 'adb_devices_read'
  });
}

function assertA5RuntimeState(power, policy) {
  if (!/mWakefulness=Awake/u.test(power)) throw Object.assign(new Error('Fixed A5 is asleep.'), {
    missingFact: 'fixed_a5_asleep', lastSuccessfulAction: 'adb_device_fixed'
  });
  if (!/mIsShowing=false/u.test(policy) || !/INTERACTIVE_STATE_AWAKE/u.test(policy)) {
    throw Object.assign(new Error('Fixed A5 is locked.'), {
      missingFact: 'fixed_a5_locked', lastSuccessfulAction: 'fixed_a5_awake'
    });
  }
}

function assertA5LanRoute(route, interfaces = os.networkInterfaces()) {
  const subnet = /\b(\d+\.\d+\.\d+)\.\d+\/24\b/u.exec(route)?.[1];
  const hostAddresses = Object.values(interfaces).flatMap((entries) => entries ?? [])
    .filter((entry) => entry.family === 'IPv4' && !entry.internal).map((entry) => entry.address);
  if (!subnet || !hostAddresses.some((address) => address.startsWith(`${subnet}.`))) {
    throw Object.assign(new Error('Fixed A5 and Mac do not share the acceptance LAN.'), {
      missingFact: 'fixed_a5_lan_mismatch', lastSuccessfulAction: 'fixed_a5_unlocked'
    });
  }
}

function probeFixedA5Lease(repoRoot) {
  const context = createMacosA5ExecutionContext({
    action: 'multi-device-sync-readiness', repoRoot
  });
  const lease = acquireMacosA5DeviceLease(context, 'readonly-lifecycle');
  releaseMacosA5DeviceLease(lease);
}

export function createHostReadinessAdapters({ env = process.env, execute = bounded,
  fsApi = fs, networkInterfaces = os.networkInterfaces, probeA5Lease = probeFixedA5Lease,
  repoRoot, runId,
  probeMacosSyncPort = probeTcpPort,
  windowsHost = WINDOWS_DEV_DEFAULT_SSH }) {
  const paths = macosA5Paths(repoRoot);
  return {
    'macos-a': async () => {
      const root = path.join(repoRoot, '.tmp', 'artifacts', 'multi-device-sync', 'runs', runId, 'macos-a');
      assertIsolatedMacosRoot({ fsApi, repoRoot, root, runId });
      const free = fsApi.statfsSync(root).bavail * fsApi.statfsSync(root).bsize;
      if (free < 4 * 1024 ** 3) throw Object.assign(new Error('macOS acceptance disk is low.'), {
        missingFact: 'macos_disk_budget_missing', lastSuccessfulAction: 'isolated_owner_checked'
      });
      try { await probeMacosSyncPort(Number(MACOS_ACCEPTANCE_SYNC_PORT)); }
      catch (error) {
        throw Object.assign(new Error('macOS sync port is unavailable.', { cause: error }), {
          missingFact: error.code === 'EADDRINUSE'
            ? 'macos_sync_port_occupied' : 'macos_sync_port_unavailable',
          lastSuccessfulAction: 'macos_disk_ready'
        });
      }
      return { facts: ['macos_isolated_owner_ready', 'macos_disk_ready',
        'macos_sync_port_ready'] };
    },
    'android-b': async () => {
      probeA5Lease(repoRoot);
      try {
        await execute(paths.adb, ['start-server'], { env });
        await execute(paths.adb, ['-s', A5_SERIAL, 'wait-for-device'], { env, timeout: 10_000 });
        fixedDevice(await execute(paths.adb, ['devices', '-l'], { env }));
        const power = await execute(paths.adb, ['-s', A5_SERIAL, 'shell', 'dumpsys', 'power'], { env });
        const policy = await execute(paths.adb,
          ['-s', A5_SERIAL, 'shell', 'dumpsys', 'window', 'policy'], { env });
        assertA5RuntimeState(power, policy);
        const route = await execute(paths.adb, ['-s', A5_SERIAL, 'shell', 'ip', 'route'], { env });
        assertA5LanRoute(route, networkInterfaces());
        const packages = await execute(paths.adb,
          ['-s', A5_SERIAL, 'shell', 'pm', 'list', 'packages', ACCEPTANCE_APP], { env });
        if (packages.includes(ACCEPTANCE_APP)) throw Object.assign(
          new Error('A5 acceptance package from another run is still installed.'), {
            missingFact: 'android_acceptance_package_present',
            lastSuccessfulAction: 'fixed_a5_lan_ready'
          });
        return { facts: ['fixed_a5_ready', 'fixed_a5_lease_ready', 'fixed_a5_unlocked',
          'fixed_a5_lan_ready', 'android_acceptance_isolated'] };
      } finally { await execute(paths.adb, ['kill-server'], { env }).catch(() => undefined); }
    },
    'windows-c': async () => {
      const key = env.FOLIOLE_WINDOWS_DEV_GIT_SSH_KEY
        || path.join(process.env.HOME, '.ssh', 'agent', 'foliole-windows-android-lab');
      const args = ['-T', '-i', key, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10',
        '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes', windowsHost,
        WINDOWS_NODE, WINDOWS_READINESS];
      let output;
      try { output = await execute('ssh', args, { env, timeout: 40_000 }); }
      catch (error) {
        const detail = `${error.stdout || ''}${error.stderr || ''}`;
        const missing = /missingFact=([^\s]+)/u.exec(detail)?.[1];
        const unreachable = /(?:Operation timed out|Connection timed out|Host is down|Network is unreachable|No route to host|Connection refused)/u.test(detail);
        throw Object.assign(new Error('Windows acceptance readiness command failed.'), {
          lastSuccessfulAction: unreachable ? 'windows_host_resolved' : 'windows_ssh_connected',
          missingFact: missing || (unreachable
            ? 'windows_ssh_unreachable' : 'windows_readiness_command_failed')
        });
      }
      if (!output.includes('[multi-device-sync-readiness] status=ready')) {
        throw Object.assign(new Error('Windows acceptance readiness is incomplete.'), {
          missingFact: 'windows_readiness_missing', lastSuccessfulAction: 'windows_ssh_connected'
        });
      }
      return { facts: ['windows_ssh_ready', 'windows_repo_ready', 'windows_isolated_owner_ready',
        'windows_interactive_action_ready'] };
    }
  };
}

export function createMutationReadinessAdapters(options) {
  const adapters = createHostReadinessAdapters(options);
  const receiptPath = path.join(options.repoRoot, '.tmp', 'artifacts', 'multi-device-sync',
    'runs', options.runId, 'candidate-preparation.json');
  const apkPath = path.join(options.repoRoot, 'android/app/build/outputs/apk/debug/app-debug.apk');
  const requireCandidate = async (host, action) => {
    const result = await action();
    if (!fs.existsSync(receiptPath)) throw Object.assign(new Error('Candidate receipt is missing.'), {
      lastSuccessfulAction: `${host}_environment_ready`, missingFact: 'candidate_receipt_missing'
    });
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    const current = await options.candidateProvider();
    const required = new Set(options.requiredHosts);
    const baseMismatch = receipt.runId !== options.runId || receipt.resultStatus !== 'success'
      || (!required.has(host) && receipt.preparedHosts?.includes(host))
      || receipt.candidateBoundary?.branch !== current.branch
      || receipt.candidateBoundary?.revision !== current.revision
      || receipt.candidateBoundary?.sourceRef !== current.sourceRef
      || receipt.candidateBoundary?.treeDigest !== current.treeDigest;
    const hostMismatch = required.has(host) && (!receipt.preparedHosts?.includes(host)
      || (host === 'windows-c' && (receipt.windowsReceipt?.sourceRef !== current.sourceRef
        || receipt.windowsReceipt?.revision !== current.revision
        || receipt.windowsReceipt?.treeDigest !== current.treeDigest
        || receipt.windowsReceipt?.targetRef !== 'refs/heads/dev'))
      || (host === 'android-b' && (!fs.existsSync(apkPath)
        || createHash('sha256').update(fs.readFileSync(apkPath)).digest('hex')
          !== receipt.androidApkSha256)));
    if (baseMismatch || hostMismatch) {
      throw Object.assign(new Error('Candidate artifacts do not match the receipt.'), {
        lastSuccessfulAction: `${host}_environment_ready`, missingFact: `${host}_candidate_mismatch`
      });
    }
    return { facts: [...result.facts, required.has(host)
      ? `${host}_candidate_bound` : `${host}_candidate_not_required`] };
  };
  return Object.fromEntries(Object.entries(adapters).map(([host, action]) => [
    host, () => requireCandidate(host, action)
  ]));
}
