import { expect, it } from 'vitest';

import {
  applyWorkspaceSurfaceAutoPalette,
  buildWorkspaceSurfaceAutoAssignments,
  buildWorkspaceSurfaceAutoColumnPalette,
  type WorkspaceSurfaceAutoPaletteOptions
} from './workspaceSurfaceAutoPalette';
import { parseWorkspaceSurfaceColor } from './workspaceSurfaceColor';

const DEFAULT_OPTIONS: WorkspaceSurfaceAutoPaletteOptions = {
  documentPureWhite: false,
  folderTopicSharedTone: false
};

it('builds a five-slot auto column palette from a seed color', () => {
  const seed = parseWorkspaceSurfaceColor('#8a962f');

  expect(seed).not.toBeNull();
  expect(buildWorkspaceSurfaceAutoColumnPalette(seed!, DEFAULT_OPTIONS)).toEqual([
    '#dee0cc',
    '#ebece4',
    '#f1f2ee',
    '#fafafa',
    '#f3f3f1'
  ]);
});

it('recomputes the whole palette for white document and shared navigation preferences', () => {
  const seed = parseWorkspaceSurfaceColor('#8a962f');

  expect(seed).not.toBeNull();
  expect(buildWorkspaceSurfaceAutoColumnPalette(seed!, {
    documentPureWhite: true,
    folderTopicSharedTone: true
  })).toEqual([
    '#dcdece',
    '#f1f1ee',
    '#f1f1ee',
    '#ffffff',
    '#f8f8f7'
  ]);
});

it('builds a low-light dark auto palette from the same seed color', () => {
  const seed = parseWorkspaceSurfaceColor('#30362f');

  expect(seed).not.toBeNull();
  expect(buildWorkspaceSurfaceAutoColumnPalette(seed!, DEFAULT_OPTIONS, undefined, 'dark')).toEqual([
    '#212121',
    '#242424',
    '#262626',
    '#1f1f1f',
    '#292929'
  ]);
});

it('writes the generated auto palette into the leading free-mode slots', () => {
  const merged = applyWorkspaceSurfaceAutoPalette(
    ['#ffffff', '#fcfcfc', '#f6f6f6', '#f5f5f3', '#ececea', '#d8d8d8'],
    ['#111111', '#222222', '#333333', '#444444', '#555555']
  );

  expect(merged).toEqual(['#111111', '#222222', '#333333', '#444444', '#555555', '#d8d8d8']);
  expect(buildWorkspaceSurfaceAutoAssignments()['main-document']).toBe(3);
});
