#!/usr/bin/env node
/* global console, process, setTimeout, clearTimeout */

import { Bonjour } from 'bonjour-service';

const bonjour = new Bonjour();
try {
  const service = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Foliole mDNS service was not discovered')), 10_000);
    bonjour.find({ protocol: 'tcp', type: 'foliole-sync' }, (discovered) => {
      clearTimeout(timeout);
      resolve(discovered);
    });
  });
  console.log(JSON.stringify({ port: service.port, txt: service.txt }));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  bonjour.destroy();
}
