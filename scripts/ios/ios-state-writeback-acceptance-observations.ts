export function createIosStateWritebackObservations() {
  return {
    ack_statuses: [] as string[],
    last_push_items: [] as Array<{ object_type: string; payload_json: unknown }>,
    pack_requests: 0,
    push_requests: 0,
    pushed_object_types: [] as string[]
  };
}
