import { VISIBLE_NODES_CTE_SQL } from './workspaceVisibleNodesSql.js';

const NODE_READING_COLUMNS = [
  { key: 'node_id', source: 'node_id', type: 'string' },
  { key: 'interval_duration_ms', source: 'interval_duration_ms', type: 'long' },
  { key: 'interval_growth_factor', source: 'interval_growth_factor', type: 'double' },
  { key: 'last_handled_at', source: 'last_handled_at', type: 'string' },
  { key: 'next_at', source: 'next_at', type: 'string' },
  { key: 'priority', source: 'priority', type: 'double' },
  { key: 'repetition_count', source: 'repetition_count', type: 'long' },
  { key: 'state', source: 'state', type: 'string' }
];

export const ANDROID_COMPANION_LEARNING_PAYLOAD_QUERY_DEFINITIONS = {
  syncPayloadNodeReading: {
    columns: NODE_READING_COLUMNS,
    resultKey: 'payloads',
    syncPayload: {
      argMode: 'object_id',
      defaultHostName: '*',
      defaultIntervalDurationMs: 0,
      defaultIntervalGrowthFactor: 1,
      defaultPriority: 0,
      defaultReadingPosition: 0,
      defaultRepetitionCount: 0,
      defaultState: 'active',
      hostNamePayloadKey: 'host_name',
      hashIgnoredPayloadKeys: ['host_name', 'reading_position'],
      inputPayloadKey: 'reading_json',
      intervalDurationMsPayloadKey: 'interval_duration_ms',
      intervalGrowthFactorPayloadKey: 'interval_growth_factor',
      lastHandledAtPayloadKey: 'last_handled_at',
      nextAtPayloadKey: 'next_at',
      nodeIdPayloadKey: 'node_id',
      objectType: 'node_reading',
      priorityPayloadKey: 'priority',
      readingPositionPayloadKey: 'reading_position',
      recordDeletedAtKey: 'deleted_at',
      recordUpdatedAtKey: 'updated_at',
      repetitionCountPayloadKey: 'repetition_count',
      statePayloadKey: 'state'
    },
    sql:
      `${VISIBLE_NODES_CTE_SQL} ` +
      'SELECT node_id, interval_duration_ms, interval_growth_factor, last_handled_at, next_at, priority, repetition_count, state ' +
      'FROM node_reading INNER JOIN visible_nodes visible ON visible.id = node_reading.node_id WHERE node_id = ? LIMIT 1'
  }
};
