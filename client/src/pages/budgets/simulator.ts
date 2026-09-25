import { relativeTime } from '../../utils/dates';

export { relativeTime };

export type CategoryKey = 'dining' | 'shopping' | 'transit';
export type CategoryDef = { key: CategoryKey; label: string; icon: string };
export type CategoryLimits = Record<CategoryKey, number>;
export type Scenario = { id: string; name: string; limits: CategoryLimits; savedAt: number };

export const CATEGORIES: CategoryDef[] = [
  { key: 'dining', label: 'Dining', icon: '🍴' },
  { key: 'shopping', label: 'Shopping', icon: '🛍️' },
  { key: 'transit', label: 'Transit', icon: '🚌' },
];

// Sample fixture data. Not wired to a backend yet — mirrors the pattern used by
// GroupsWorkspace's initialGroups until F3's real budget store exists.
export const CURRENT_LIMITS: CategoryLimits = { dining: 36500, shopping: 32500, transit: 20000 };
export const CURRENT_PACE_PROJECTED_LEFT_CENTS = 42810;
export const SCALE_MAX_CENTS = 120000;
export const SLIDER_STEP_CENTS = 500;
export const MAX_SAVED_SCENARIOS = 8;
export const MAX_COMPARE_SELECTION = 2;

// Deterministic pure projection: every dollar cut from a category limit is a dollar
// added to projected month-end balance. Mirrors H1/FR-40's "pure function of history
// and limits" shape so a real projection engine can later replace scenarioDeltaCents.
export const scenarioDeltaCents = (currentLimits: CategoryLimits, scenarioLimits: CategoryLimits) =>
  CATEGORIES.reduce((sum, { key }) => sum + (currentLimits[key] - scenarioLimits[key]), 0);

export const projectedLeftCents = (currentLimits: CategoryLimits, scenarioLimits: CategoryLimits, basePaceCents: number) =>
  basePaceCents + scenarioDeltaCents(currentLimits, scenarioLimits);

export const changedCategories = (currentLimits: CategoryLimits, scenarioLimits: CategoryLimits) =>
  CATEGORIES.filter(({ key }) => scenarioLimits[key] !== currentLimits[key]);

export const initials = (name: string) => name.split(' ').filter(Boolean).slice(0, 2).map(word => word[0]!.toUpperCase()).join('') || '?';

export const nextDraftName = (existing: Scenario[]) => {
  let n = existing.length + 1;
  while (existing.some(scenario => scenario.name === `New scenario ${n}`)) n++;
  return `New scenario ${n}`;
};

const hoursAgo = (hours: number) => Date.now() - hours * 3600000;
const daysAgo = (days: number) => Date.now() - days * 86400000;

export const initialScenarios: Scenario[] = [
  { id: 'weekend-cutback', name: 'Weekend cutback', limits: { dining: 28000, shopping: 22000, transit: 18000 }, savedAt: hoursAgo(2) },
  { id: 'no-dining-out', name: 'No dining out', limits: { dining: 5000, shopping: 32500, transit: 20000 }, savedAt: hoursAgo(26) },
  { id: 'public-transit-only', name: 'Public transit only', limits: { dining: 36500, shopping: 32500, transit: 6000 }, savedAt: daysAgo(3) },
];

export const initialSelectedIds = ['weekend-cutback', 'no-dining-out'];
