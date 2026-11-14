# Agent Control capability inventory

The [route registry](../scripts/agent-control/foliole-agent-routes.mjs) defines the available API and CLI commands. This inventory records which product actions those commands support and where external tools still need product decisions.

| Object or relationship | Read | Create or initialize | Change or link | Follow-up |
| --- | --- | --- | --- | --- |
| Service and access | Health reports runtime identity. Authenticated clients can verify the token and discover capabilities. | The desktop host serves the current library on loopback. | Write commands use the application’s validation and revision checks. | See the route registry for authentication and command details. |
| Mobile About | Settings shows the installed app version and build on iPhone and Android. | — | — | Mobile installation metadata and public site links stay in the app UI. |
| Search | Material search can return node, PDF, and external matches, with location details when available. | — | — | Page through matching results with an explicit offset. |
| PDF reading view | Desktop PDF zoom and sidebar placement are reader controls. | — | PDF reading layout stays in the desktop reader. | Material search already supports PDF locations. |
| Trash | Find restorable subtree roots by title, including titles of trashed descendants. | — | Pass the returned ID and revision to `materials/restore`. | Emptying Trash requires confirmation in the desktop app. Permanent deletion is unavailable through Agent Control. |
| Folder | Read title and hierarchy. Search and list direct children. | Create with a title and parent. | Move, reorder children, trash, and restore. Rename with `materials/update` (`--title` in the CLI) using the revision from `materials/read`. | — |
| Topic | Read title, complete body on request, parent path, and child summaries. Search readable Topics. | Create with body, title, and parent. Optionally import an active reading schedule and priority. | Update body and title. Move, trash, and restore. | Evaluate structured learning data for export. |
| Item | Read the complete question and answer on request, plus identity hints for derived Items. | Create a question-and-answer Item with a parent and optional first review date and priority. | Update question, answer, and title. Move, trash, and restore where supported. | Import existing review history and preserve the first due date alongside it for [Discussion #241](https://github.com/campfirium/foliole/discussions/241). Evaluate structured learning data for export. |
| Parent and child | Read the parent path and list direct children. List every direct child at the root or under a parent with pagination. | Set a parent when creating a material. | Move a material and reorder a Folder's children. | Follow each page and repeat for each parent when exporting a tree. |
| Manual virtual Folder | List Folders and read ordered Topic membership from the Folder. | Create a manual virtual Folder. | Rename, add or remove Topics, reorder, trash, and restore. | Evaluate looking up a Topic's memberships directly. |
| Collection and filter rules | The manual virtual Folder API lists manual Folders. | Review whether external callers need structured access to collections or filter rules. | Review supported operations by virtual Folder type. | Check collection-based and rule-based membership separately from manually curated membership. |
| Dive and source relationships | The desktop bridge has Dive operations. Agent Control has no Dive routes. | Evaluate creating a Dive and setting its sources. | Evaluate listing, adding, and removing sources. | Confirm external organization and migration scenarios before choosing a contract. |
| Attachments and derived content | Material reads can include a derived material’s source anchor and desktop backlinks. | Create a question-and-answer Item or an anchored excerpt from one Topic text selection. | Review attachment transfer and source-link operations separately. | Confirm round-trip needs for attachments and derived content. |
| Learning settings and state | Opt in on material reads for the current Topic or Item schedule, priority, and learning settings. Review history has no route. | Import an active Topic reading schedule and priority with local permission. Import an ungraded Item’s first review date and priority. Historical review imports remain open. | Material update accepts content, title, and answer fields. | Determine which learning settings are valid per material type and which actions external tools need after creation. |

The HTTP create request takes an explicit `parent_id`, which can be null. The CLI supplies null when the parent flag is omitted. Material reads default to previews and report truncation. Request `content_mode: "full"` or `--content-mode full` to read complete content and answers with the same response revision. Collection tags can travel in Topic content, while the manual virtual Folder routes expose manual membership.

SuperMemo batch preview and import use the desktop Import flow for the current library. Its report, scheduling slider, and configurable grade mapping stay in the desktop flow. With a paired collection, the desktop flow imports dismissed Topics and Items as dismissed and starts pending Items with no active review history. Agent Control does not expose these SuperMemo batch operations. External migration of individual materials uses the existing Agent Control routes.

Desktop PDF imports index extracted text by page. Material search returns PDF locations from that index. The PDF-backed Topic body is separate and indexing does not write the extracted full text into it.

### Retrying material creation

On a Foliole version that supports create retries, supply `request_id` in the HTTP body or `--request-id` in the CLI. Generate a unique ID for each intended creation and save it before sending. IDs are case-sensitive, 1–128 characters long, and may contain letters A–Z, digits, periods, underscores, colons, and hyphens.

If the response is lost, retry with the same ID and creation parameters against the same local library. HTTP and CLI share the same IDs. Foliole returns HTTP 200 with the original `material.id`, including after restart. The returned material reflects current state, or contains only the original ID if the material has been permanently removed. Reusing an ID with different valid parameters returns HTTP 409 with `request_id_conflict`. Failed creates leave the ID available. Each request still requires the usual authorization and any applicable learning import permission.

Receipts are stored in the local library database and do not sync to other library replicas. Omitting the ID requests a new creation each time.

### Importing a Topic reading schedule

In desktop **Settings → General → Agent Control**, enable **Allow learning progress imports** for the current library. The permission defaults to off and stays local. A request with a learning schedule while it is off returns HTTP 403 with `learning_import_disabled`. Ordinary creation uses the existing permission.

Send `reading_schedule` on a Topic `materials/create` request. With the CLI, pass the same object as JSON in `--reading-schedule`.

```json
{
  "priority": 3,
  "last_handled_at": "2026-10-01T00:00:00Z",
  "next_at": "2026-11-01T00:00:00Z",
  "interval_duration_ms": 2678400000,
  "interval_growth_factor": 1.5,
  "repetition_count": 4
}
```

Priority is a Foliole integer from 0 to 9. Timestamps require an offset and are stored in UTC, with the next date at or after the last handled date. Interval milliseconds and repetition count are nonnegative safe integers. Growth factor is at least 1. All six fields are required. The Topic and its active schedule are committed together and use Foliole's existing queue and sync. A malformed schedule or a schedule on a Folder or Item returns HTTP 400 when the permission is on. As with ordinary creation, repeating a successful request creates another material.

The mobile Flow progress indicator uses the current learning session. Its display stays in the app UI because it adds no new learning action or stored data.

### Importing an Item first review date

With the same local permission, send `review_schedule` on an Item `materials/create` request. The CLI takes the same JSON through `--review-schedule`.

```json
{
  "due": "2027-02-01T00:00:00Z",
  "priority": 2
}
```

Supply both fields. The date requires a timezone offset and priority is a Foliole integer from 0 to 9. The Item enters the review queue at the imported date as an ungraded card. Its first grade starts native scheduling, and undoing that grade restores the imported date. Use this option for a schedule-only migration or an Item without a usable review history. Ordinary Item creation continues to assign a date through Foliole’s new-card scheduler.

### Reading the current learning schedule

Send `include_learning: true` with the material ID to `materials/read`, or pass `--include-learning true` to the CLI. The existing material read permission applies. The library's learning import switch controls imports independently. The default response omits `learning`.

- Topic: `learning` contains the node priority, shelving date, and `reading_schedule` with the next and last handled times, interval in milliseconds, growth factor, repetition count, reading priority, and reading state.
- Item: `learning` contains the node priority, shelving date, retention and short-term scheduling overrides, initial review due date, and `review_schedule` with the current due date, last review time, FSRS state (0 new, 1 learning, 2 review, 3 relearning), stability, fast stability, difficulty, elapsed and scheduled days, repetitions, and lapses.

A missing schedule is null. A null setting override uses Foliole's normal inheritance rules. Folders return `learning: null`. The response gives current scheduling state for one material. Review events and reading position use separate product data.

### Reading source relationships

Use `include_relations: true` with `materials/read`, or `--include-relations true` in the CLI. The `relations.source` field identifies the original Foliole material and includes the stored anchor kind and locator when available. An anchor marked unmapped has a null locator. The `relations.backlinks` array uses the desktop backlink lookup for wiki links and includes the referring material IDs and context. The existing material read permission applies.

### Creating a text excerpt

Read a Topic with `materials/read` and `content_mode: "full"`. Then send the returned ID and `updated_at` to `POST /agent-control/v1/materials/create-text-excerpt`:

```json
{
  "source_id": "<topic ID>",
  "expected_updated_at": "<updated_at from the read>",
  "from": 0,
  "to": 12
}
```

```sh
foliole materials create-text-excerpt --source-id <id> --expected-updated-at <updated_at> --from 0 --to 12
```

Offsets are zero-based UTF-16 code units into the complete stored Markdown body. `from` is inclusive and `to` is exclusive. The offsets distinguish repeated passages. Foliole trims surrounding whitespace, derives a title, and saves the excerpt as a child Topic with a highlight anchor. The response contains `material.id`. On desktop, open the child and click the source Topic in its breadcrumbs to jump to the original passage. To read the stored anchor, use `materials/read` with `include_relations: true`.

The route uses the existing bearer token and advertises `materials.createTextExcerpt`. A changed revision or trashed source returns 409; a missing source returns 404. Empty or out-of-bounds ranges, split surrogate pairs, ranges crossing or following CR line endings, frontmatter, and image selections return 400. PDF, image and cloze excerpts and attachment transfer are outside this route. Repeating a successful request creates another excerpt.

### Writing long material content

Create and update accept up to 1 MiB of UTF-8 in `content`, matching Foliole's text body budget. Their JSON request limit allows for JSON escaping. To pass a long body through the CLI, pipe UTF-8 text into `materials/create` or `materials/update` with `--content-stdin true`. Supply the usual ID and expected revision for updates. The Item answer limit is still 4,000 UTF-16 code units.

### Paging search results

Use `offset: 0` with `materials/search`, or `--offset 0` in the CLI. Pass the returned `next_offset` with the same query and page size until it is null. The maximum page size is 40. Requests without an offset keep the original response. Each page uses the current search results, so restart after changes to the library or search settings.

### Traversing material children

For `materials/list-children`, omit `parent_id` for the workspace root or supply a material ID for its direct children. The CLI takes the same command and uses `--parent-id` for a material. Send `offset: 0` or pass `--offset 0` to start. For each next page, pass the returned `next_offset` with the same parent. Stop when `next_offset` is null, including for an empty or out-of-range page.

The default and maximum page size is 30. Each page reports the current total in `child_count` and whether more rows follow in `children_truncated`. Paginated results order by ascending position (missing positions sort as 999999), ascending SQLite `lower(title)`, descending update time, then ascending material ID. A request without an offset keeps the original bounded response and omits `next_offset`. A negative, fractional, nonnumeric, or unsafe offset returns HTTP 400. An unknown parent returns HTTP 404.

Each request reads the live directory. Inserts, removals, moves, or changes to sort fields between pages can cause rows to be repeated or skipped. For a consistent export, traverse while the library is stable and restart an affected listing at offset zero if it changes.

### Finding a material in the trash

Use `POST /agent-control/v1/materials/list-trash` or `foliole materials/list-trash --query "Title"`. Omit the query to browse all trash roots. Title matching is case-insensitive and uses substrings. A match on a trashed descendant returns its subtree root once, just as in the desktop trash.

Results are ordered by deletion time, newest first, with ID breaking ties. Each result has `id`, `kind`, `title`, `parent_id`, `deleted_at`, and `updated_at`. Pass the result's `id` and `updated_at` as `id` and `expected_updated_at` to `materials/restore`. Restoring a root can restore its descendants.

The default page size is 30. Set `limit` from 1 to 100 and pass `next_offset` as `offset` (CLI `--offset`) until it is null. Offsets apply to the current trash contents, so a deletion or restore between pages can shift results. The route requires the Agent Control bearer token and the CLI checks for `materials.listTrash` in the session descriptor.

Callers can retain a copy of content they read before making a change. Use Foliole’s library backup when a batch needs a library-wide recovery point.

When changing a product capability:

1. Identify the external use case and record the decision for reading, creation, updates, or relationships in the relevant row. Record a concrete follow-up when delivery is deferred. Database schema changes are evidence for the review.
2. Reuse the product operation that owns validation, persistence, and sync. Keep search indexes, sync bookkeeping, and device-local UI state internal unless a specific public operation needs them.
3. Exercise the real API and CLI where supported. Verify the user-visible result, check existing callers' contracts, and cover restart or an independent sync peer where the operation promises those results.

The companion sync-group setup screen displays safe failure codes and the known device and stage when library reception is incomplete. This diagnostic stays in the setup screen. Agent Control exposes no sync-group setup or diagnostic operation.

The Logs settings page on desktop, Android, and iPhone captures a short local troubleshooting session and exports a user-selected copy. Agent Control exposes no operation to start capture, read the log, or export it. The user initiates capture and chooses where to share the exported file.

Android's Devanagari annotation boundary setting is a device-local touch selection preference in Settings → Diagnostics. The API and CLI continue to take explicit stored Markdown ranges.
