export const sidebarModes = ['dock', 'edge', 'closed'] as const;
export type SidebarMode = (typeof sidebarModes)[number];
export type SidebarSide = 'left' | 'right';
export interface SidebarRule {
  mode: SidebarMode;
  width: number;
}
export interface SidebarTier {
  id: string;
  threshold: number | null;
  left: SidebarRule;
  right: SidebarRule;
}

export const defaultSidebarTiers: SidebarTier[] = [
  { id: 'base', threshold: null, left: { mode: 'edge', width: 44 }, right: { mode: 'edge', width: 32 } },
  { id: 'medium', threshold: 50, left: { mode: 'dock', width: 28 }, right: { mode: 'edge', width: 24 } },
  { id: 'wide', threshold: 80, left: { mode: 'dock', width: 28 }, right: { mode: 'dock', width: 24 } }
];

function isRule(value: unknown): value is SidebarRule {
  if (!value || typeof value !== 'object') return false;
  const rule = value as Partial<SidebarRule>;
  return sidebarModes.includes(rule.mode as SidebarMode) && typeof rule.width === 'number' &&
    Number.isFinite(rule.width) && rule.width >= 0 && rule.width <= 100;
}

function isTier(value: unknown): value is SidebarTier {
  if (!value || typeof value !== 'object') return false;
  const tier = value as Partial<SidebarTier>;
  const threshold = tier.threshold;
  return typeof tier.id === 'string' && tier.id.length > 0 && isRule(tier.left) && isRule(tier.right) &&
    (threshold === null || (typeof threshold === 'number' && Number.isInteger(threshold) && threshold >= 0 && threshold <= 100));
}

export function parseSidebarTiers(raw: string | null): SidebarTier[] | null {
  if (!raw) return null;
  try {
    const tiers: unknown = JSON.parse(raw);
    if (!Array.isArray(tiers) || !tiers.every(isTier) || tiers.filter(tier => tier.threshold === null).length !== 1) return null;
    if (new Set(tiers.map(tier => tier.id)).size !== tiers.length ||
        new Set(tiers.map(tier => tier.threshold)).size !== tiers.length) return null;
    return tiers;
  } catch {
    return null;
  }
}

export function selectSidebarTier(tiers: readonly SidebarTier[], percent: number): SidebarTier | undefined {
  let active = tiers.find(tier => tier.threshold === null);
  for (const tier of tiers) {
    if (tier.threshold !== null && tier.threshold <= percent && tier.threshold > (active?.threshold ?? -1)) {
      active = tier;
    }
  }
  return active;
}

export function nextSidebarThreshold(tiers: readonly SidebarTier[], percent: number) {
  const occupied = new Set(tiers.map(tier => tier.threshold));
  return Array.from({ length: 101 }, (_, value) => value)
    .filter(value => !occupied.has(value))
    .sort((left, right) => Math.abs(left - percent) - Math.abs(right - percent))[0];
}
