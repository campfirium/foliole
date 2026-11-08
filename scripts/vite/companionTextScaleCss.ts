import type { Plugin } from 'postcss';

const ABSOLUTE_TEXT_LENGTH = /^-?(?:\d*\.)?\d+(?:px|rem)$/u;
const FONT_SIZE_TOKEN = /^var\(--(?:text-|app-|companion-|navigation-)/u;

export function companionTextScaleCss(): Plugin {
  return {
    postcssPlugin: 'foliole-companion-text-scale',
    Declaration(declaration) {
      const { prop, value } = declaration;
      const scale = prop === 'font-size'
        ? ABSOLUTE_TEXT_LENGTH.test(value) || FONT_SIZE_TOKEN.test(value)
        : prop === 'line-height' && ABSOLUTE_TEXT_LENGTH.test(value);
      if (scale) declaration.value = `calc(${value} * var(--companion-text-scale, 1))`;
    }
  };
}
