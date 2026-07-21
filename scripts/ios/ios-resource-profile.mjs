/* global process */

const RESOURCE_MODE_ENV = 'FOLIOLE_IOS_RESOURCE_MODE';
const BACKGROUND_MODE = 'background';
const FULL_MODE = 'full';

export function resolveIosResourceMode(env = process.env) {
  const mode = env[RESOURCE_MODE_ENV]?.trim() || BACKGROUND_MODE;
  if (mode !== BACKGROUND_MODE && mode !== FULL_MODE) {
    throw new Error(`Invalid ${RESOURCE_MODE_ENV}: ${mode}`);
  }
  return mode;
}

export function iosXcodebuildResourceArgs(mode, { testing = false } = {}) {
  if (mode === FULL_MODE) return [];
  const args = ['-jobs', '1'];
  if (testing) {
    args.push(
      '-maximum-concurrent-test-simulator-destinations', '1',
      '-parallel-testing-enabled', 'NO',
      '-maximum-parallel-testing-workers', '1'
    );
  }
  return args;
}

export function iosSwiftResourceArgs(mode) {
  return mode === FULL_MODE ? [] : ['--jobs', '1'];
}

export function iosVitestResourceArgs(mode) {
  return mode === FULL_MODE ? [] : ['--maxWorkers=1', '--no-file-parallelism'];
}

export function iosResourceCommand(command, args, mode, platform = process.platform) {
  if (mode === FULL_MODE || platform !== 'darwin') return { args, command };
  return { args: ['-b', command, ...args], command: '/usr/sbin/taskpolicy' };
}
