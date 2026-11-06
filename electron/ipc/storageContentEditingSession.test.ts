// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { hasContentEditingSession } from '../../lib/core/sync/contentEditingSession.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { textBranch, textDevice } from '../database/topicTextState.testSupport.js';

import { handleContentEditingSession } from './storageContentEditingSession.js';

const state = vi.hoisted(() => ({ sqlite: null as ReturnType<typeof textDevice>['sqlite'] | null }));
vi.mock('../database/connection.js', () => ({ openDatabaseConnection: () => ({ sqlite: state.sqlite }) }));
vi.mock('../database/attachmentResourceDescription.js', () => ({ currentLibraryScope: () => 'library' }));
vi.mock('./workspaceContentChangedEvents.js', () => ({ notifyWorkspaceContentChanged: vi.fn() }));
let host: ReturnType<typeof textDevice>;
beforeEach(async () => {
  host = textDevice();
  state.sqlite = host.sqlite;
  await host.receive([textBranch('base', 'Base')]);
});
afterEach(() => host.sqlite.close());

it('validates the scoped native boundary and rejects obsolete exits', async () => {
  const args = { action: 'begin', libraryScope: 'library', nodeId: 'topic', sessionId: 'old' };
  await expect(handleContentEditingSession({ ...args, action: 'pause' })).rejects.toThrow('invalid_content_editing_action');
  await expect(handleContentEditingSession({ ...args, sessionId: '' })).rejects.toThrow();
  await expect(handleContentEditingSession({ ...args, libraryScope: 'other' })).resolves.toEqual({ changed: false });
  expect(hasContentEditingSession(host.db, 'topic')).toBe(false);
  await expect(handleContentEditingSession(args)).resolves.toEqual({ changed: true });
  expect(hasContentEditingSession(createBetterSqliteDbPort(host.sqlite), 'topic')).toBe(true);
  await handleContentEditingSession({ ...args, sessionId: 'new' });
  await expect(handleContentEditingSession({ ...args, action: 'end' })).resolves.toEqual({ changed: false });
  expect(hasContentEditingSession(host.db, 'topic')).toBe(true);
  await expect(handleContentEditingSession({ ...args, action: 'end', sessionId: 'new' })).resolves.toEqual({ changed: true });
  expect(hasContentEditingSession(host.db, 'topic')).toBe(false);
});
