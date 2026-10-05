package com.foliole.android.framed;

final class FramedSyncSQLiteValues {
    private FramedSyncSQLiteValues() {}

    static String[] blobArgs(Object... values) {
        String[] args = new String[values.length];
        for (int index = 0; index < values.length; index++) {
            Object value = values[index];
            if (value instanceof byte[]) {
                args[index] = hex((byte[]) value);
            } else {
                args[index] = String.valueOf(value);
            }
        }
        return args;
    }

    private static String hex(byte[] value) {
        StringBuilder result = new StringBuilder(value.length * 2);
        for (byte item : value) {
            result.append(String.format(java.util.Locale.ROOT, "%02X", Byte.toUnsignedInt(item)));
        }
        return result.toString();
    }
}
