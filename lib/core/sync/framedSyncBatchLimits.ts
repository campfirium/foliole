/** Message bytes include each original preamble; frame headers and AEAD tags have separate wire limits. */
export const FRAMED_SYNC_BATCH_LIMITS = Object.freeze({
  targetMessageBytes: 1_048_576,
  maxMessageBytes: 2_097_152,
  maxItems: 128
});
