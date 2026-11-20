export const companionSandboxScenarios = [
  { id: 'sync-failure', label: 'Sync failure', zhHansLabel: '同步失败' }
] as const;

export type CompanionSandboxScenario = (typeof companionSandboxScenarios)[number]['id'];

export interface CompanionSandboxScenarioStore {
  isEnabled(scenario: CompanionSandboxScenario): boolean;
  setEnabled(scenario: CompanionSandboxScenario, enabled: boolean): void;
  subscribe(listener: () => void): () => void;
}

declare global {
  interface Window {
    __FOLIOLE_COMPANION_SANDBOX__?: boolean;
    __folioleSandboxScenarios?: CompanionSandboxScenarioStore;
  }
}
