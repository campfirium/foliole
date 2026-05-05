import { promises as fs } from 'node:fs';
import path from 'node:path';

const MAX_BOOT_EVENTS = 20;
const MAX_MAIN_PROCESS_LOGS = 120;
const MAX_RENDERER_CONSOLE_MESSAGES = 80;

function createRingBuffer(limit) {
  const entries = [];

  return {
    push(value) {
      entries.push(value);
      if (entries.length > limit) {
        entries.splice(0, entries.length - limit);
      }
    },
    snapshot() {
      return [...entries];
    }
  };
}

function toTimestampedEntry(payload) {
  return {
    ...payload,
    timestamp: new Date().toISOString()
  };
}

export function createRendererConsoleCollector(windowPage, limit = MAX_RENDERER_CONSOLE_MESSAGES) {
  const buffer = createRingBuffer(limit);
  const listener = (message) => {
    buffer.push(
      toTimestampedEntry({
        location: message.location(),
        text: message.text(),
        type: message.type()
      })
    );
  };

  if (typeof windowPage.on === 'function') {
    windowPage.on('console', listener);
  }

  return {
    dispose() {
      if (typeof windowPage.off === 'function') {
        windowPage.off('console', listener);
      }
    },
    snapshot() {
      return buffer.snapshot();
    }
  };
}

function bindProcessStream(stream, logBuffer, streamName) {
  if (!stream?.on) {
    return () => undefined;
  }

  const listener = (chunk) => {
    logBuffer.push(
      toTimestampedEntry({
        stream: streamName,
        text: chunk.toString('utf8')
      })
    );
  };

  stream.on('data', listener);
  return () => {
    if (typeof stream.off === 'function') {
      stream.off('data', listener);
      return;
    }
    stream.removeListener('data', listener);
  };
}

export function createMainProcessLogCollector(childProcess, limit = MAX_MAIN_PROCESS_LOGS) {
  const buffer = createRingBuffer(limit);
  const unbindStdout = bindProcessStream(childProcess?.stdout, buffer, 'stdout');
  const unbindStderr = bindProcessStream(childProcess?.stderr, buffer, 'stderr');

  return {
    dispose() {
      unbindStdout();
      unbindStderr();
    },
    snapshot() {
      const entries = buffer.snapshot();
      return {
        entries,
        stderrTail: entries.filter((entry) => entry.stream === 'stderr').map((entry) => entry.text),
        stdoutTail: entries.filter((entry) => entry.stream === 'stdout').map((entry) => entry.text)
      };
    }
  };
}

async function readJsonFile(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    return {
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function readNdjsonTail(filePath, limit) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .slice(-limit)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return { raw: line };
        }
      });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    return [{ error: error instanceof Error ? error.message : String(error) }];
  }
}

async function readDesktopDebugProbe(windowPage) {
  try {
    return await windowPage.evaluate(
      () => globalThis.__FOLIOLE_DESKTOP_DEBUG_PROBE__?.getSnapshot?.() ?? null
    );
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function readBootDiagnostics(appRoot) {
  const readyMarkerPath = path.join(appRoot, '.windows-native-boot-ready.json');
  const bootEventLogPath = path.join(appRoot, 'logs', 'windows', 'native-boot-events.ndjson');

  const [readyMarker, bootEvents] = await Promise.all([
    readJsonFile(readyMarkerPath),
    readNdjsonTail(bootEventLogPath, MAX_BOOT_EVENTS)
  ]);

  return {
    bootEventLogPath,
    bootEvents,
    readyMarker,
    readyMarkerPath
  };
}

export async function collectDesktopFailureDiagnostics({
  appRoot,
  mainProcessCollector,
  rendererConsoleCollector,
  windowPage
}) {
  const [boot, debugProbe] = await Promise.all([
    readBootDiagnostics(appRoot),
    readDesktopDebugProbe(windowPage)
  ]);

  return {
    boot,
    bridgeAvailable: debugProbe?.bridgeAvailable ?? null,
    collectedAt: new Date().toISOString(),
    debugProbe,
    mainProcessLogs: mainProcessCollector.snapshot(),
    nativeInvokeHistory: debugProbe?.recentInvokes ?? [],
    rendererConsole: rendererConsoleCollector.snapshot(),
    runtimeHead: debugProbe?.runtimeHead ?? null
  };
}
