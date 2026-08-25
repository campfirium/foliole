#!/usr/bin/env node
/* global console, process, setTimeout, clearTimeout, setInterval, clearInterval */

import { readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { Bonjour } from 'bonjour-service';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DISCOVERY_TIMEOUT_MS = 10_000;
const QUERY_INTERVAL_MS = 500;

export function resolveLinuxMdnsObserverOptions(env = process.env, argv = process.argv.slice(2)) {
  const networkInterface = argv.find((arg) => arg.startsWith('--interface='))?.slice(12)
    || env.FOLIOLE_LINUX_MDNS_PEER_ADDRESS;
  if (!networkInterface) throw new Error('Linux mDNS peer address is not configured');
  return { bind: '0.0.0.0', interface: networkInterface };
}

function resolveEvidencePath(argv = process.argv.slice(2)) {
  return argv.find((arg) => arg.startsWith('--evidence='))?.slice(11);
}

function resolveInterfaceName(address) {
  return Object.entries(os.networkInterfaces()).find(([, entries]) => (
    entries?.some((entry) => entry.family === 'IPv4' && entry.address === address)
  ))?.[0] ?? null;
}

async function readNetworkEvidence(address) {
  const interfaceName = resolveInterfaceName(address);
  const [devices, memberships, routes] = await Promise.all([
    readFile('/proc/net/dev', 'utf8'),
    readFile('/proc/net/igmp', 'utf8'),
    readFile('/proc/net/route', 'utf8')
  ]);
  return { address, devices, interfaceName, memberships, routes };
}

export function waitForObserverStart(
  argv, input = process.stdin, reportReady = (message) => console.log(message)
) {
  if (!argv.includes('--controlled')) return Promise.resolve();
  reportReady(JSON.stringify({ status: 'ready' }));
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      input.pause();
      reject(new Error('Linux mDNS observer was not started'));
    }, DISCOVERY_TIMEOUT_MS);
    input.setEncoding('utf8');
    input.once('data', () => {
      clearTimeout(timeout);
      input.pause();
      resolve();
    });
    input.resume();
  });
}

function waitForMdnsReady(mdns) {
  return new Promise((resolve, reject) => {
    mdns.once('ready', resolve);
    mdns.once('error', reject);
  });
}

export async function discoverFolioleMdnsService(env = process.env, argv = process.argv.slice(2)) {
  const options = resolveLinuxMdnsObserverOptions(env, argv);
  const bonjour = new Bonjour(options);
  const evidence = {
    completedAt: null, discoveryStartedAt: null, queryAttempts: [],
    readyAt: null, responses: [], status: 'starting'
  };
  bonjour.server.mdns.on('response', (packet, rinfo) => {
    evidence.responses.push({
      address: rinfo.address,
      answerTypes: packet.answers.map((answer) => answer.type),
      at: new Date().toISOString(),
      port: rinfo.port
    });
  });
  try {
    await waitForMdnsReady(bonjour.server.mdns);
    evidence.readyAt = new Date().toISOString();
    evidence.networkBefore = await readNetworkEvidence(options.interface);
    await waitForObserverStart(argv);
    evidence.discoveryStartedAt = new Date().toISOString();
    const service = await new Promise((resolve, reject) => {
      let queryInterval;
      let timeout;
      const browser = bonjour.find({ protocol: 'tcp', type: 'foliole-sync' }, (discovered) => {
        clearTimeout(timeout);
        clearInterval(queryInterval);
        resolve(discovered);
      });
      const query = () => {
        evidence.queryAttempts.push(new Date().toISOString());
        browser.update();
      };
      queryInterval = setInterval(query, QUERY_INTERVAL_MS);
      timeout = setTimeout(() => {
        clearInterval(queryInterval);
        reject(new Error('Foliole mDNS service was not discovered'));
      }, DISCOVERY_TIMEOUT_MS);
      query();
    });
    evidence.status = 'discovered';
    return { port: service.port, txt: service.txt };
  } catch (error) {
    evidence.status = 'failed';
    throw error;
  } finally {
    evidence.completedAt = new Date().toISOString();
    evidence.networkAfter = await readNetworkEvidence(options.interface).catch(() => null);
    const evidencePath = resolveEvidencePath(argv);
    if (evidencePath) await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
    bonjour.destroy();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  discoverFolioleMdnsService().then((service) => {
    console.log(JSON.stringify(service));
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
