package com.foliole.android;

final class FolioleCompanionContentBlobBatchText {
    private FolioleCompanionContentBlobBatchText() {}

    static String requireText(String value, String field) {
        if (value == null || value.trim().isEmpty()) {
            throw new IllegalArgumentException(field + " is required.");
        }
        return value.trim();
    }
}
