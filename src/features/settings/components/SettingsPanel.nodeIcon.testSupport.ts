import { fireEvent, within } from '@testing-library/react';
import { expect } from 'vitest';

export function getMarkerRow(title: string) {
  const row = document.querySelector(`[data-node-icon-settings-row="${title}"]`);
  expect(row).not.toBeNull();
  return row as HTMLElement;
}

export function changeRange(rowTitle: string, label: string, value: string) {
  fireEvent.change(within(getMarkerRow(rowTitle)).getByLabelText(label), { target: { value } });
}

export function readJsonSetting(key: string) {
  const value = window.localStorage.getItem(key);
  expect(value).toBeTruthy();
  return JSON.parse(value ?? '{}') as Record<string, unknown>;
}
