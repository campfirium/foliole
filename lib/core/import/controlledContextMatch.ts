import {
  createContextExcerptLocator,
  findContextExcerptInLocator,
  type ContextExcerptLocator
} from './contextExcerptLocator.js';

export { createContextExcerptLocator, findContextExcerptInLocator, type ContextExcerptLocator };

export function findContextExcerpt(content: string, quote: string) {
  return findContextExcerptInLocator(createContextExcerptLocator(content), quote);
}
