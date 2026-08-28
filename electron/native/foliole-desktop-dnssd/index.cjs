'use strict';

/* global Buffer, process */

const SERVICE_TYPE = '_foliole-sync._tcp';
const DOMAIN = 'local.';

function validateInput(input, registration) {
  if (!input || input.type !== SERVICE_TYPE || input.domain !== DOMAIN) {
    throw new TypeError('desktop_dnssd_service_contract_invalid');
  }
  if (registration && (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535)) {
    throw new TypeError('desktop_dnssd_port_invalid');
  }
  if (registration && (typeof input.name !== 'string' || input.name.length < 1 || input.name.length > 63)) {
    throw new TypeError('desktop_dnssd_name_invalid');
  }
  if (registration && Object.entries(input.txt ?? {}).some(([key, value]) =>
    !key || key.length > 63 || typeof value !== 'string' || Buffer.byteLength(`${key}=${value}`) > 255)) {
    throw new TypeError('desktop_dnssd_txt_invalid');
  }
}

function loadBackend() {
  if (process.platform === 'darwin' || process.platform === 'win32') {
    return require('./build/Release/foliole_desktop_dnssd.node');
  }
  if (process.platform === 'linux') return require('./linux.cjs');
  throw new Error('desktop_dnssd_unavailable');
}

let backend;
function getBackend() {
  backend ??= loadBackend();
  return backend;
}

exports.browse = (input, callback) => {
  validateInput(input, false);
  if (typeof callback !== 'function') throw new TypeError('desktop_dnssd_callback_invalid');
  return getBackend().browse(input, callback);
};

exports.register = (input, callback) => {
  validateInput(input, true);
  if (typeof callback !== 'function') throw new TypeError('desktop_dnssd_callback_invalid');
  return getBackend().register(input, callback);
};
