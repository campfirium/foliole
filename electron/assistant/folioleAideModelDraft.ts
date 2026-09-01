import type { NativeAssistantModelDraftInput } from '../../lib/platform/nativeAssistantModelSettingsContract.js';

import type { StoredAssistantModel as StoredModel } from './folioleAideModelSettingsStorage.js';

export function createStoredModelDraft(
  input: NativeAssistantModelDraftInput,
  previous?: StoredModel
): StoredModel {
  const id = previous?.id ?? validateDraftId(input.id);
  return {
    endpoint: validateDraftText(input.endpoint, 2048, 'invalid_byok_endpoint'),
    id,
    model: validateDraftText(input.model, 200, 'invalid_byok_model'),
    requires_new_key: input.api_key !== undefined
      ? !input.api_key.trim()
      : previous?.requires_new_key === true || previous?.endpoint !== input.endpoint,
    secret_file: previous?.secret_file ?? `foliole-aide-model-${id}.bin`,
    updated_at: new Date().toISOString(),
    verified: false
  };
}

export function validateDraftId(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error('invalid_assistant_model_id');
  }
  return value;
}

function validateDraftText(value: string, maxLength: number, error: string) {
  if (value.length > maxLength) throw new Error(error);
  return value;
}
