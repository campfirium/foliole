/* global AbortSignal, clearTimeout, fetch, setTimeout */

import os from 'node:os';

import { Bonjour } from 'bonjour-service';

function serviceIpv4Candidates(service) {
  const advertised = typeof service.txt?.ipv4_addresses === 'string'
    ? service.txt.ipv4_addresses.split(',') : [];
  return [...new Set([service.referer?.address, ...(service.addresses ?? []), ...advertised]
    .filter((value) => /^\d+\.\d+\.\d+\.\d+$/u.test(value ?? '')))];
}

async function probeCurrentProvider(service, expected, fetchProvider) {
  if (service.txt?.group_id !== expected.groupId
      || service.txt?.device_id !== expected.deviceId || !Number(service.port)) return null;
  for (const host of serviceIpv4Candidates(service)) {
    try {
      const endpointUrl = `http://${host}:${service.port}`;
      const response = await fetchProvider(`${endpointUrl}/companion/discovery`, {
        signal: AbortSignal.timeout(2_000)
      });
      const payload = response.ok ? await response.json() : null;
      if (payload?.group_id === expected.groupId
          && payload?.provider_device_id === expected.deviceId) return endpointUrl;
    } catch { /* Try the next address from this Device advertisement. */ }
  }
  return null;
}

export async function waitForCurrentA5Provider(expected, {
  createBonjour = (options) => new Bonjour(options), fetchProvider = fetch,
  interfaces = os.networkInterfaces(), timeoutMs = 30_000
} = {}) {
  const addresses = [...new Set(Object.values(interfaces).flatMap((entries) => entries ?? [])
    .filter((entry) => entry.family === 'IPv4' && !entry.internal)
    .map((entry) => entry.address))];
  const runtimes = [];
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(
        'Current A5 Device provider was not published before desktop sync.'
      )), timeoutMs);
      const collect = async (service) => {
        const endpointUrl = await probeCurrentProvider(service, expected, fetchProvider);
        if (!endpointUrl) return;
        clearTimeout(timer);
        resolve({ deviceId: expected.deviceId, endpointUrl, groupId: expected.groupId });
      };
      [null, ...addresses].forEach((networkInterface) => {
        const bonjour = createBonjour(networkInterface ? { interface: networkInterface } : undefined);
        const browser = bonjour.find({ protocol: 'tcp', type: 'foliole-sync' }, collect);
        runtimes.push({ bonjour, browser });
      });
    });
  } finally {
    runtimes.forEach(({ bonjour, browser }) => {
      browser.stop();
      bonjour.destroy();
    });
  }
}
