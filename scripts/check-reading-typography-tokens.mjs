/* global console, process */

import { readFileSync } from 'node:fs';

const SOURCES = ['src/app/generated/appearance-colors.css', 'src/app/styles.css'];

const TOKEN_RULES = {
  light: {
    backgroundL: [0.94, 0.99],
    textL: [0.16, 0.26],
    deltaL: [0.68, 0.8],
    textChromaMax: 0.04
  },
  dark: {
    backgroundL: [0.14, 0.22],
    textL: [0.82, 0.9],
    deltaL: [0.62, 0.72],
    textChromaMax: 0.04
  }
};

const FORBIDDEN_DARK_CONTENT_TEXT = '#e8e6df';

function readSources() {
  return SOURCES.map((path) => readFileSync(path, 'utf8')).join('\n');
}

function collectDeclarations(css, selectorToMatch) {
  const declarations = {};
  const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const blockPattern = /([^{}]+)\{([^{}]+)\}/g;
  let match;
  while ((match = blockPattern.exec(cssWithoutComments))) {
    const selector = match[1].trim();
    if (selector !== selectorToMatch) {
      continue;
    }
    for (const declaration of match[2].split(';')) {
      const declarationMatch = declaration.match(/^\s*(--[-\w]+)\s*:\s*(.+?)\s*$/);
      if (declarationMatch) {
        declarations[declarationMatch[1]] = declarationMatch[2];
      }
    }
  }
  return declarations;
}

function collectModeVariables(css, mode) {
  const root = collectDeclarations(css, ':root');
  if (mode === 'light') {
    return root;
  }
  return {
    ...root,
    ...collectDeclarations(css, ":root[data-resolved-base-color='dark']")
  };
}

function parseRgbTriplet(value) {
  const match = value.trim().match(/^(\d+)\s+(\d+)\s+(\d+)$/);
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function parseHex(value) {
  const normalized = value.trim().toLowerCase();
  const match = normalized.match(/^#([0-9a-f]{6})$/);
  if (!match) {
    return null;
  }
  const hex = match[1];
  return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
}

function resolveValue(value, variables, seen = new Set()) {
  const trimmed = value.trim();
  const directRgb = parseRgbTriplet(trimmed);
  if (directRgb) {
    return directRgb;
  }
  const hex = parseHex(trimmed);
  if (hex) {
    return hex;
  }
  const rgbVarMatch = trimmed.match(/^rgb\(var\((--[-\w]+)\)(?:\s*\/\s*[\d.]+)?\)$/);
  if (rgbVarMatch) {
    return resolveToken(rgbVarMatch[1], variables, seen);
  }
  const varMatch = trimmed.match(/^var\((--[-\w]+)\)$/);
  if (varMatch) {
    return resolveToken(varMatch[1], variables, seen);
  }
  return null;
}

function resolveToken(token, variables, seen = new Set()) {
  if (seen.has(token)) {
    return null;
  }
  const value = variables[token];
  if (!value) {
    return null;
  }
  seen.add(token);
  return resolveValue(value, variables, seen);
}

function srgbChannelToLinear(value) {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function rgbToOklch(rgb) {
  const [r, g, b] = rgb.map(srgbChannelToLinear);
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);
  const lightness = 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot;
  const a = 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot;
  const cB = 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot;
  const chroma = Math.sqrt(a ** 2 + cB ** 2);
  const hue = ((Math.atan2(cB, a) * 180) / Math.PI + 360) % 360;
  return { lightness, chroma, hue };
}

function inRange(value, [min, max]) {
  return value >= min && value <= max;
}

function hueDelta(left, right) {
  const delta = Math.abs(left - right) % 360;
  return Math.min(delta, 360 - delta);
}

function format(value) {
  return value.toFixed(3);
}

function checkMode(css, mode) {
  const variables = collectModeVariables(css, mode);
  const background = resolveToken('--color-background', variables);
  const text = resolveToken('--content-panel-text-color', variables);
  const rawContentText = variables['--content-panel-text-color']?.trim().toLowerCase();
  const rules = TOKEN_RULES[mode];
  const failures = [];

  if (!background) failures.push(`${mode}: could not resolve --color-background`);
  if (!text) failures.push(`${mode}: could not resolve --content-panel-text-color`);
  if (!background || !text) return failures;

  if (mode === 'dark' && rawContentText === FORBIDDEN_DARK_CONTENT_TEXT) {
    failures.push(`${mode}: --content-panel-text-color must not be ${FORBIDDEN_DARK_CONTENT_TEXT}`);
  }

  const backgroundOklch = rgbToOklch(background);
  const textOklch = rgbToOklch(text);
  const deltaL = Math.abs(textOklch.lightness - backgroundOklch.lightness);

  if (!inRange(backgroundOklch.lightness, rules.backgroundL)) {
    failures.push(`${mode}: background L ${format(backgroundOklch.lightness)} outside ${rules.backgroundL.join('-')}`);
  }
  if (!inRange(textOklch.lightness, rules.textL)) {
    failures.push(`${mode}: text L ${format(textOklch.lightness)} outside ${rules.textL.join('-')}`);
  }
  if (!inRange(deltaL, rules.deltaL)) {
    failures.push(`${mode}: text/background delta L ${format(deltaL)} outside ${rules.deltaL.join('-')}`);
  }
  if (textOklch.chroma >= rules.textChromaMax) {
    failures.push(`${mode}: text chroma ${format(textOklch.chroma)} must be < ${rules.textChromaMax}`);
  }
  if (textOklch.chroma >= rules.textChromaMax && hueDelta(textOklch.hue, backgroundOklch.hue) >= 30) {
    failures.push(`${mode}: text/background hue delta ${format(hueDelta(textOklch.hue, backgroundOklch.hue))} must be < 30 for non-neutral text`);
  }
  return failures;
}

const css = readSources();
const failures = [...checkMode(css, 'light'), ...checkMode(css, 'dark')];

if (failures.length > 0) {
  console.error(['[check-reading-typography-tokens] failed:', ...failures.map((failure) => `- ${failure}`)].join('\n'));
  process.exit(1);
}

console.log('[check-reading-typography-tokens] ok');
