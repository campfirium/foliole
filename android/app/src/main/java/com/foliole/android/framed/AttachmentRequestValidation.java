package com.foliole.android.framed;

import com.foliole.sync.v22.RequestAttachment;
import java.util.Set;

final class AttachmentRequestValidation {
    static void validate(RequestAttachment value) throws FramedSyncValidationException {
        FramedSyncValueValidator.fixed(value.getRequestId(), 16, "request_id");
        if (!Set.of("needs", "describe", "pull", "status", "push").contains(value.getOperation()) ||
            !Set.of("", "partial", "complete", "offset", "block", "end").contains(value.getState()) ||
            value.getByteLength() < 0 || value.getByteLength() > 8589934592L ||
            value.getOffset() < 0 || value.getOffset() > 8589934592L ||
            value.getData().size() > 524288 || value.getStorageKeysCount() > 256 ||
            (!value.getStorageKey().isEmpty() && !validKey(value.getStorageKey())) ||
            !value.getStorageKeysList().stream().allMatch(AttachmentRequestValidation::validKey)) {
            throw new FramedSyncValidationException("attachment_request_invalid");
        }
    }
    private static boolean validKey(String key) { return key.matches("[a-f0-9]{64}\\.(png|jpg|gif|webp|pdf|epub)"); }
}
