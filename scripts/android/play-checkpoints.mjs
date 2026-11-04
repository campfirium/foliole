import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export function restorePlayCheckpoints({ repository, runId, directory, run = execFileSync }) {
  const api = route => JSON.parse(run('gh', ['api', route], { encoding: 'utf8' }));
  const artifacts = [];
  for (let page = 1; ; page += 1) {
    const result = api(`repos/${repository}/actions/runs/${runId}/artifacts?per_page=100&page=${page}`);
    artifacts.push(...result.artifacts);
    if (artifacts.length >= result.total_count) break;
    if (!result.artifacts.length) throw new Error('Play checkpoint inventory is incomplete');
  }
  const stages = ['prepared', 'signed', 'uploaded', 'committed', 'observed'];
  const pattern = new RegExp(`^android-play-${runId}-([1-9]\\d*)-(${stages.join('|')})$`, 'u');
  const matches = artifacts.map(item => ({ item, match: item.name.match(pattern) })).filter(row => row.match);
  if (!matches.length) return false;
  if (matches.some(row => row.item.expired)) throw new Error('Play checkpoint expired; reconcile manually before starting another run');
  matches.sort((a, b) => Number(b.match[1]) - Number(a.match[1]) || stages.indexOf(b.match[2]) - stages.indexOf(a.match[2]));
  const latest = matches[0];
  const signed = matches.find(row => row.match[2] === 'signed');
  fs.mkdirSync(directory, { recursive: true });
  // Signed archive and receipt stay together; newer state is restored last.
  for (const row of [signed, latest].filter(Boolean)) {
    const zip = path.join(directory, 'checkpoint.zip');
    const bytes = run('gh', ['api', `repos/${repository}/actions/artifacts/${row.item.id}/zip`], { maxBuffer: 512 * 1024 * 1024 });
    fs.writeFileSync(zip, bytes);
    run('unzip', ['-o', zip, '-d', directory], { stdio: 'pipe' });
    fs.rmSync(zip);
  }
  fs.writeFileSync(path.join(directory, 'restored'), signed ? 'upload-may-have-started' : 'no-upload');
  return true;
}
