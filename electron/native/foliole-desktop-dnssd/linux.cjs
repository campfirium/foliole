'use strict';

const { Bonjour } = require('bonjour-service');

exports.Bonjour = Bonjour;

exports.register = (input, callback) => {
  const bonjour = new Bonjour();
  const service = bonjour.publish({
    host: input.host,
    name: input.name,
    port: input.port,
    protocol: 'tcp',
    txt: input.txt,
    type: 'foliole-sync'
  });
  service.once('up', () => callback({ kind: 'registered', service: normalize(service) }));
  service.once('error', (error) => callback(errorEvent(error)));
  let stopped = false;
  return { stop() {
    if (stopped) return;
    stopped = true;
    service.stop(() => bonjour.destroy());
  } };
};

exports.browse = (_input, callback) => {
  const bonjour = new Bonjour();
  const browser = bonjour.find({ protocol: 'tcp', type: 'foliole-sync' });
  browser.on('up', (service) => callback({ kind: 'found', service: normalize(service) }));
  browser.on('txt-update', (service) => callback({ kind: 'changed', service: normalize(service) }));
  browser.on('srv-update', (service) => callback({ kind: 'changed', service: normalize(service) }));
  browser.on('down', (service) => callback({ kind: 'lost', service: normalize(service) }));
  let stopped = false;
  return { stop() {
    if (stopped) return;
    stopped = true;
    browser.stop();
    bonjour.destroy();
  } };
};

function normalize(service) {
  return {
    addresses: service.addresses ?? [],
    domain: 'local.',
    fqdn: service.fqdn ?? '',
    host: service.host ?? '',
    interfaceIndex: 0,
    name: service.name ?? '',
    port: service.port ?? 0,
    txt: service.txt ?? {},
    type: '_foliole-sync._tcp'
  };
}

function errorEvent(error) {
  return { code: 'desktop_dnssd_host_error', kind: 'error', message: String(error?.message ?? error) };
}
