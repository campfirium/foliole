import { Buffer } from 'node:buffer';

import { identifyDependabotDependencyDiff } from './dependabot-dependency-diff-identity.mjs';
import { classifyElectronUpdateEligibility } from './electron-update-eligibility.mjs';
import { readLatestElectronEligibilityInput, runNpmJson } from './electron-update-metadata.mjs';

const DEPENDENCY_FILES = new Set(['package.json', 'package-lock.json']);

function repositoryApiPath(repository, suffix) {
  return `repos/${repository}/${suffix}`;
}

function decodeContent(response, filePath, revision) {
  if (response?.encoding !== 'base64' || typeof response.content !== 'string') {
    throw new Error(`${filePath}@${revision} did not return complete base64 content`);
  }
  return Buffer.from(response.content.replaceAll('\n', ''), 'base64').toString('utf8');
}

function readFileAtRevision(config, filePath, revision, runGh) {
  const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
  const endpoint = `${repositoryApiPath(config.repository, `contents/${encodedPath}`)}?ref=${encodeURIComponent(revision)}`;
  return decodeContent(runGh(['api', endpoint]), filePath, revision);
}

function completeChangedFiles(config, prDetails, runGh) {
  const endpoint = `${repositoryApiPath(config.repository, `pulls/${prDetails.number}/files`)}?per_page=100`;
  const pages = runGh(['api', '--paginate', '--slurp', endpoint]);
  if (!Array.isArray(pages) || pages.some((page) => !Array.isArray(page))) {
    throw new Error('GitHub returned an incomplete changed-files response');
  }
  return pages.flat();
}

function readDependencyDiff(config, pr, runGh) {
  const details = runGh(['api', repositoryApiPath(config.repository, `pulls/${pr.number}`)]);
  if (details?.number !== pr.number || details?.head?.sha !== pr.headRefOid || details?.base?.ref !== pr.baseRefName) {
    throw new Error('PR identity changed while reading its dependency diff');
  }
  const changedFiles = completeChangedFiles(config, details, runGh);
  const files = changedFiles.map((file) => {
    if (!DEPENDENCY_FILES.has(file.filename)) return { path: file.filename };
    return {
      after: readFileAtRevision(config, file.filename, details.head.sha, runGh),
      before: readFileAtRevision(config, file.filename, details.base.sha, runGh),
      path: file.filename
    };
  });
  return identifyDependabotDependencyDiff({
    files,
    pr: {
      authorLogin: pr.author?.login,
      baseRefName: details.base.ref,
      headSha: details.head.sha,
      number: details.number
    },
    retrieval: { complete: true }
  });
}

export function resolveDependabotPrEligibility(options) {
  const { config, pr, runGh } = options;
  if (pr.author?.login !== 'app/dependabot') return { kind: 'not-dependabot' };
  const identity = readDependencyDiff(config, pr, runGh);
  if (identity.status !== 'identified') {
    return { kind: 'source-error', reason: identity.reason };
  }
  if (identity.dependencyKind === 'other') return { identity, kind: 'other-dependency' };

  const now = options.now ?? new Date().toISOString();
  const input = readLatestElectronEligibilityInput({
    now,
    runGh,
    runNpm: options.runNpm ?? runNpmJson
  });
  const eligibility = classifyElectronUpdateEligibility(input);
  if (eligibility.classification === 'eligible') {
    return { eligibility, identity, kind: 'electron-eligible' };
  }
  if (eligibility.classification === 'deferred') {
    return { eligibility, identity, kind: 'electron-deferred' };
  }
  return { eligibility, identity, kind: 'source-error', reason: eligibility.reason };
}

export function dependabotPrCanEmit(options) {
  const { config, errors, pr, recordError, runGh } = options;
  if (pr.author?.login !== 'app/dependabot') return true;
  try {
    const result = resolveDependabotPrEligibility({ config, pr, runGh });
    if (['electron-eligible', 'other-dependency'].includes(result.kind)) return true;
    if (result.kind === 'source-error') {
      recordError(errors, 'github-pr-eligibility', `#${pr.number}`, new Error(result.reason));
    }
    return false;
  } catch (error) {
    recordError(errors, 'github-pr-eligibility', `#${pr.number}`, error);
    return false;
  }
}
