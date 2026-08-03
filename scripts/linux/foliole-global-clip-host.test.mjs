// @vitest-environment node

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

const HOST_PATH = path.resolve('build/linux/foliole-global-clip');
const IMPORT_HOST = `
import importlib.machinery, importlib.util, json, pathlib, sqlite3, sys
loader = importlib.machinery.SourceFileLoader('host', sys.argv[1])
spec = importlib.util.spec_from_loader(loader.name, loader)
host = importlib.util.module_from_spec(spec)
loader.exec_module(host)
home = pathlib.Path(sys.argv[2])
config = home / '.config' / 'foliole' / 'config'
config.mkdir(parents=True, exist_ok=True)
mode = sys.argv[3]
if mode == 'resolve':
    print(host.resolve_inbox_path({'XDG_CONFIG_HOME': str(home / '.config')}, home))
elif mode == 'drop':
    destination = host.drop_selection('selected markdown', pathlib.Path(sys.argv[4]))
    print(json.dumps({'name': destination.name, 'text': destination.read_text()}))
elif mode == 'command':
    print(json.dumps(host.capture_panel_command()))
`;

function runHostProbe(home, mode, ...args) {
  return execFileSync('python3', ['-c', IMPORT_HOST, HOST_PATH, home, mode, ...args], {
    encoding: 'utf8'
  }).trim();
}

function createSettingsDatabase(libraryHome, inbox) {
  const dataDirectory = path.join(libraryHome, 'Data');
  mkdirSync(dataDirectory, { recursive: true });
  const script = `
import json, sqlite3, sys
connection = sqlite3.connect(sys.argv[1])
connection.execute('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)')
connection.execute('INSERT INTO settings VALUES (?, ?)', ('library_path_settings', json.dumps({'inbox': sys.argv[2]})))
connection.commit()
`;
  execFileSync('python3', ['-c', script, path.join(dataDirectory, 'foliole.db'), inbox]);
}

it('resolves the configured Managed Inbox from the current library without writing the database', () => {
  const home = mkdtempSync(path.join(os.tmpdir(), 'foliole-global-clip-home-'));
  const libraryHome = path.join(home, 'Library');
  const inbox = path.join(home, 'Configured Inbox');
  const configDirectory = path.join(home, '.config', 'foliole', 'config');
  mkdirSync(configDirectory, { recursive: true });
  writeFileSync(path.join(configDirectory, 'current-library.json'), JSON.stringify({ library_home: libraryHome }));
  createSettingsDatabase(libraryHome, inbox);

  expect(runHostProbe(home, 'resolve')).toBe(inbox);
});

it('atomically drops one Markdown file and leaves no temporary source', () => {
  const home = mkdtempSync(path.join(os.tmpdir(), 'foliole-global-clip-drop-'));
  const inbox = path.join(home, 'Inbox');
  const result = JSON.parse(runHostProbe(home, 'drop', inbox));

  expect(result.name).toMatch(/^Global clip [a-f0-9]{32}\.md$/u);
  expect(result.text).toBe('selected markdown\n');
  expect(readFileSync(path.join(inbox, result.name), 'utf8')).toBe(result.text);
});

it('uses only the fixed capture-panel fallback and never reads the regular clipboard', () => {
  const home = mkdtempSync(path.join(os.tmpdir(), 'foliole-global-clip-command-'));
  const source = readFileSync(HOST_PATH, 'utf8');

  expect(JSON.parse(runHostProbe(home, 'command')))
    .toEqual(['/opt/Foliole/foliole', '--global-capture-panel']);
  expect(source).toContain('get_primary_clipboard()');
  expect(source).not.toContain('get_clipboard()');
});
