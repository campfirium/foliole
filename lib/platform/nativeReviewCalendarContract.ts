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
