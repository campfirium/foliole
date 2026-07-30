export const WINDOWS_ANDROID_DIAGNOSTIC_PORTS = [5037, 5601];

function array(value) {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function text(value) {
  return typeof value === 'string' ? value : null;
}

function integer(value) {
  if (value == null || value === '') return null;
  return Number.isInteger(Number(value)) ? Number(value) : null;
}

function safeProcess(value = {}) {
  return {
    imagePath: text(value.imagePath),
    imageSha256: text(value.imageSha256),
    name: text(value.name),
    owner: text(value.owner),
    parentProcessId: integer(value.parentProcessId),
    processId: integer(value.processId),
    sessionId: integer(value.sessionId)
  };
}

function safeListener(value = {}) {
  return {
    localAddress: text(value.localAddress),
    localPort: integer(value.localPort),
    owningProcess: integer(value.owningProcess),
    state: text(value.state)
  };
}

export function redactDiagnosticText(value) {
  return String(value || '')
    .replace(/-----BEGIN [^-]+PRIVATE KEY-----[\s\S]*?-----END [^-]+PRIVATE KEY-----/gu, '[redacted-private-key]')
    .replace(/\b(ssh-(?:ed25519|rsa)|ecdsa-[^\s]+)\s+[A-Za-z0-9+/=]{20,}/gu, '$1 [redacted-key]')
    .replace(/\b(?:token|password|secret)=\S+/giu, '[redacted-secret]')
    .slice(0, 2_000);
}

export function normalizeHostSnapshot(raw = {}) {
  return {
    adbClient: safeProcess(raw.adbClient),
    adbProcesses: array(raw.adbProcesses).map(safeProcess),
    authorizedKeys: {
      entries: array(raw.authorizedKeys?.entries).map((entry) => ({
        forcedCommand: Boolean(entry.forcedCommand),
        keySha256: text(entry.keySha256),
        keyType: text(entry.keyType),
        restrictions: array(entry.restrictions).map(text).filter(Boolean)
      })),
      path: text(raw.authorizedKeys?.path)
    },
    capturedAt: text(raw.capturedAt),
    listeners: array(raw.listeners).map(safeListener),
    oldRuntime: {
      entries: array(raw.oldRuntime?.entries).map((entry) => ({
        lastWriteTimeUtc: text(entry.lastWriteTimeUtc),
        length: integer(entry.length),
        name: text(entry.name),
        type: text(entry.type)
      })),
      exists: Boolean(raw.oldRuntime?.exists),
      root: text(raw.oldRuntime?.root)
    },
    pnpDevices: array(raw.pnpDevices).map((device) => ({
      class: text(device.class),
      instanceId: text(device.instanceId),
      name: text(device.name),
      status: text(device.status)
    })),
    scheduledTask: raw.scheduledTask ? {
      actions: array(raw.scheduledTask.actions).map((action) => ({
        arguments: text(action.arguments), execute: text(action.execute), workingDirectory: text(action.workingDirectory)
      })),
      lastTaskResult: integer(raw.scheduledTask.lastTaskResult),
      name: text(raw.scheduledTask.name),
      principal: text(raw.scheduledTask.principal),
      state: text(raw.scheduledTask.state),
      taskPath: text(raw.scheduledTask.taskPath)
    } : null,
    sshSession: {
      clientAddress: text(raw.sshSession?.clientAddress),
      clientPort: integer(raw.sshSession?.clientPort),
      parentProcessId: integer(raw.sshSession?.parentProcessId),
      processId: integer(raw.sshSession?.processId),
      serverAddress: text(raw.sshSession?.serverAddress),
      serverPort: integer(raw.sshSession?.serverPort),
      sessionId: integer(raw.sshSession?.sessionId),
      user: text(raw.sshSession?.user)
    }
  };
}

function normalizedImagePath(value) {
  return String(value || '').replaceAll('/', '\\').toLowerCase();
}

function listenerIdentity(snapshot, port) {
  return snapshot.listeners.filter((item) => item.localPort === port)
    .map((item) => `${item.localAddress}|${item.localPort}|${item.owningProcess}`).sort();
}

function connectAddress(listeners) {
  const addresses = listeners.map((item) => item.localAddress);
  if (addresses.some((item) => item === '127.0.0.1' || item === '0.0.0.0')) return '127.0.0.1';
  if (addresses.some((item) => item === '::1' || item === '::')) return '::1';
  return addresses[0];
}

export function planTransportProbes(snapshot) {
  return WINDOWS_ANDROID_DIAGNOSTIC_PORTS.map((port) => {
    const listeners = snapshot.listeners.filter((item) => item.localPort === port);
    if (listeners.length === 0) return { port, status: 'not-listening' };
    const owners = [...new Set(listeners.map((item) => item.owningProcess))];
    if (owners.length !== 1) return { port, reason: 'multiple-listener-owners', status: 'not-probed' };
    const owner = snapshot.adbProcesses.find((item) => item.processId === owners[0]);
    if (!owner?.owner || !owner.imagePath || !owner.imageSha256) {
      throw new Error(`ADB listener owner could not be resolved for port ${port}`);
    }
    const client = snapshot.adbClient;
    const samePath = normalizedImagePath(owner.imagePath) === normalizedImagePath(client.imagePath);
    const sameHash = owner.imageSha256?.toLowerCase() === client.imageSha256?.toLowerCase();
    if (!samePath || !sameHash) {
      return { port, reason: samePath ? 'image-hash-mismatch' : 'image-path-mismatch', status: 'version-mismatch-not-probed' };
    }
    return { address: connectAddress(listeners), port, status: 'probe-ready' };
  });
}

export function parseAdbDevicesLong(payload) {
  return String(payload || '').split(/\r?\n/u).filter(Boolean).map((line) => {
    const match = /^(\S+)\t(\S+)(?:\s+(.*))?$/u.exec(line);
    if (!match) throw new Error('ADB devices-l returned an invalid transport row');
    const details = Object.fromEntries((match[3] || '').split(/\s+/u).filter(Boolean).map((part) => {
      const index = part.indexOf(':');
      return index < 1 ? [part, true] : [part.slice(0, index), part.slice(index + 1)];
    }));
    return { details, serial: match[1], state: match[2] };
  });
}

export function finalizeTransportResults(before, after, results) {
  return results.map((result) => {
    if (!['empty', 'present'].includes(result.status)) return result;
    const beforeIdentity = listenerIdentity(before, result.port);
    const afterIdentity = listenerIdentity(after, result.port);
    if (JSON.stringify(beforeIdentity) === JSON.stringify(afterIdentity)) return result;
    return { ...result, afterIdentity, beforeIdentity, status: 'probe-mutated-state' };
  });
}
