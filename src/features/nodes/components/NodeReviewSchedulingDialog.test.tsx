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
  appSurfaceControlClassName: () => '',
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
      defaultDesiredRetention={0.9}
      defaultPriority={5}
      node={node}
      nodesById={{ [node.id]: node }}
      onClose={onClose}
      onDesiredRetentionChange={() => undefined}
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

it('saves an explicit retention and can restore inheritance without changing priority', () => {
  const node = createNode({ parentNodeId: 'parent', desiredRetention: 0.99 });
  const parent = createNode({ id: 'parent', desiredRetention: 0.8 });
  const onDesiredRetentionChange = vi.fn();
  const onPriorityChange = vi.fn();
  const view = () => <NodeReviewSchedulingDialog defaultDesiredRetention={0.9} defaultPriority={5}
    node={node} nodesById={{ [node.id]: node, parent }} onClose={() => undefined}
    onDesiredRetentionChange={onDesiredRetentionChange} onPriorityChange={onPriorityChange}
    onShortTermChange={() => undefined} />;
  const rendered = renderWithLocalization(view());
  const control = screen.getByRole('combobox', { name: 'Review desired retention' });
  expect(control).toHaveValue('0.99');
  expect(screen.getByRole('option', { name: 'Inherit resolved value (80%)' })).toBeInTheDocument();
  fireEvent.change(control, { target: { value: '0.85' } });
  expect(onDesiredRetentionChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Close'));
  expect(onDesiredRetentionChange).toHaveBeenLastCalledWith('node-1', 0.85);
  node.desiredRetention = 0.85;
  rendered.rerender(view());
  fireEvent.change(control, { target: { value: 'inherit' } });
  fireEvent.click(screen.getByText('Close'));
  expect(onDesiredRetentionChange).toHaveBeenLastCalledWith('node-1', null);
  expect(onPriorityChange).not.toHaveBeenCalled();
});
