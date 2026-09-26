/**
 * Two rendering budgets. Low detail keeps the same room and the same kids — it only
 * drops a fixed subset of them and the most expensive effects — so switching never
 * reshuffles who is sitting where.
 */
export type DetailLevel = "high" | "low";

export interface DetailBudget {
  shadows: boolean;
  /** Upper bound on device pixels per CSS pixel. */
  maxPixelRatio: number;
  walkersPerLoop: number;
  /** Keep one seated kid out of this many (1 keeps everyone). */
  seatedKeepEvery: number;
  /** Keep one kid in the lunch line out of this many. */
  lineKeepEvery: number;
  steam: boolean;
}

export const DETAIL_BUDGETS: Record<DetailLevel, DetailBudget> = {
  high: { shadows: true, maxPixelRatio: 2, walkersPerLoop: 3, seatedKeepEvery: 1, lineKeepEvery: 1, steam: true },
  low: { shadows: false, maxPixelRatio: 1, walkersPerLoop: 1, seatedKeepEvery: 2, lineKeepEvery: 2, steam: false },
};

/** Whether the kid at this position in a generated list is drawn at this detail level. */
export function keepsKid(indexInList: number, keepEvery: number): boolean {
  return indexInList % keepEvery === 0;
}
