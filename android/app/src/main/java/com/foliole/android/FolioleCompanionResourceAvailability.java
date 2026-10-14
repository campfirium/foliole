package com.foliole.android;

import java.security.MessageDigest;

final class FolioleCompanionResourceAvailability {
    private FolioleCompanionResourceAvailability() {}

    static String digest(byte[] bytes) throws Exception {
        StringBuilder value = new StringBuilder();
        for (byte item : MessageDigest.getInstance("SHA-256").digest(bytes)) value.append(String.format("%02x", item));
        return value.toString();
    }
}
