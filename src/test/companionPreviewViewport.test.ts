// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';

import { fitCompanionPreviewViewport } from '../../scripts/vite/companionPreviewViewport';

let stopFitting: (() => void) | undefined;
afterEach(() => { stopFitting?.(); vi.unstubAllGlobals(); document.body.replaceChildren(); });

function resize(width: number, height: number) {
  vi.stubGlobal('innerWidth', width);
  vi.stubGlobal('innerHeight', height);
  window.dispatchEvent(new Event('resize'));
}

it('keeps 375 by 812 content plus the status bar fully visible in narrow and short viewports without enlarging them', () => {
  resize(1200, 1000);
  const viewport = document.createElement('div');
  document.body.append(viewport);
  stopFitting = fitCompanionPreviewViewport(viewport);
  const scale = () => Number(viewport.style.getPropertyValue('--preview-scale'));
  expect(scale()).toBe(1);
  resize(300, 900);
  expect(scale()).toBeCloseTo(300 / 375);
  resize(1200, 600);
  expect(scale()).toBeCloseTo(600 / 856);
  resize(200, 400);
  expect(scale()).toBeCloseTo(400 / 856);
  expect(viewport.style.width).toBe('375px');
  expect(viewport.style.getPropertyValue('--preview-content-height')).toBe('812px');
  expect(viewport.style.height).toBe('856px');
  resize(375, 856);
  expect(scale()).toBe(1);
});

it('resizes the existing document without navigation or loss of its current scroll and stops on disposal', () => {
  const viewport = document.createElement('div');
  const frame = document.createElement('iframe');
  document.body.append(viewport);
  viewport.append(frame);
  const current = frame.contentDocument!;
  current.body.textContent = 'Reading the same topic';
  current.body.scrollTop = 243;
  stopFitting = fitCompanionPreviewViewport(viewport);
  resize(280, 700);
  expect(frame.contentDocument).toBe(current);
  expect(current.body.textContent).toBe('Reading the same topic');
  expect(current.body.scrollTop).toBe(243);
  const previousScale = viewport.style.getPropertyValue('--preview-scale');
  stopFitting();
  resize(900, 1200);
  expect(viewport.style.getPropertyValue('--preview-scale')).toBe(previousScale);
});
