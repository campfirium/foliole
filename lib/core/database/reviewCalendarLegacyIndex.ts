const fourDigitDate = '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]';

// Only fixed-width ISO dates can be bounded safely using their stored text.
export function legacyReviewCalendarDateSql(timestamp: string) {
  return `NOT (${timestamp} GLOB '${fourDigitDate}' OR ${timestamp} GLOB '${fourDigitDate}[Tt]*')`;
}

export const LEGACY_REVIEW_CALENDAR_INDEX = `CREATE INDEX IF NOT EXISTS idx_review_log_calendar_legacy
  ON review_log (reviewed_at) WHERE ${legacyReviewCalendarDateSql('reviewed_at')}`;
