package com.foliole.android;

final class FolioleCompanionSyncGroupHttpError {
    final int status;
    final String code;

    FolioleCompanionSyncGroupHttpError(Exception error) {
        String message = error.getMessage();
        if (error instanceof SecurityException) {
            status = "sync_group_member_state_required".equals(message) ? 409 : 401;
            code = message;
        } else if (error instanceof IllegalArgumentException) {
            status = "sync_group_join_capacity_exceeded".equals(message) ? 429 : 400;
            code = message;
        } else if ("sync_round_busy".equals(message) || "sync_round_expired".equals(message)
                || "sync_group_member_state_required".equals(message)) {
            status = 409;
            code = message;
        } else {
            status = 500;
            code = "provider_error";
        }
    }
}
