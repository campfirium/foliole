import { execFileSync } from 'node:child_process';

import type { Plugin } from 'vite';

const COMMIT_SHA = /^[a-f0-9]{40}$/u;
const RELEASE_TAG = /^v\d+\.\d+\.\d+$/u;

function readGit(root: string, args: string[]) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return undefined;
  }
}

export function buildSourceDefines(root: string, development: boolean, env = process.env) {
  const suppliedRevision = env.VITE_FOLIOLE_SOURCE_REVISION;
  const revision = suppliedRevision && COMMIT_SHA.test(suppliedRevision)
    ? suppliedRevision
    : readGit(root, ['rev-parse', 'HEAD']);
  const suffix = revision && COMMIT_SHA.test(revision)
    ? buildRevisionSuffix(root, revision, development, env.GITHUB_REF)
    : '';
  return {
    'import.meta.env.VITE_FOLIOLE_SOURCE_REVISION': JSON.stringify(revision || 'unidentified'),
    'import.meta.env.VITE_FOLIOLE_BUILD_REVISION_SUFFIX': JSON.stringify(suffix)
  };
}

export function buildSourcePlugin(root: string): Plugin {
  return {
    name: 'foliole-build-source',
    config(_config, { command, mode }) {
      if (mode === 'test') return;
      return { define: buildSourceDefines(root, command === 'serve' || mode === 'internal') };
    }
  };
}

function buildRevisionSuffix(root: string, revision: string, development: boolean, hostedRef: string | undefined) {
  const localBranch = hostedRef ? undefined : readGit(root, ['branch', '--show-current']);
  if (!development && (hostedRef === 'refs/heads/release' || localBranch === 'release')) return '';
  const status = readGit(root, ['--no-optional-locks', 'status', '--porcelain']);
  const tags = hostedRef?.startsWith('refs/tags/') ? hostedRef.slice('refs/tags/'.length)
    : !hostedRef && localBranch === '' ? readGit(root, ['tag', '--points-at', 'HEAD']) ?? '' : '';
  if (!development && status === '' && tags.split('\n').some(tag => RELEASE_TAG.test(tag))) return '';
  return `.${revision.slice(0, 8).toUpperCase()}${status ? '*' : ''}`;
}
