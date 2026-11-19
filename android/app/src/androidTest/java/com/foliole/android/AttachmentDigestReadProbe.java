package com.foliole.android;

import java.security.MessageDigest;
import java.security.MessageDigestSpi;
import java.security.NoSuchAlgorithmException;
import java.security.Provider;
import java.security.Security;
import java.util.concurrent.atomic.AtomicLong;

/** Counts bytes presented to SHA-256 while the resolver reads the real file. */
public final class AttachmentDigestReadProbe extends MessageDigestSpi implements AutoCloseable {
    private static final String ALGORITHM = "SHA-256";
    private static final String NAME = "FolioleTestDigestReadProbe";
    private static final AtomicLong BYTES = new AtomicLong();
    private static final AtomicLong DIGESTS = new AtomicLong();
    private final MessageDigest delegate;

    public AttachmentDigestReadProbe() throws NoSuchAlgorithmException {
        for (Provider provider : Security.getProviders("MessageDigest." + ALGORITHM)) {
            if (NAME.equals(provider.getName())) continue;
            delegate = MessageDigest.getInstance(ALGORITHM, provider);
            return;
        }
        throw new NoSuchAlgorithmException(ALGORITHM);
    }

    static AttachmentDigestReadProbe install() throws NoSuchAlgorithmException {
        AttachmentDigestReadProbe probe = new AttachmentDigestReadProbe();
        Provider provider = new Provider(NAME, 1.0, "Attachment digest test probe") {};
        provider.put("MessageDigest." + ALGORITHM, AttachmentDigestReadProbe.class.getName());
        if (Security.insertProviderAt(provider, 1) != 1) {
            throw new IllegalStateException("Could not install digest probe");
        }
        BYTES.set(0);
        DIGESTS.set(0);
        return probe;
    }

    long bytes() { return BYTES.get(); }
    long digests() { return DIGESTS.get(); }

    @Override protected void engineUpdate(byte input) {
        delegate.update(input);
        BYTES.incrementAndGet();
    }

    @Override protected void engineUpdate(byte[] input, int offset, int len) {
        delegate.update(input, offset, len);
        BYTES.addAndGet(len);
    }

    @Override protected byte[] engineDigest() {
        byte[] value = delegate.digest();
        DIGESTS.incrementAndGet();
        return value;
    }

    @Override protected void engineReset() { delegate.reset(); }

    @Override public void close() { Security.removeProvider(NAME); }
}
