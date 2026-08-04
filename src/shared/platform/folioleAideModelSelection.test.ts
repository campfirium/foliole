import { expect, it } from 'vitest';

import type { NativeAssistantModelCatalog } from '../../../lib/platform/nativeAssistantModelContract';

import { resolveFolioleAideModelSelection } from './folioleAideSettings';

const catalog: NativeAssistantModelCatalog = {
  models: [{
    defaultReasoningEffort: 'high',
    defaultServiceTier: 'fast',
    description: 'Default model',
    displayName: 'GPT Default',
    isDefault: true,
    model: 'gpt-default',
    serviceTiers: [{ description: 'Fast', id: 'fast', name: 'Fast' }],
    supportedReasoningEfforts: [
      { description: 'High', effort: 'high' },
      { description: 'Medium', effort: 'medium' }
    ]
  }, {
    defaultReasoningEffort: 'medium',
    defaultServiceTier: null,
    description: 'Second model',
    displayName: 'GPT Second',
    isDefault: false,
    model: 'gpt-second',
    serviceTiers: [],
    supportedReasoningEfforts: [{ description: 'Medium', effort: 'medium' }]
  }]
};

it('keeps a complete supported saved selection', () => {
  expect(resolveFolioleAideModelSelection(catalog, {
    effort: 'medium', model: 'gpt-default', serviceTier: 'fast'
  })).toEqual({ effort: 'medium', model: 'gpt-default', serviceTier: 'fast' });
});

it('resets the whole selection when one saved option is no longer supported', () => {
  expect(resolveFolioleAideModelSelection(catalog, {
    effort: 'ultra', model: 'gpt-second', serviceTier: null
  })).toEqual({ effort: 'high', model: 'gpt-default', serviceTier: 'fast' });
});
