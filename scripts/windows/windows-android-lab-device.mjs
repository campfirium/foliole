import { isAndroidEndpoint, parseReadyDevices, readJson, writeJsonAtomic } from './windows-android-lab-state.mjs';

const USB_SERIAL = /^[A-Za-z0-9._-]{4,128}$/u;

export function codedLabError(code, message) {
  return Object.assign(new Error(message), { code });
}

export function validateAndroidLabConfig(config) {
  if (config?.schemaVersion !== 2 || !config.deviceIdentity) {
    throw codedLabError('android_lab_config_upgrade_required', 'Android Lab config v2 is required; rerun the installer');
  }
  return config;
}

async function checked(executeCommand, command, args, code) {
  const result = await executeCommand(command, args, { timeoutCode: `${code}_timeout`, timeoutMs: 30_000 });
  if (result.code !== undefined && result.code !== 0) {
    throw codedLabError(code, result.lines?.at(-1) || result.output?.trim() || `${command} failed`);
  }
  return result;
}

async function readDeviceIdentity(config, endpoint, executeCommand) {
  const result = await checked(executeCommand, config.adbPath, [
    '-s', endpoint, 'shell', 'getprop', 'ro.serialno'
  ], 'device_identity_read_failed');
  return result.output.trim();
}

async function connectAndVerify(config, endpoint, ready, executeCommand) {
  if (!ready.has(endpoint)) {
    if (!isAndroidEndpoint(endpoint)) {
      throw codedLabError('device_connect_failed', `USB device ${endpoint} is not ready`);
    }
    await checked(executeCommand, config.adbPath, ['connect', endpoint], 'device_connect_failed');
  }
  const identity = await readDeviceIdentity(config, endpoint, executeCommand);
  if (identity !== config.deviceIdentity) {
    throw codedLabError('device_identity_mismatch', `expected ${config.deviceIdentity}; found ${identity || 'none'}`);
  }
  return identity;
}

export function parseMdnsEndpoints(output) {
  const endpoints = String(output || '').match(/\b\d{1,3}(?:\.\d{1,3}){3}:\d{1,5}\b/gu) || [];
  return [...new Set(endpoints.filter(isAndroidEndpoint))];
}

export function isAndroidDeviceSelector(value) {
  return isAndroidEndpoint(value) || USB_SERIAL.test(String(value || ''));
}

export async function reconnectAndroidDevice(config, endpoint, paths, executeCommand, source = 'manual') {
  validateAndroidLabConfig(config);
  if (!isAndroidDeviceSelector(endpoint)) throw codedLabError('device_endpoint_invalid', 'device endpoint must be ipv4:port or USB serial');
  const devices = await checked(executeCommand, config.adbPath, ['devices'], 'adb_devices_failed');
  const ready = new Set(parseReadyDevices(devices.output));
  const identity = await connectAndVerify(config, endpoint, ready, executeCommand);
  const after = await checked(executeCommand, config.adbPath, ['devices'], 'adb_devices_failed');
  const connected = parseReadyDevices(after.output);
  if (connected.length !== 1 || connected[0] !== endpoint) {
    throw codedLabError('android_device_not_exclusive', `expected only ${endpoint}; found ${connected.join(',') || 'none'}`);
  }
  const device = { discoverySource: source, endpoint, identity, schemaVersion: 1, verifiedAt: new Date().toISOString() };
  writeJsonAtomic(paths.device, device);
  return device;
}

export async function resolveAndroidDevice(config, paths, executeCommand) {
  validateAndroidLabConfig(config);
  const devices = await checked(executeCommand, config.adbPath, ['devices'], 'adb_devices_failed');
  const ready = new Set(parseReadyDevices(devices.output));
  const previous = readJson(paths.device);
  const candidates = [...ready].filter(isAndroidDeviceSelector);
  if (isAndroidDeviceSelector(previous?.endpoint)) candidates.unshift(previous.endpoint);
  const seen = new Set();
  const tryCandidates = async (values) => {
    for (const endpoint of values) {
      if (seen.has(endpoint)) continue;
      seen.add(endpoint);
      try {
        const source = endpoint === previous?.endpoint
          ? 'previous' : isAndroidEndpoint(endpoint) ? ready.has(endpoint) ? 'ready' : 'mdns' : 'usb';
        return await reconnectAndroidDevice(config, endpoint, paths, executeCommand, source);
      } catch (error) {
        if (!['device_connect_failed', 'device_identity_mismatch', 'device_identity_read_failed'].includes(error.code)) throw error;
      }
    }
    return null;
  };
  const current = await tryCandidates(candidates);
  if (current) return current;
  let discovered = [];
  try {
    const mdns = await checked(executeCommand, config.adbPath, ['mdns', 'services'], 'adb_mdns_failed');
    discovered = parseMdnsEndpoints(mdns.output);
  } catch {
    // mDNS is an optional discovery adapter; manual reconnect remains explicit.
  }
  const mdnsDevice = await tryCandidates(discovered);
  if (mdnsDevice) return mdnsDevice;
  throw codedLabError('device_unreachable', `A5 endpoint could not be resolved; last known ${previous?.endpoint || 'none'}`);
}
