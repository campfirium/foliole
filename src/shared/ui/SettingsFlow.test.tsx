import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SettingsFlow, SettingsFlowItem } from './SettingsFlow';

describe('SettingsFlow', () => {
  it('connects each marker to the next and keeps dividers clear of the rail', () => {
    render(
      <SettingsFlow>
        <SettingsFlowItem control={<input aria-label="First value" />}><span>First step</span></SettingsFlowItem>
        <SettingsFlowItem control={<input aria-label="Second value" />}><span>Second step</span></SettingsFlowItem>
      </SettingsFlow>
    );

    const flow = screen.getByText('First step').closest('[data-settings-flow]');
    const items = flow?.querySelectorAll('[data-settings-flow-item]');
    expect(flow).not.toHaveClass('before:top-7');
    expect(items).toHaveLength(2);
    expect(items?.[0]).toHaveClass('before:top-7', 'before:-bottom-7', 'before:left-7', 'after:left-12');
    expect(items?.[1]).toHaveClass('last:before:hidden', 'last:after:hidden');
    expect(flow?.querySelectorAll('[data-settings-flow-marker]')).toHaveLength(2);
    expect(flow).not.toHaveTextContent(/\b[12]\b/u);
    expect(screen.getByText('First step').parentElement).toHaveClass('basis-settings-flow-copy-min', 'grow-[2]');
    expect(screen.getByLabelText('First value').closest('[data-settings-control-slot]')).toHaveClass(
      'basis-settings-flow-control-min',
      'grow',
      'min-w-0'
    );
  });
});
