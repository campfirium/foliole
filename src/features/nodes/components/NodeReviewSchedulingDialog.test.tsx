import { fireEvent, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../../shared/localization/testLocalization';
import type { WorkspaceListNode } from '../model/workspaceListNode';

import { NodeReviewSchedulingDialog } from './NodeReviewSchedulingDialog';

vi.mock('@/shared/ui', () => ({
  AppDialog: ({
    children,
    onOpenChange
  }: {
    children: ReactNode;
    onOpenChange: (open: boolean) => void;
  }) => (
    <div>
      {children}
      <button onClick={() => onOpenChange(false)} type="button">
        Close
      </button>
    </div>
  ),
  AppDialogContent: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  AppDialogOverlay: () => null,
  AppDialogPortal: ({ children }: { children: ReactNode }) => <>{children}</>,
  AppDialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  SettingsControlSlot: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SettingsRow: ({
    children,
    description,
    title
  }: {
    children: ReactNode;
    description?: ReactNode;
    title: string;
  }) => (
    <section>
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {children}
    </section>
  ),
  SettingsSection: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SETTINGS_RANGE_WIDTH_CLASS_NAME: 'range',
  SETTINGS_VALUE_WIDTH_CLASS_NAME: 'value',
  settingsControlValueClassName: () => '',
  settingsRangeClassName: () => '',
  settingsSwitchClassName: () => '',
  settingsSwitchKnobClassName: () => ''
}));

function createNode(overrides: Partial<WorkspaceListNode> = {}): WorkspaceListNode {
  return {
    id: 'node-1',
    parentNodeId: null,
    kind: 'folder',
    title: 'Folder',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    hasContent: false,
    hasReveal: false,
    review: null,
    priority: null,
    enableShortTerm: null,
    ...overrides
  };
}

it('commits priority changes when the dialog closes', () => {
  const node = createNode();
  const onClose = vi.fn();
  const onPriorityChange = vi.fn();
  const onShortTermChange = vi.fn();

  renderWithLocalization(
    <NodeReviewSchedulingDialog
      defaultPriority={5}
      node={node}
      nodesById={{ [node.id]: node }}
      onClose={onClose}
      onPriorityChange={onPriorityChange}
      onShortTermChange={onShortTermChange}
    />
  );

  fireEvent.change(screen.getByLabelText('Review queue priority'), { target: { value: '7' } });

  expect(onPriorityChange).not.toHaveBeenCalled();
  expect(onShortTermChange).not.toHaveBeenCalled();

  fireEvent.click(screen.getByText('Close'));

  expect(onPriorityChange).toHaveBeenCalledWith('node-1', 7);
  expect(onShortTermChange).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledOnce();
});
