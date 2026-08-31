// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it } from 'vitest';

import {
  ensureFolioleAideAgentsFile,
  FOLIOLE_AIDE_AGENTS_CONTENT,
  readFolioleAideDeveloperInstructions,
  resolveFolioleAideRuntimePaths
} from './folioleAideRuntime.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-aide-runtime-'));
});

afterEach(async () => {
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('separates the portable Widget definition from device data', () => {
  const paths = resolveFolioleAideRuntimePaths(
    path.join(tempRoot, 'user-data'),
    path.join(tempRoot, 'library')
  );

  expect(paths).toEqual({
    agentsPath: path.join(tempRoot, 'library', 'Widgets', 'Foliole Aide', 'AGENTS.md'),
    attachmentsRoot: path.join(tempRoot, 'user-data', 'Aide', 'Workspace', 'Attachments'),
    codexHome: path.join(tempRoot, 'user-data', 'Aide', 'Codex'),
    deviceDataRoot: path.join(tempRoot, 'user-data', 'Aide'),
    historyDatabasePath: path.join(tempRoot, 'user-data', 'Aide', 'history.db'),
    skillsRoot: path.join(tempRoot, 'library', 'Widgets', 'Foliole Aide', 'Skills'),
    workspaceRoot: path.join(tempRoot, 'user-data', 'Aide', 'Workspace'),
    widgetRoot: path.join(tempRoot, 'library', 'Widgets', 'Foliole Aide')
  });
});

it('atomically manages only AGENTS.md and preserves unknown Widget files', async () => {
  const paths = resolveFolioleAideRuntimePaths(
    path.join(tempRoot, 'user-data'),
    path.join(tempRoot, 'library')
  );
  await fs.mkdir(paths.widgetRoot, { recursive: true });
  await fs.writeFile(path.join(paths.widgetRoot, 'personal.txt'), 'keep me');
  await fs.writeFile(paths.agentsPath, 'stale instructions');

  ensureFolioleAideAgentsFile(paths);

  await expect(fs.readFile(paths.agentsPath, 'utf8')).resolves.toBe(FOLIOLE_AIDE_AGENTS_CONTENT);
  expect(FOLIOLE_AIDE_AGENTS_CONTENT).toContain('never save ordinary chat answers');
  await expect(fs.readFile(path.join(paths.widgetRoot, 'personal.txt'), 'utf8')).resolves.toBe('keep me');
  expect((await fs.readdir(paths.widgetRoot)).sort()).toEqual(['AGENTS.md', 'Skills', 'personal.txt']);
  expect(readFolioleAideDeveloperInstructions(paths)).toContain(`Aide definition: ${paths.agentsPath}`);
  expect(readFolioleAideDeveloperInstructions(paths)).toContain(`Aide skills: ${paths.skillsRoot}`);
});
