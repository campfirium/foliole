// Synthetic acceptance facts, independent of the retired transfer format.
export const hostedLegalVersion = {
  "version_id": "ver_00000000-0000-4000-8000-000000000145",
  "object_id": "ios-acceptance-restore",
  "parent_version_id": null,
  "host_name": "acceptance-desktop",
  "created_at": "2026-07-21T00:00:20.000Z",
  "content_hash": "a1b42f78e5f0e1647ddeb0a537ae3b0a815dd55cacda702e9ebef1861b344cfa",
  "body_text": "Restore body",
  "snapshot_json": "{\"anchor_link\":null,\"anchor_resolution_status\":null,\"anchor_source_version_id\":null,\"attachments\":[],\"body_blob_hash\":null,\"content\":\"\",\"created_at\":\"2026-07-21T00:00:10.000Z\",\"deleted_at\":\"2026-07-21T00:00:20.000Z\",\"desired_retention\":null,\"enable_short_term\":null,\"sequential_reading_enabled\":null,\"shelved_at\":null,\"manual_child_order\":null,\"hide_title_heading\":false,\"id\":\"ios-acceptance-restore\",\"image_regions\":null,\"import_content_fingerprint\":null,\"import_source_fingerprint\":null,\"is_title_manual\":false,\"kind\":\"topic\",\"opening_text\":null,\"parent_id\":\"special-inbox\",\"position\":null,\"priority\":null,\"reveal\":null,\"title\":\"Trashed acceptance\",\"updated_at\":\"2026-07-21T00:00:20.000Z\",\"virtual_filter\":null}"
};

export const hostedContentBodies = {
  "corrupt": {
    "hash": "735d30939443a8e72aa998f02158d5f129699e2cbc256f04783051c5a968eaad",
    "text": "# Corrupt\n\nexpected corrupt body"
  },
  "external": {
    "hash": "7a15f00ae8a4c95c369dd8fd818cd8b66d3d1043174e6a14cbeee7563fe30354",
    "text": "# External\n\nexternal-orchid-token"
  },
  "missing": {
    "hash": "5ecec9720eb17b7de6e03457570eb522d93aa8c20875b9f8a8586c7b364ccecf",
    "text": "# Missing\n\nexpected missing body"
  },
  "topic": {
    "hash": "1e8566844713447350f719baccd55d34bdfce4f00bf32bf4bd903e9480d25754",
    "text": "# Topic\n\ntopic-amber-token"
  }
};

export const hostedAttachments = {
  "corrupt": {
    "hash": "5703850972e2da20d5cd065cbb73c20c5d18778148a664b1238ce99120b1d301",
    "bytes": 22,
    "mimeType": "image/png",
    "base64": "ZXhwZWN0ZWQtY29ycnVwdC1pbWFnZQ=="
  },
  "failed": {
    "hash": "e4bd1f4f95e08bac38c59af1b1ef34aeb05e77d1e54492c14c12b1ac570e2318",
    "bytes": 21,
    "mimeType": "image/png",
    "base64": "ZXhwZWN0ZWQtZmFpbGVkLWltYWdl"
  },
  "missing": {
    "hash": "654aa8b756a2aa8b8acc8db2d4cee7746dd98a07ca7f2f2d5f19c1777bc37e2d",
    "bytes": 22,
    "mimeType": "image/png",
    "base64": "ZXhwZWN0ZWQtbWlzc2luZy1pbWFnZQ=="
  },
  "valid": {
    "hash": "7febd27ca8a54d7ceba45645ce394b49bc41d926ac176265d04996b7e9da8d2d",
    "bytes": 31,
    "mimeType": "application/pdf",
    "base64": "JVBERi0xLjQKcGRmLWNvYmFsdC10b2tlbgolJUVPRg=="
  }
};

export const hostedExternalDocument = {
  "document_id": "ios-external:orchid.md",
  "folder_id": "ios-external",
  "relative_path": "orchid.md",
  "file_name": "orchid.md",
  "extension": "md",
  "source_size_bytes": 64,
  "source_modified_at": "2026-07-21T00:00:00.000Z",
  "source_modified_ms": 1,
  "content_hash": "external-content-hash",
  "title": "External Orchid",
  "opening_text": "External opening",
  "body_blob_hash": "7a15f00ae8a4c95c369dd8fd818cd8b66d3d1043174e6a14cbeee7563fe30354",
  "content": "",
  "reference_kind": "local_path",
  "reference_json": null,
  "indexed_at": "2026-07-21T00:00:00.000Z",
  "is_present": 1,
  "missing_at": null,
  "created_at": "2026-07-21T00:00:00.000Z",
  "updated_at": "2026-07-21T00:00:00.000Z"
};
