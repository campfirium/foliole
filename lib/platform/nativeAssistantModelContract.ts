export interface NativeAssistantReasoningEffortOption {
  description: string;
  effort: string;
}

export interface NativeAssistantServiceTierOption {
  description: string;
  id: string;
  name: string;
}

export interface NativeAssistantModelOption {
  defaultReasoningEffort: string;
  defaultServiceTier: string | null;
  description: string;
  displayName: string;
  isDefault: boolean;
  model: string;
  serviceTiers: NativeAssistantServiceTierOption[];
  supportedReasoningEfforts: NativeAssistantReasoningEffortOption[];
}

export interface NativeAssistantModelCatalog {
  models: NativeAssistantModelOption[];
}

export interface NativeAssistantModelSelection {
  effort: string;
  model: string;
  serviceTier: string | null;
}
