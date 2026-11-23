// @vitest-environment node

import { expect, it } from 'vitest';

import { normalizeAideToolPermissionSettings } from '../../lib/core/assistant/aideToolPermissionSettings.js';

import { formatAidePermissionContext } from './aidePermissionPrompt.js';
import { composeAssistantTurnInput } from './codexAppServerProtocol.js';

it('tells the model which places it may read and which changes it may make, in the settings names', () => {
  const lines = formatAidePermissionContext(normalizeAideToolPermissionSettings({
    askBeforeWrite: true, read: { external: false, trash: false }, readBudget: 8000, write: { manageDives: false }
  })).join('\n');
  expect(lines).toContain('Readable places: Current material');
  expect(lines).toContain('Folders (the top-level Folder each current material sits in)');
  expect(lines).toContain('Virtual (the indexes that hold a current material');
  expect(lines).toContain('Switched off: External, Trash.');
  expect(lines).toContain('Changes switched off: manage Dives.');
  expect(lines).toContain('each after the person confirms it');
  expect(lines).toContain('about 8000 tokens per reply');
  expect(formatAidePermissionContext(undefined)).toEqual([]);
});

it('puts the permissions into the turn only while Foliole tools are running', () => {
  const permissions = normalizeAideToolPermissionSettings({});
  const running = composeAssistantTurnInput('Hi', {
    agentControl: { capabilities: ['materials.read'], state: 'running' }, scope: 'workspace'
  } as never, undefined, permissions);
  const stopped = composeAssistantTurnInput('Hi', {
    agentControl: { capabilities: [], state: 'unavailable' }, scope: 'workspace'
  } as never, undefined, permissions);
  expect(running).toContain('Readable places:');
  expect(stopped).not.toContain('Readable places:');
});
