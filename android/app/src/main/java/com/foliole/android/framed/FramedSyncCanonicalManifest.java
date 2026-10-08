package com.foliole.android.framed;

import com.foliole.sync.v22.BlobReference;
import com.foliole.sync.v22.CanonicalField;
import com.foliole.sync.v22.CanonicalObject;
import com.foliole.sync.v22.CanonicalValue;
import com.foliole.sync.v22.FactRecord;
import com.foliole.sync.v22.FactIdentity;
import com.google.protobuf.ByteString;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

final class FramedSyncCanonicalManifest {
    private static final byte[] DOMAIN =
        "foliole-framed-sync-content-v1".getBytes(StandardCharsets.UTF_8);

    private FramedSyncCanonicalManifest() {}

    interface FactSource {
        FactRecord read(int index) throws FramedSyncValidationException;
    }

    static byte[] contentId(List<FactRecord> facts, List<BlobReference> blobs)
        throws FramedSyncValidationException {
        List<FactRecord> sortedFacts = sortedFacts(facts);
        return contentId(sortedFacts.size(), blobs, sortedFacts::get);
    }

    static byte[] contentId(int factCount, List<BlobReference> blobs, FactSource source)
        throws FramedSyncValidationException {
        Writer writer = new Writer();
        writer.data(DOMAIN);
        writer.u32(factCount);
        FactIdentity previous = null;
        for (int index = 0; index < factCount; index++) {
            FactRecord fact = source.read(index);
            if (previous != null && compareIdentities(fact.getIdentity(), previous) < 0) {
                throw invalid("canonical_fact_source_order_invalid");
            }
            writeFact(writer, fact);
            writer.assertBudget();
            previous = fact.getIdentity();
        }
        List<BlobReference> sortedBlobs = sortedBlobs(blobs);
        writer.u32(sortedBlobs.size());
        for (BlobReference blob : sortedBlobs) writeBlob(writer, blob);
        writer.assertBudget();
        return writer.digest();
    }

    static byte[] transferId(FramedSyncTransferContext context, byte[] contentId)
        throws FramedSyncValidationException {
        if (contentId == null || contentId.length != FramedSyncContract.DIGEST_BYTES) {
            throw invalid("content_id_invalid");
        }
        Writer writer = new Writer();
        writer.string("foliole-framed-sync-transfer-v1");
        writer.u32(FramedSyncContract.PROTOCOL_VERSION);
        writer.string(context.groupId());
        writer.string(context.senderDeviceId());
        writer.string(context.senderLibraryEpoch());
        writer.string(context.receiverDeviceId());
        writer.string(context.receiverLibraryEpoch());
        writer.data(contentId);
        return writer.digest();
    }

    private static void writeFact(Writer writer, FactRecord fact)
        throws FramedSyncValidationException {
        var identity = fact.getIdentity();
        writer.u32(identity.getKindValue());
        writer.string(identity.getObjectType());
        writer.string(identity.getGlobalId());
        writer.string(identity.getFactId());
        writer.data(fact.getSharedStateHash().toByteArray());
        writeObject(writer, fact.getBody(), 0);
        List<BlobReference> blobs = sortedBlobs(fact.getBlobsList());
        writer.u32(blobs.size());
        for (BlobReference blob : blobs) writeBlob(writer, blob);
    }

    private static void writeBlob(Writer writer, BlobReference blob) throws FramedSyncValidationException {
        FramedSyncValueValidator.blob(blob);
        writer.data(blob.getSha256().toByteArray());
        writer.u64(blob.getByteLength());
        writer.u32(blob.getRoleValue());
        writer.byteValue(blob.getRequired() ? 1 : 0);
    }

    private static void writeObject(Writer writer, CanonicalObject object, int depth)
        throws FramedSyncValidationException {
        if (depth > FramedSyncContract.MAX_CANONICAL_DEPTH) throw invalid("canonical_depth_limit_exceeded");
        List<CanonicalField> fields = new ArrayList<>(object.getFieldsList());
        fields.sort((left, right) -> compareText(left.getName(), right.getName()));
        writer.countNodes(fields.size());
        writer.u32(fields.size());
        for (CanonicalField field : fields) {
            writer.string(field.getName());
            writeValue(writer, field.getValue(), depth + 1);
        }
    }

    private static void writeValue(Writer writer, CanonicalValue value, int depth)
        throws FramedSyncValidationException {
        if (depth > FramedSyncContract.MAX_CANONICAL_DEPTH) throw invalid("canonical_depth_limit_exceeded");
        switch (value.getValueCase()) {
            case NULL_VALUE:
                writer.byteValue(0);
                break;
            case BOOL_VALUE:
                writer.byteValue(value.getBoolValue() ? 2 : 1);
                break;
            case SIGNED_VALUE:
                writer.byteValue(3);
                writer.u64(value.getSignedValue());
                break;
            case UNSIGNED_VALUE:
                writer.byteValue(4);
                writer.u64(value.getUnsignedValue());
                break;
            case STRING_VALUE:
                writer.byteValue(5);
                writer.string(value.getStringValue());
                break;
            case BYTES_VALUE:
                writer.byteValue(6);
                writer.data(value.getBytesValue().toByteArray());
                break;
            case LIST_VALUE:
                writer.byteValue(7);
                writer.u32(value.getListValue().getValuesCount());
                for (CanonicalValue child : value.getListValue().getValuesList()) {
                    writeValue(writer, child, depth + 1);
                }
                break;
            case OBJECT_VALUE:
                writer.byteValue(8);
                writeObject(writer, value.getObjectValue(), depth + 1);
                break;
            case VALUE_NOT_SET:
                throw invalid("canonical_value_case_invalid");
        }
    }

    static List<FactRecord> sortedFacts(List<FactRecord> values) {
        List<FactRecord> result = new ArrayList<>(values);
        result.sort(FramedSyncCanonicalManifest::compareFacts);
        return result;
    }

    static List<BlobReference> sortedBlobs(List<BlobReference> values) {
        List<BlobReference> result = new ArrayList<>(values);
        result.sort((left, right) -> compareBytes(left.getSha256(), right.getSha256()));
        return result;
    }

    private static int compareFacts(FactRecord left, FactRecord right) {
        return compareIdentities(left.getIdentity(), right.getIdentity());
    }

    static int compareIdentities(FactIdentity left, FactIdentity right) {
        int kind = Integer.compare(left.getKindValue(), right.getKindValue());
        if (kind != 0) return kind;
        int object = compareText(left.getObjectType(), right.getObjectType());
        if (object != 0) return object;
        int global = compareText(left.getGlobalId(), right.getGlobalId());
        return global != 0 ? global : compareText(
            left.getFactId(), right.getFactId());
    }

    private static int compareText(String left, String right) {
        return compareBytes(ByteString.copyFromUtf8(left), ByteString.copyFromUtf8(right));
    }

    private static int compareBytes(ByteString left, ByteString right) {
        int size = Math.min(left.size(), right.size());
        for (int index = 0; index < size; index++) {
            int difference = Byte.toUnsignedInt(left.byteAt(index)) - Byte.toUnsignedInt(right.byteAt(index));
            if (difference != 0) return difference;
        }
        return Integer.compare(left.size(), right.size());
    }

    private static FramedSyncValidationException invalid(String code) {
        return new FramedSyncValidationException(code);
    }

    private static final class Writer {
        private final MessageDigest hash;
        private long byteCount;
        private int nodeCount;

        Writer() {
            try { hash = MessageDigest.getInstance("SHA-256"); }
            catch (java.security.NoSuchAlgorithmException error) { throw new IllegalStateException(error); }
        }

        void byteValue(int value) { byteCount++; hash.update((byte) value); }
        void data(byte[] value) { u32(value.length); byteCount += value.length; hash.update(value); }
        void string(String value) { data(value.getBytes(StandardCharsets.UTF_8)); }
        void u32(long value) {
            for (int shift = 24; shift >= 0; shift -= 8) byteValue((int) (value >>> shift));
        }
        void u64(long value) {
            for (int shift = 56; shift >= 0; shift -= 8) byteValue((int) (value >>> shift));
        }
        void countNodes(int count) throws FramedSyncValidationException {
            nodeCount += count;
            if (nodeCount > FramedSyncContract.MAX_CANONICAL_FIELDS) {
                throw invalid("canonical_node_limit_exceeded");
            }
        }
        byte[] digest() { return hash.digest(); }
        void assertBudget() throws FramedSyncValidationException {
            if (byteCount > FramedSyncContract.MAX_CANONICAL_MANIFEST_BYTES) {
                throw invalid("canonical_manifest_limit_exceeded");
            }
        }
    }
}
