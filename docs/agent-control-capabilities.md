# Agent Control capability inventory

The [route registry](../scripts/agent-control/foliole-agent-routes.mjs) defines the available API and CLI commands. This inventory records which product actions those commands support and where external tools still need product decisions.

| Object or relationship | Read | Create or initialize | Change or link | Follow-up |
| --- | --- | --- | --- | --- |
| Service and access | Health reports runtime identity. Authenticated clients can verify the token and discover capabilities. | The desktop host serves the current library on loopback. | Write commands use the application’s validation and revision checks. | See the route registry for authentication and command details. |
| Search | Material search can return node, PDF, and external matches, with location details when available. | — | — | Check search coverage per source when adding new material types. |
| Folder | Read title and hierarchy. Search and list direct children. | Create with a title and parent. | Move, reorder children, trash, and restore. Rename is accepted by `materials/update`. | Align the command description with supported Folder renaming. |
| Topic | Read title, complete body on request, parent path, and child summaries. Search readable Topics. | Create with body, title, and parent. | Update body and title. Move, trash, and restore. | Create with initial reading progress and priority for [Discussion #241](https://github.com/campfirium/foliole/discussions/241). Evaluate structured learning data for export. |
| Item | Read the complete question and answer on request, plus identity hints for derived Items. | Create a question-and-answer Item with a parent. | Update question, answer, and title. Move, trash, and restore where supported. | Create with initial review progress and priority for #241. Evaluate structured learning data for export. |
| Parent and child | Read the parent path and list direct children. List every direct child at the root or under a parent with pagination. | Set a parent when creating a material. | Move a material and reorder a Folder's children. | Follow each page and repeat for each parent when exporting a tree. |
| Manual virtual Folder | List Folders and read ordered Topic membership from the Folder. | Create a manual virtual Folder. | Rename, add or remove Topics, reorder, trash, and restore. | Evaluate looking up a Topic's memberships directly. |
| Collection and filter rules | The manual virtual Folder API lists manual Folders. | Review whether external callers need structured access to collections or filter rules. | Review supported operations by virtual Folder type. | Check collection-based and rule-based membership separately from manually curated membership. |
| Dive and source relationships | The desktop bridge has Dive operations. Agent Control has no Dive routes. | Evaluate creating a Dive and setting its sources. | Evaluate listing, adding, and removing sources. | Confirm external organization and migration scenarios before choosing a contract. |
| Attachments and derived content | Material reads expose some highlight and cloze identity hints. | The material create route supports question-and-answer Items. | Review attachment transfer and source-link operations separately. | Confirm round-trip needs for attachments and derived content. |
| Learning settings and state | Material reads omit structured priority, reading schedules, review history, desired retention, and shelving. | See Topic and Item for initial progress. | Material update accepts content, title, and answer fields. | Determine which learning settings are valid per material type and which actions external tools need after creation. |

The HTTP create request takes an explicit `parent_id`, which can be null. The CLI supplies null when the parent flag is omitted. Material reads default to previews and report truncation. Request `content_mode: "full"` or `--content-mode full` to read complete content and answers with the same response revision. Collection tags can travel in Topic content, while the manual virtual Folder routes expose manual membership.

### Traversing material children

For `materials/list-children`, omit `parent_id` for the workspace root or supply a material ID for its direct children. The CLI takes the same command and uses `--parent-id` for a material. Send `offset: 0` or pass `--offset 0` to start. For each next page, pass the returned `next_offset` with the same parent. Stop when `next_offset` is null, including for an empty or out-of-range page.

The default and maximum page size is 30. Each page reports the current total in `child_count` and whether more rows follow in `children_truncated`. Paginated results order by ascending position (missing positions sort as 999999), ascending SQLite `lower(title)`, descending update time, then ascending material ID. A request without an offset keeps the original bounded response and omits `next_offset`. A negative, fractional, nonnumeric, or unsafe offset returns HTTP 400. An unknown parent returns HTTP 404.

Each request reads the live directory. Inserts, removals, moves, or changes to sort fields between pages can cause rows to be repeated or skipped. For a consistent export, traverse while the library is stable and restart an affected listing at offset zero if it changes.

Callers can retain a copy of content they read before making a change. Use Foliole’s library backup when a batch needs a library-wide recovery point.

When changing a product capability:

1. Identify the external use case and record the decision for reading, creation, updates, or relationships in the relevant row. Record a concrete follow-up when delivery is deferred. Database schema changes are evidence for the review.
2. Reuse the product operation that owns validation, persistence, and sync. Keep search indexes, sync bookkeeping, and device-local UI state internal unless a specific public operation needs them.
3. Exercise the real API and CLI where supported. Verify the user-visible result, check existing callers' contracts, and cover restart or an independent sync peer where the operation promises those results.
