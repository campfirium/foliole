import type { AideContextSnapshot } from '../../../../lib/core/assistant/aideAttachedContextCandidates';
import type { AideContextNode } from '../../../../lib/core/assistant/aideAttachedContextSource';

// Fixed English example for the attached-content preview. The preview runs it through the same
// candidate builder and allocation function that real sending uses.
export const AIDE_CONTEXT_EXAMPLE_TITLE = 'Why does Aide have so many context settings?';
export const AIDE_CONTEXT_EXAMPLE_QUESTION = 'How do I decide which context to keep and which to leave out?';

const ARTICLE = `---
author: Foliole
---

# Why does Aide have so many context settings?

## How context affects the answer

Giving the model enough relevant context often leads to much better answers, but it also uses more input tokens.

More context isn’t always better. Too much irrelevant information can make it harder for the AI to pick out what matters.

In a typical AI chat, you decide what to share. You can send the AI a long article, for example, but the longer it is, the harder it is for the model to keep track of every detail. It can miss important information even when the whole article fits in its context window.

## What Foliole can provide

Foliole gives Aide more to work with. Along with the article itself, Aide can draw on the material you’ve built up around it.

Say you select a passage and ask, “Is there a problem with this argument?”

- Selected text only. The AI can assess the words you highlighted, but it may miss an assumption the author introduced earlier.
- Surrounding text. The AI can follow more of the argument and see whether the passage is being taken out of context.
- Chapter outline and source details. These help the AI place the passage in the article or book and understand the topic the author is discussing.
- Your excerpts, rewrites, and cards. These give the AI a record of how you understood the passage, including questions you raised or points you disagreed with.

## Why these settings are adjustable

Each kind of context serves a different purpose. Explaining a passage, comparing chapters, checking an argument, and revisiting your own interpretation all call for different information.

Sending every related item in full would use more input tokens and might do little to improve the answer. Aide has to choose what to include, how much of each item to send, and what to keep first when space is limited.

Foliole makes those choices for you with a set of defaults. You can adjust them to suit the way you read, how you organize your library, and the kinds of questions you ask.

For everyday use, start with the defaults. If Aide often misses a kind of background you need or includes material you rarely use, adjust those settings as you go.

If you find a recurring problem or a configuration that works better for you, let us know. Real examples help us improve the defaults.`;

const PARAGRAPH = 'More context isn’t always better. Too much irrelevant information can make it harder for the AI to pick out what matters.';

const folder = (id: string, title: string): AideContextNode => ({ anchor: null, content: '', id, kind: 'folder', title });

function anchored(id: string, parentContent: string, text: string): AideContextNode {
  const from = parentContent.indexOf(text);
  return {
    anchor: { id: `anchor-${id}`, kind: 'highlight', locator: { from, originalText: text, to: from + text.length } },
    content: text,
    id,
    kind: 'topic',
    title: text.slice(0, 40)
  };
}

export function createAideContextExampleSnapshot(): AideContextSnapshot {
  const article: AideContextNode = { anchor: null, content: ARTICLE, id: 'example-article', kind: 'topic', title: AIDE_CONTEXT_EXAMPLE_TITLE };
  // An earlier excerpt of the whole paragraph; dedupe drops it because the highlight already carries it.
  const excerpt = anchored('example-excerpt', ARTICLE, PARAGRAPH);
  const highlight = anchored('example-highlight', PARAGRAPH, PARAGRAPH);
  const cloze: AideContextNode = {
    anchor: null,
    content: 'Too much irrelevant information can make it harder for the AI to pick out [...].',
    id: 'example-item',
    kind: 'item',
    reveal: 'what matters',
    title: 'Cloze'
  };
  return {
    ancestors: [excerpt, article, folder('example-folder', 'Foliole Aide'), folder('example-root', 'User Guides')],
    children: [cloze],
    collections: { dives: ['Aide Settings'], indexes: ['Getting Started'] },
    focus: highlight
  };
}
