/**
 * Thresholds for the month-end close detectors. Kept as plain constants so they
 * can be tuned without a code deploy later when we introduce per-org overrides.
 */
export const closeThresholds = {
	/** Minimum absolute dollar movement before a variance is "material". */
	materialAbs: 500,
	/** Minimum percentage movement before a variance is "material". */
	materialPct: 10,
	/** Minimum value for a "new" line to raise a finding (kills pennies). */
	newLineMinAbs: 100,
	/** Minimum prior-period value for a "missing recurring" to raise a finding. */
	missingRecurringMinAbs: 100,
	/** Multiplier over baseline required for a one-off spike. */
	oneOffMultiplier: 3,
	/** Minimum absolute dollar value for a one-off spike finding. */
	oneOffMinAbs: 250,
	/** Percentage points GM% must shift by to flag a drift. */
	grossMarginDriftPts: 5,
	/** Severity escalation — critical when absolute delta exceeds this. */
	criticalAbs: 5000,
} as const

export type CloseThresholds = typeof closeThresholds
