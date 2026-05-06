package com.foliole.android;

final class FolioleCompanionPluginErrors {
    private FolioleCompanionPluginErrors() {}

    static String withCause(String message, Exception exception) {
        String cause = exception.getMessage();
        String causeType = exception.getClass().getSimpleName();
        if (cause == null || cause.trim().isEmpty()) {
            return message + " Cause: " + causeType + ".";
        }
        return message + " Cause: " + causeType + ": " + cause.trim();
    }
}
