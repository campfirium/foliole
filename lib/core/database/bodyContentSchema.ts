export const BODY_CONTENT_CHUNK_BYTES = 512 * 1024;

/** A verified empty body has a header and no chunks. An absent header is unavailable. */
export const BODY_CONTENT_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS content_bodies (
    hash TEXT PRIMARY KEY CHECK (length(hash) = 64 AND hash NOT GLOB '*[^0-9a-f]*'),
    byte_length INTEGER NOT NULL CHECK (byte_length >= 0),
    verified INTEGER NOT NULL CHECK (verified IN (0, 1)),
    utf16_length INTEGER CHECK (utf16_length >= 0),
    frontmatter_end INTEGER CHECK (frontmatter_end BETWEEN 0 AND byte_length))`,
  `CREATE TABLE IF NOT EXISTS content_body_chunks (
    hash TEXT NOT NULL REFERENCES content_bodies(hash) ON DELETE CASCADE,
    byte_offset INTEGER NOT NULL CHECK (byte_offset >= 0 AND byte_offset % ${BODY_CONTENT_CHUNK_BYTES} = 0),
    data BLOB NOT NULL CHECK (typeof(data) = 'blob' AND length(data) BETWEEN 1 AND ${BODY_CONTENT_CHUNK_BYTES}),
    PRIMARY KEY (hash, byte_offset))`,
  `CREATE TRIGGER IF NOT EXISTS content_body_chunks_immutable_insert
    BEFORE INSERT ON content_body_chunks WHEN
      (SELECT verified FROM content_bodies WHERE hash = NEW.hash) = 1
    BEGIN SELECT RAISE(ABORT, 'body_content_immutable'); END`,
  `CREATE TRIGGER IF NOT EXISTS content_body_chunks_immutable_update
    BEFORE UPDATE ON content_body_chunks WHEN
      (SELECT verified FROM content_bodies WHERE hash = OLD.hash) = 1 OR
      (SELECT verified FROM content_bodies WHERE hash = NEW.hash) = 1
    BEGIN SELECT RAISE(ABORT, 'body_content_immutable'); END`,
  `CREATE TRIGGER IF NOT EXISTS content_body_chunks_immutable_delete
    BEFORE DELETE ON content_body_chunks WHEN
      (SELECT verified FROM content_bodies WHERE hash = OLD.hash) = 1
    BEGIN SELECT RAISE(ABORT, 'body_content_immutable'); END`,
  `CREATE TRIGGER IF NOT EXISTS content_bodies_immutable_update
    BEFORE UPDATE ON content_bodies WHEN OLD.verified = 1 AND
      (NEW.hash != OLD.hash OR NEW.byte_length != OLD.byte_length OR NEW.verified != 1
        OR NEW.frontmatter_end IS NOT OLD.frontmatter_end OR NEW.utf16_length IS NOT OLD.utf16_length)
    BEGIN SELECT RAISE(ABORT, 'body_content_immutable'); END`
] as const;
