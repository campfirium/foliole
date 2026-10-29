export interface NativeReviewCalendarHistoryArgs {
  from: string;
  to: string;
}

export interface NativeReviewCalendarDay {
  day: string;
  items: number;
  topics: number | null;
}

export interface NativeReviewCalendarHistory {
  days: NativeReviewCalendarDay[];
  topicCoverageFrom: string;
}

export interface NativeReviewCalendarArgs extends NativeReviewCalendarHistoryArgs {
  now: string;
  libraryScope: string;
}

export interface NativeReviewCalendar extends NativeReviewCalendarHistory {
  scheduledDays: NativeReviewCalendarDay[];
}
