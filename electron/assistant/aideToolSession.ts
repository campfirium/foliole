import { estimateAideTokens } from '../../lib/core/assistant/aideTokenEstimate.js';
import {
  createDefaultAideToolPermissionSettings,
  listAideDisabledToolNames,
  type AideToolPermissionSettings
} from '../../lib/core/assistant/aideToolPermissionSettings.js';

// One per reply: the tool switches in force for it and what its read tools have consumed so far.
export interface AideToolSession {
  disabledTools: ReadonlySet<string>;
  readBudget: number;
  readUsed: number;
}

export function createAideToolSession(
  settings: AideToolPermissionSettings = createDefaultAideToolPermissionSettings()
): AideToolSession {
  return {
    disabledTools: new Set(listAideDisabledToolNames(settings)),
    readBudget: settings.readBudget,
    readUsed: 0
  };
}

export function isAideToolOffered(session: AideToolSession | undefined, toolName: string) {
  return !session?.disabledTools.has(toolName);
}

// Charges a read result against the reply's budget; a result that does not fit is not delivered.
export function chargeAideReadResult(session: AideToolSession | undefined, text: string) {
  if (!session) return { ok: true as const };
  const tokens = estimateAideTokens(text);
  const remaining = Math.max(0, session.readBudget - session.readUsed);
  if (tokens > remaining) return { ok: false as const, remaining };
  session.readUsed += tokens;
  return { ok: true as const };
}
