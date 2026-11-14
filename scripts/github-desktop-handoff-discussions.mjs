/* global process */

import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { recordMonitorError, runGh } from './github-monitor-gh.mjs';

const source = 'foliole/github-discussion';
const query = `query($owner: String!, $repo: String!, $cursor: String) {
  repository(owner: $owner, name: $repo) {
    discussions(first: 50, after: $cursor, orderBy: {field: CREATED_AT, direction: DESC}) {
      nodes { number title url }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

export function readDiscussions(repository, afterNumber) {
  const [owner, repo] = repository.split('/');
  const discussions = [];
  let cursor;
  do {
    const page = runGh(['api', 'graphql', '-f', `query=${query}`, '-f', `owner=${owner}`,
      '-f', `repo=${repo}`, ...(cursor ? ['-f', `cursor=${cursor}`] : [])])
      ?.data?.repository?.discussions;
    if (!page?.nodes || !page.pageInfo) throw new Error('GitHub did not return a discussions page');
    discussions.push(...page.nodes);
    cursor = afterNumber !== undefined && page.pageInfo.hasNextPage &&
      !page.nodes.some(({ number }) => number <= afterNumber) ? page.pageInfo.endCursor : null;
  } while (cursor);
  return discussions;
}

export function listDiscussionEvents(config, state, includeExisting, errors, renderTemplate,
  read = readDiscussions) {
  if (!config?.enabled) return [];
  try {
    const checkpoint = state.latestDiscussionNumber;
    const discussions = read(config.repository, checkpoint);
    if (checkpoint === undefined && !includeExisting) {
      state.latestDiscussionNumber = Math.max(0, ...discussions.map(({ number }) => number));
      return [];
    }
    return discussions
      .filter(({ number }) => includeExisting || number > checkpoint)
      .sort((a, b) => a.number - b.number)
      .map((discussion) => ({
        source,
        number: discussion.number,
        title: `D${discussion.number} ${discussion.title.replace(/\p{Cc}/gu, ' ')}`,
        prompt: renderTemplate(config.template, discussion),
        dedupeKey: `${source}:${config.repository}:${discussion.number}`,
        ttlSeconds: config.defaultTtlSeconds
      }));
  } catch (error) {
    recordMonitorError(errors, source, 'list', error);
    return [];
  }
}

export function hasDiscussionChat(event, workspace) {
  const codexDir = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const result = spawnSync('python3', [
    path.join(codexDir, 'skills', 'codex-task-lookup', 'scripts', 'find_task.py'),
    `D${event.number}`, '--cwd', workspace
  ], { encoding: 'utf8', timeout: 5000 });
  if (result.error) throw result.error;
  const status = JSON.parse(result.stdout || '{}').status;
  if (status === 'unique' || status === 'ambiguous') return true;
  if (status === 'not_found') return false;
  throw new Error(`Discussion chat lookup failed for D${event.number}`);
}
