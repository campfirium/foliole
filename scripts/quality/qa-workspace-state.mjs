import { execFileSync } from 'node:child_process';
import { accessSync, constants, existsSync, lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

export const QA_BRANCH = 'codex/qa';

export function qaGit(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
}

export function qaRecordPath(repoRoot) {
  return path.join(qaGit(repoRoot, 'rev-parse', '--path-format=absolute', '--git-common-dir'),
    'foliole-qa-workspace.json');
}

export function readQaWorkspace(repoRoot) {
  const recordPath = qaRecordPath(repoRoot);
  if (!existsSync(recordPath)) return { phase: 'idle' };
  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  if (record.schemaVersion !== 1 || record.branch !== QA_BRANCH || !record.owner
      || !path.isAbsolute(record.worktreePath) || !path.isAbsolute(record.devRoot)) {
    throw new Error('Invalid QA workspace record; preserve it for recovery');
  }
  if (!existsSync(record.worktreePath)) {
    return { ...record, phase: record.phase === 'finishing' ? 'finishing' : 'unavailable', available: false };
  }
  const branch = qaGit(record.worktreePath, 'branch', '--show-current');
  if (branch !== QA_BRANCH) throw new Error('QA workspace branch changed; recovery required');
  return { ...record, head: qaGit(record.worktreePath, 'rev-parse', 'HEAD') };
}

export function verifyMountedQaVolume(volumeRoot) {
  const canonical = realpathSync(volumeRoot);
  if (canonical === path.parse(canonical).root
      || statSync(canonical).dev === statSync(path.dirname(canonical)).dev) {
    throw new Error('QA volume is not a mounted filesystem');
  }
  accessSync(canonical, constants.W_OK);
  return canonical;
}

export function assertQaPrivateDirectories(worktreePath) {
  for (const name of ['node_modules', '.tmp', '.cache', '.lab', 'dist', 'android', 'ios']) {
    const directory = path.join(worktreePath, name);
    const entry = lstatSync(directory, { throwIfNoEntry: false });
    if (!entry) continue;
    if (entry.isSymbolicLink()
        || !realpathSync(directory).startsWith(`${realpathSync(worktreePath)}${path.sep}`)) {
      throw new Error(`QA working directory must be private: ${name}`);
    }
  }
}

export function qaWorkspaceEnvironment(record, inherited = {}) {
  assertQaPrivateDirectories(record.worktreePath);
  const isolated = { ...inherited };
  for (const key of ['FOLIOLE_ELECTRON_EXECUTABLE_PATH', 'FOLIOLE_ELECTRON_INSTALLED_EXE_PATH',
    'FOLIOLE_ELECTRON_LAUNCH_MODE', 'FOLIOLE_WINDOWS_WORKDIR', 'WINDOWS_WORKDIR', 'FOLIOLE_HIDDEN_CREDENTIAL_MAIN_PATH']) {
    delete isolated[key];
  }
  const stateRoot = path.join(record.worktreePath, '.tmp/qa-state');
  return {
    ...isolated,
    FOLIOLE_ELECTRON_APP_ROOT: record.worktreePath,
    FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot,
    FOLIOLE_PREVIEW_SANDBOX_ROOT: stateRoot,
    FOLIOLE_USER_DATA_PATH: path.join(stateRoot, 'user-data'),
    FOLIOLE_SESSION_DATA_PATH: path.join(stateRoot, 'session-data'),
    FOLIOLE_MAIN_DATABASE_PATH: path.join(stateRoot, 'foliole.db'),
    FOLIOLE_WORKDIR: stateRoot,
    FOLIOLE_RESOURCE_GATE_HELD: '',
    FOLIOLE_RESOURCE_GATE_REPO_ROOT: record.worktreePath,
    FOLIOLE_RESOURCE_GATE_RUNTIME_DIR: path.join(record.devRoot, '.lab/internal/runtime'),
    GRADLE_USER_HOME: path.join(record.worktreePath, '.cache/gradle'),
    ANDROID_USER_HOME: path.join(record.worktreePath, '.cache/android'),
    TMPDIR: path.join(record.worktreePath, '.tmp/system'),
    TMP: path.join(record.worktreePath, '.tmp/system'),
    TEMP: path.join(record.worktreePath, '.tmp/system')
  };
}
