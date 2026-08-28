#!/usr/bin/env node
/* global Buffer, console, process, setTimeout, clearTimeout, setInterval, clearInterval */

import { readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { Bonjour } from '@foliole/desktop-dnssd/linux.cjs';
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
  const values = devices.split('\n').find((line) => line.trimStart().startsWith(`${interfaceName}:`))
    ?.split(':')[1].trim().split(/\s+/u).map(Number);
  const counters = values ? {
    received: { bytes: values[0], dropped: values[3], errors: values[2], packets: values[1] },
    transmitted: { bytes: values[8], dropped: values[11], errors: values[10], packets: values[9] }
  } : null;
  return { address, counters, devices, interfaceName, memberships, routes };
}

function waitForObserverStart(
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

function serializeMdnsData(data) {
  if (Buffer.isBuffer(data)) return { base64: data.toString('base64') };
  if (Array.isArray(data)) return data.map(serializeMdnsData);
  if (data && typeof data === 'object') {
    return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, serializeMdnsData(value)]));
  }
  return data;
}

export function summarizeMdnsPacket(packet, rinfo) {
  const records = (items = []) => items.map(({ data, name, ttl, type }) => ({
    data: serializeMdnsData(data), name, ttl, type
  }));
  return {
    additionals: records(packet.additionals), answers: records(packet.answers),
    authorities: records(packet.authorities), flags: packet.flags, id: packet.id,
    questions: (packet.questions ?? []).map(({ name, type }) => ({ name, type })),
    source: { address: rinfo.address, family: rinfo.family, port: rinfo.port, size: rinfo.size },
    type: packet.type
  };
}

export function attachMdnsEvidence(mdns, evidence, now = () => new Date().toISOString()) {
  const recordPacket = (collection) => (packet, rinfo) => collection.push({
    at: now(), ...summarizeMdnsPacket(packet, rinfo)
  });
  mdns.on('packet', recordPacket(evidence.packets));
  mdns.on('query', recordPacket(evidence.queries));
  mdns.on('response', recordPacket(evidence.responses));
  mdns.on('warning', (warning) => evidence.warnings.push({
    at: now(), code: warning.code ?? null, message: warning.message, name: warning.name
  }));
}

function waitForMdnsReady(mdns) {
  return new Promise((resolve, reject) => {
    mdns.once('ready', resolve);
    mdns.once('error', reject);
  });
}

function diffNetworkCounters(before, after) {
  if (!before?.counters || !after?.counters) return null;
  return {
    received: {
      bytes: after.counters.received.bytes - before.counters.received.bytes,
      packets: after.counters.received.packets - before.counters.received.packets
    },
    transmitted: {
      bytes: after.counters.transmitted.bytes - before.counters.transmitted.bytes,
      packets: after.counters.transmitted.packets - before.counters.transmitted.packets
    }
  };
}

export async function discoverFolioleMdnsService(env = process.env, argv = process.argv.slice(2)) {
  const options = resolveLinuxMdnsObserverOptions(env, argv);
  const bonjour = new Bonjour(options);
  const evidence = {
    completedAt: null, discoveryStartedAt: null, queryAttempts: [],
    packets: [], queries: [], readyAt: null, responses: [], status: 'starting', warnings: []
  };
  attachMdnsEvidence(bonjour.server.mdns, evidence);
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
        evidence.queryAttempts.push({
          at: new Date().toISOString(), name: '_foliole-sync._tcp.local', type: 'PTR'
        });
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
    evidence.networkDelta = diffNetworkCounters(evidence.networkBefore, evidence.networkAfter);
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
