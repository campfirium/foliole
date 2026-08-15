package com.foliole.android;

final class FolioleCompanionWorkgroupSession {
    private static String key;

    private FolioleCompanionWorkgroupSession() {}

    static synchronized void open(String workgroupKey) {
        if (workgroupKey == null || workgroupKey.trim().isEmpty()) {
            throw new IllegalArgumentException("workgroup_key is required.");
        }
        key = workgroupKey.trim();
    }

    static synchronized String requireKey() {
        if (key == null) throw new IllegalStateException("sync_group_workgroup_key_missing");
        return key;
    }

    static synchronized void close() {
        key = null;
    }
}
