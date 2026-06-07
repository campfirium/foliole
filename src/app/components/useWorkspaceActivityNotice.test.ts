import { expect, it, vi } from 'vitest';

import { applyWorkspaceImportNoticeResolution } from './useWorkspaceActivityNotice';

it('opens the imported node directly when an import notice has a node id', () => {
  const onOpenImportedTopic = vi.fn();
  const setNotice = vi.fn();

  applyWorkspaceImportNoticeResolution(
    {
      id: 1,
      message: 'Imported',
      nodeId: 'node-imported',
      tone: 'success'
    },
    onOpenImportedTopic,
    setNotice
  );

  expect(onOpenImportedTopic).toHaveBeenCalledWith('node-imported');
  expect(setNotice).toHaveBeenCalledWith(null);
});

it('keeps the import notice when there is no known imported node', () => {
  const onOpenImportedTopic = vi.fn();
  const setNotice = vi.fn();
  const notice = {
    id: 2,
    message: 'Imported to Inbox',
    nodeId: null,
    tone: 'success' as const
  };

  applyWorkspaceImportNoticeResolution(notice, onOpenImportedTopic, setNotice);

  expect(onOpenImportedTopic).not.toHaveBeenCalled();
  expect(setNotice).toHaveBeenCalledWith(notice);
});
