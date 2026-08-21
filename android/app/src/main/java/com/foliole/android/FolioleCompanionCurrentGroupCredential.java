package com.foliole.android;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

final class FolioleCompanionCurrentGroupCredential {
    private static final String DATABASE_NAME = "foliole-companionSQLite.db";

    final String authorizationId;
    final String workgroupKey;

    private FolioleCompanionCurrentGroupCredential(
        String authorizationId,
        String workgroupKey
    ) {
        this.authorizationId = authorizationId;
        this.workgroupKey = workgroupKey;
    }

    static FolioleCompanionCurrentGroupCredential load(Context context, String groupId) {
        SQLiteDatabase database = SQLiteDatabase.openDatabase(
            context.getDatabasePath(DATABASE_NAME).getPath(),
            null,
            SQLiteDatabase.OPEN_READONLY
        );
        try (Cursor cursor = database.rawQuery(
            "SELECT member.authorization_id, groups.workgroup_key " +
                "FROM sync_group_local_state local " +
                "JOIN sync_groups groups ON groups.group_id = local.group_id " +
                "JOIN sync_group_members member ON member.group_id = local.group_id " +
                "AND member.host_name = local.local_host_name " +
                "WHERE local.singleton_id = 1 AND local.member_state = 'active' " +
                "AND member.state = 'active' AND local.group_id = ? LIMIT 2",
            new String[]{groupId.trim()}
        )) {
            if (!cursor.moveToFirst()) {
                throw new SecurityException("sync_group_current_credential_missing");
            }
            String authorizationId = cursor.getString(0);
            String workgroupKey = cursor.getString(1);
            if (cursor.moveToNext() || blank(authorizationId) || blank(workgroupKey)) {
                throw new SecurityException("sync_group_current_credential_invalid");
            }
            return new FolioleCompanionCurrentGroupCredential(
                authorizationId.trim(), workgroupKey.trim()
            );
        } finally {
            database.close();
        }
    }

    private static boolean blank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
