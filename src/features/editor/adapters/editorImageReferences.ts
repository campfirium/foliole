import { StateEffect, StateField } from '@codemirror/state';

import type { ContentImageReference } from '../../../../lib/core/sync/localContentEditResources';

import { activeNodeIdFacet } from './liveMarkdownState';

export const addEditorImageReferences = StateEffect.define<readonly ContentImageReference[]>();
export const editorImageReferences = StateField.define<readonly ContentImageReference[]>({
  create: () => [],
  update(value, transaction) {
    const changedNode = transaction.startState.facet(activeNodeIdFacet) !== transaction.state.facet(activeNodeIdFacet);
    const references = new Map((changedNode ? [] : value).map(reference => [reference.storage_key, reference]));
    for (const effect of transaction.effects) {
      if (effect.is(addEditorImageReferences)) {
        for (const reference of effect.value) {
          if (!references.has(reference.storage_key)) references.set(reference.storage_key, reference);
        }
      }
    }
    return [...references.values()];
  }
});
