package com.foliole.android;

import java.io.IOException;
import java.net.SocketException;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;

final class FolioleCompanionPluginErrors {
    private FolioleCompanionPluginErrors() {}

    /** Code for a request that never completed because the peer connection was missing or dropped. */
    static String peerUnreachableCode(Exception error) {
        String message = error.getMessage();
        boolean unreachable = error instanceof SocketException || error instanceof SocketTimeoutException ||
            error instanceof UnknownHostException ||
            (error instanceof IOException && message != null && message.startsWith("unexpected end of stream"));
        return unreachable ? "E_PEER_UNREACHABLE" : null;
    }

    static String withCause(String message, Exception exception) {
        String cause = exception.getMessage();
        String causeType = exception.getClass().getSimpleName();
        if (cause == null || cause.trim().isEmpty()) {
            return message + " Cause: " + causeType + ".";
        }
        return message + " Cause: " + causeType + ": " + cause.trim();
    }
}
