#!/usr/bin/env node
/* global console, process, setTimeout, clearTimeout */

import { Bonjour } from 'bonjour-service';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function resolveLinuxMdnsObserverOptions(env = process.env, argv = process.argv.slice(2)) {
  const networkInterface = argv.find((arg) => arg.startsWith('--interface='))?.slice(12)
    || env.FOLIOLE_LINUX_MDNS_PEER_ADDRESS;
  if (!networkInterface) throw new Error('Linux mDNS peer address is not configured');
  return { interface: networkInterface };
}

export async function discoverFolioleMdnsService(env = process.env) {
  const bonjour = new Bonjour(resolveLinuxMdnsObserverOptions(env));
  try {
    const service = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Foliole mDNS service was not discovered')), 10_000);
      bonjour.find({ protocol: 'tcp', type: 'foliole-sync' }, (discovered) => {
        clearTimeout(timeout);
        resolve(discovered);
      });
    });
    return { port: service.port, txt: service.txt };
  } finally {
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
