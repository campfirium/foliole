package com.foliole.android.framed;

public final class FramedSyncContract {
    public static final int PROTOCOL_VERSION = 22;
    public static final int DIGEST_BYTES = 32;
    public static final int IDENTIFIER_BYTES = 16;
    public static final int BLOB_CHUNK_BYTES = 512 * 1024;
    public static final long MAX_BLOB_BYTES = 8L * 1024 * 1024 * 1024;
    public static final long MAX_TRANSFER_BYTES = 32L * 1024 * 1024 * 1024;
    public static final int MAX_BLOBS_PER_TRANSFER = 4_096;
    public static final int MAX_CANONICAL_DEPTH = 32;
    public static final int MAX_CANONICAL_STRING_BYTES = 1024 * 1024;
    public static final int MAX_CANONICAL_FIELDS = 100_000;
    public static final int MAX_DECODED_REPEATED_ITEMS = 100_000;
    public static final int MAX_FACTS_PER_TRANSFER = 4_096;
    public static final int MAX_INVENTORY_ENTRIES = 100_000;
    public static final int MAX_INVENTORY_ENTRIES_PER_FRAME = 128;
    public static final int MAX_INVENTORY_FACT_IDS_PER_ENTRY = 100_000;
    public static final int MAX_SESSION_BYTES = 64 * 1024 * 1024;
    public static final int MAX_SESSION_FRAMES = 16_384;
    public static final int MAX_FACT_BLOB_EDGES = 4_096;
    public static final int MAX_PROTOCOL_CAPABILITIES = 64;
    public static final int MAX_PROTOCOL_STRING_BYTES = 64 * 1024;
    public static final int MAX_CONTROL_MESSAGE_BYTES = 768 * 1024;
    public static final int MAX_MANIFEST_BYTES = 768 * 1024;
    public static final int MAX_FRAME_MESSAGE_BYTES = 2 * 1024 * 1024;

    private FramedSyncContract() {}
}
