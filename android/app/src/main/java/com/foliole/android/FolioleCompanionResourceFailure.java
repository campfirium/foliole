package com.foliole.android;

final class FolioleCompanionResourceFailure {
    private FolioleCompanionResourceFailure() {}

    static String classify(Exception error) {
        String message = String.valueOf(error.getMessage());
        if (message.contains("hash mismatch")) return "checksum_mismatch";
        if (message.contains("401") || message.contains("403") || message.contains("aead")
            || message.contains("signature") || error instanceof SecurityException) return "authentication_failed";
        if (message.contains("404") || message.contains("missing_file")) return "missing_file";
        if (error instanceof java.net.SocketException || error instanceof java.net.SocketTimeoutException
            || error instanceof java.net.UnknownHostException) return "network_error";
        return "protocol_error";
    }
}
