import { hashTextBody } from '../database/textBodyHash.js';

export function dailyFlowMembershipHash(ids: readonly string[]) {
  return hashTextBody(JSON.stringify([...new Set(ids)].sort()));
}
