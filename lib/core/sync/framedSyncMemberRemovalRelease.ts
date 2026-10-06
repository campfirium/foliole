/** Run inside the transaction that validates and completes the existing member removal. */
export function framedSyncMemberRemovalReleaseStatements(groupId: string, senderDeviceId: string) {
  const removedReceiver = `publication.group_id = ? AND publication.sender_device_id = ?
    AND EXISTS (SELECT 1 FROM sync_group_removal_decisions removal
      JOIN sync_group_devices device ON device.group_id = removal.group_id
        AND device.device_identity_key = removal.target_device_identity_key AND device.state = 'left'
      WHERE removal.group_id = publication.group_id
        AND removal.target_device_identity_key = publication.receiver_device_id
        AND removal.completed_at IS NOT NULL AND removal.superseded_at IS NULL)`;
  const params = [groupId, senderDeviceId];
  return [
    { sql: `UPDATE framed_sync_outbound_publications AS publication SET state = 'terminated'
        WHERE publication.state = 'published' AND ${removedReceiver}`, params },
    { sql: `DELETE FROM framed_sync_outbound_holds
        WHERE EXISTS (SELECT 1 FROM framed_sync_outbound_publications publication
          WHERE publication.transfer_id = framed_sync_outbound_holds.transfer_id
            AND publication.receiver_device_id = framed_sync_outbound_holds.member_id
            AND ${removedReceiver})`, params }
  ];
}
