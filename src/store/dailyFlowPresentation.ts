export interface ReviewFlowWindow {
  queriedAt?: string;
  dayBuckets: { dayOffset: number; nodeIds: string[] }[];
  dayOffsetByNodeId: Record<string, number | undefined>;
  queueNodeIds: string[];
  readyNodeIds: string[];
  upcomingNodeIds: string[];
}
