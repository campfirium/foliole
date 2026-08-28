'use strict';

/* global Buffer, process */

const SERVICE_TYPE = '_foliole-sync._tcp';
const DOMAIN = 'local.';
const LIMITS = Object.freeze({
  addressCount: 16, eventTextBytes: 1024, nameBytes: 63,
  txtBytes: 1300, txtEntries: 32, txtEntryBytes: 255
});

function bytes(value) {
  return typeof value === 'string' ? Buffer.byteLength(value, 'utf8') : -1;
}

function validateBase(input) {
  if (!input || input.type !== SERVICE_TYPE || input.domain !== DOMAIN) {
    throw new TypeError('desktop_dnssd_service_contract_invalid');
  }
}

function validateName(name) {
  const length = bytes(name);
  if (length < 1 || length > LIMITS.nameBytes) {
    throw new TypeError('desktop_dnssd_name_invalid');
  }
}

function validateTxt(txt) {
  if (!txt || Array.isArray(txt) || typeof txt !== 'object') {
    throw new TypeError('desktop_dnssd_txt_invalid');
  }
  const entries = Object.entries(txt);
  const total = entries.reduce((sum, [key, value]) => {
    if (bytes(key) < 1 || bytes(key) > 63 || bytes(value) < 0
        || bytes(`${key}=${value}`) > LIMITS.txtEntryBytes) {
      throw new TypeError('desktop_dnssd_txt_invalid');
    }
    return sum + bytes(key) + bytes(value) + 2;
  }, 0);
  if (entries.length > LIMITS.txtEntries || total > LIMITS.txtBytes) {
    throw new TypeError('desktop_dnssd_txt_invalid');
  }
}

function validateInput(kind, input) {
  validateBase(input);
  if (kind !== 'browse') validateName(input.name);
  if (kind === 'register') {
    if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
      throw new TypeError('desktop_dnssd_port_invalid');
    }
    validateTxt(input.txt);
    if (input.host !== undefined && bytes(input.host) > 255) {
      throw new TypeError('desktop_dnssd_host_invalid');
    }
  }
  if (input.interfaceIndex !== undefined
      && (!Number.isInteger(input.interfaceIndex) || input.interfaceIndex < 0
        || input.interfaceIndex > 0xffffffff)) {
    throw new TypeError('desktop_dnssd_interface_invalid');
  }
}

function validService(service) {
  return service && bytes(service.name ?? '') <= LIMITS.nameBytes
    && bytes(service.domain ?? '') <= 255 && bytes(service.type ?? '') <= 255
    && bytes(service.fqdn ?? '') <= 255 && bytes(service.host ?? '') <= 255
    && Number.isInteger(service.port) && service.port >= 0 && service.port <= 65535
    && Number.isInteger(service.interfaceIndex) && service.interfaceIndex >= 0
    && Array.isArray(service.addresses) && service.addresses.length <= LIMITS.addressCount
    && service.addresses.every((entry) => bytes(entry) >= 1 && bytes(entry) <= 64)
    && (() => { try { validateTxt(service.txt ?? {}); return true; } catch { return false; } })();
}

function normalizeEvent(event) {
  if (!event || !['found', 'changed', 'lost', 'registered', 'error'].includes(event.kind)) {
    throw new TypeError('desktop_dnssd_host_event_invalid');
  }
  if (event.kind === 'error') {
    if (bytes(event.code) < 1 || bytes(event.code) > 128
        || bytes(event.message) < 0 || bytes(event.message) > LIMITS.eventTextBytes) {
      throw new TypeError('desktop_dnssd_host_event_invalid');
    }
    return { code: event.code, kind: 'error', message: event.message };
  }
  if (!validService(event.service)) throw new TypeError('desktop_dnssd_host_event_invalid');
  return event;
}

function loadBackend() {
  if (process.platform !== 'darwin' && process.platform !== 'win32') {
    throw new Error('desktop_dnssd_unavailable');
  }
  return require('./build/Release/foliole_desktop_dnssd.node');
}

function createCapability(backend = loadBackend()) {
  const begin = (kind, input, callback) => {
    validateInput(kind, input);
    if (typeof callback !== 'function') throw new TypeError('desktop_dnssd_callback_invalid');
    let handle;
    let rejected = false;
    const guarded = (event) => {
      if (rejected) return;
      let normalized;
      try {
        normalized = normalizeEvent(event);
      } catch {
        rejected = true;
        handle?.cancel();
        callback({ code: 'desktop_dnssd_host_event_invalid', kind: 'error',
          message: 'The operating-system DNS-SD host returned an invalid event.' });
        return;
      }
      callback(normalized);
    };
    handle = backend[kind](input, guarded);
    const cancel = () => handle.cancel();
    return Object.freeze({ cancel, stop: cancel });
  };
  return Object.freeze({
    browse: (input, callback) => begin('browse', input, callback),
    register: (input, callback) => begin('register', input, callback),
    resolve: (input, callback) => begin('resolve', input, callback)
  });
}

let defaultCapability;
function getDefaultCapability() {
  defaultCapability ??= createCapability();
  return defaultCapability;
}

exports.browse = (input, callback) => getDefaultCapability().browse(input, callback);
exports.register = (input, callback) => getDefaultCapability().register(input, callback);
exports.resolve = (input, callback) => getDefaultCapability().resolve(input, callback);
exports._createCapability = createCapability;
