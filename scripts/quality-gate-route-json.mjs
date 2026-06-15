#!/usr/bin/env node
/* global process */

const SECTION_PREFIX = /^\[quality-gate-route\]\s{3}/u;

export function parseQualityGateRoutePlan(output) {
  const plan = {
    changedFiles: [],
    level: '',
    lintTargets: [],
    reason: '',
    relatedTests: [],
    target: ''
  };
  let section = '';
  for (const line of output.split(/\r?\n/u)) {
    if (line.startsWith('[quality-gate-route] selected level:')) {
      plan.level = line.split(':').slice(1).join(':').trim();
      section = '';
    } else if (line.startsWith('[quality-gate-route] reason:')) {
      plan.reason = line.split(':').slice(1).join(':').trim();
      section = '';
    } else if (line.startsWith('[quality-gate-route] target:')) {
      plan.target = line.split(':').slice(1).join(':').trim();
      section = '';
    } else if (line === '[quality-gate-route] changed files:') {
      section = 'changedFiles';
    } else if (line === '[quality-gate-route] lint targets:') {
      section = 'lintTargets';
    } else if (line === '[quality-gate-route] related tests:') {
      section = 'relatedTests';
    } else if (SECTION_PREFIX.test(line) && section) {
      plan[section].push(line.replace(SECTION_PREFIX, '').trim());
    } else {
      section = '';
    }
  }
  for (const key of ['changedFiles', 'lintTargets', 'relatedTests']) {
    plan[key] = plan[key].filter((item) => item && item !== 'none');
  }
  return plan;
}

if (process.argv[1] && process.argv[1].endsWith('quality-gate-route-json.mjs')) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    input += chunk;
  });
  process.stdin.on('end', () => {
    process.stdout.write(`${JSON.stringify(parseQualityGateRoutePlan(input))}\n`);
  });
}
