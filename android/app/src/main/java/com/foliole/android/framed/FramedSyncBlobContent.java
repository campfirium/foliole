package com.foliole.android.framed;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;

public final class FramedSyncBlobContent {
    private final long byteLength;
    private final byte[] sha256;
    private final Source source;

    public FramedSyncBlobContent(byte[] sha256, byte[] data) {
        this.sha256 = sha256.clone();
        byte[] stored = data.clone();
        byteLength = stored.length;
        source = () -> new ByteArrayInputStream(stored);
    }

    public static FramedSyncBlobContent file(byte[] sha256, File file) {
        return new FramedSyncBlobContent(sha256, file.length(), () -> new FileInputStream(file));
    }

    private FramedSyncBlobContent(byte[] sha256, long byteLength, Source source) {
        this.sha256 = sha256.clone();
        this.byteLength = byteLength;
        this.source = source;
    }

    long byteLength() { return byteLength; }
    InputStream open() throws Exception { return source.open(); }
    byte[] sha256() { return sha256.clone(); }

    private interface Source { InputStream open() throws Exception; }
}
