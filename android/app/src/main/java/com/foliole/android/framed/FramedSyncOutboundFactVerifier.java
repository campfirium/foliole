package com.foliole.android.framed;

import com.foliole.sync.v22.BlobReference;
import com.foliole.sync.v22.FactDescriptor;
import com.foliole.sync.v22.FactRecord;
import com.google.protobuf.ByteString;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

final class FramedSyncOutboundFactVerifier {
    private final Map<ByteString, BlobReference> declared = new HashMap<>();
    private final Set<ByteString> seen = new HashSet<>();

    FramedSyncOutboundFactVerifier(List<BlobReference> blobs) {
        for (BlobReference blob : blobs) declared.put(blob.getSha256(), blob);
    }

    void verify(FactRecord fact, FactDescriptor descriptor) throws FramedSyncValidationException {
        if (!fact.getIdentity().equals(descriptor.getIdentity()) ||
            !fact.getSharedStateHash().equals(descriptor.getSharedStateHash())) {
            throw invalid("framed_sync_fact_descriptor_mismatch");
        }
        List<ByteString> required = new ArrayList<>();
        for (BlobReference edge : FramedSyncCanonicalManifest.sortedBlobs(fact.getBlobsList())) {
            if (!edge.equals(declared.get(edge.getSha256()))) {
                throw invalid("framed_sync_blob_descriptor_conflict");
            }
            seen.add(edge.getSha256());
            if (edge.getRequired()) required.add(edge.getSha256());
        }
        if (!new HashSet<>(required).equals(new HashSet<>(descriptor.getRequiredBlobHashesList()))) {
            throw invalid("framed_sync_fact_descriptor_mismatch");
        }
    }

    void finish() throws FramedSyncValidationException {
        if (!seen.equals(declared.keySet())) throw invalid("framed_sync_blob_content_set_mismatch");
    }

    private static FramedSyncValidationException invalid(String code) {
        return new FramedSyncValidationException(code);
    }
}
