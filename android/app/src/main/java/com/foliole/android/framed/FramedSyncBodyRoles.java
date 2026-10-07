package com.foliole.android.framed;

final class FramedSyncBodyRoles {
    private FramedSyncBodyRoles() {}

    static boolean isBody(int role) {
        return role == 1 || role == 5;
    }
}
