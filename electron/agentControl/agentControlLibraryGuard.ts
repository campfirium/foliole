import { readLibraryConnectionLifetime } from '../database/libraryConnectionLifetime.js';

export const AGENT_CONTROL_LIBRARY_GENERATION_HEADER = 'x-foliole-library-generation';

export function matchesAgentControlLibraryGeneration(generation: string | undefined) {
  return generation === undefined || generation === readLibraryConnectionLifetime().generation;
}
