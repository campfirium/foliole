# Agent Control capability inventory

The [route registry](../scripts/agent-control/foliole-agent-routes.mjs) defines the available API and CLI commands. This inventory records which product actions those commands support and where external tools still need product decisions.

| Object or relationship | Read | Create or initialize | Change or link | Follow-up |
| --- | --- | --- | --- | --- |
| Service and access | Health reports runtime identity. Authenticated clients can verify the token and discover capabilities. | The desktop host serves the current library on loopback. | Write commands use the application’s validation and revision checks. | See the route registry for authentication and command details. |
| Mobile About | Settings shows the installed app version and build on iPhone and Android. | — | — | Mobile installation metadata and public site links stay in the app UI. |
| Search | Material search can return node, PDF, and external matches, with location details when available. | — | — | Page through matching results with an explicit offset. |
| Immersive reading | Desktop paragraph keys move within the open material in Browse and Flow. | — | Paragraph movement stays in the desktop reader. | Agent Control reads material content by ID. |
| PDF reading view | Desktop PDF zoom and sidebar placement are reader controls. Automatic width expansion follows narrower sidebar layout tiers, moving the left sidebar first when those tiers show no preference. | — | PDF reading layout stays in the desktop reader. | Material search already supports PDF locations. |
| Android WebView guidance | Startup help can display before the Android renderer starts. Restricted PDF originals include update instructions. | — | Device component updates are managed through Android and its update channels. | — |
| Trash | Find restorable subtree roots by title, including titles of trashed descendants. | — | Pass the returned ID and revision to `materials/restore`. | Emptying Trash requires confirmation in the desktop app. Permanent deletion is unavailable through Agent Control. Sync Group propagates permanent deletion as a separate fact. Import provenance and historical daily counts remain available to new Sync Group members, including after deletion records are reclaimed. A surviving material whose destination folder was permanently deleted moves to Inbox and remains visible through material lookup. |
| Folder | Read title and hierarchy. Search and list direct children. | Create with a title and parent. | Move, reorder children, trash, and restore. Rename with `materials/update` (`--title` in the CLI) using the revision from `materials/read`. | — |
| Topic | Read title, complete body on request, parent path, and child summaries. Search readable Topics. | Create with body, title, and parent. Optionally import an active reading schedule and priority. | Update body and title. Move, trash, and restore. | Evaluate structured learning data for export. |
| Item | Read the complete question and answer on request, plus identity hints for derived Items. | Create a question-and-answer Item with a parent and optional first review date and priority. | Update question, answer, and title. Move, trash, and restore where supported. | Import existing review history with the first due date for [Discussion #241](https://github.com/campfirium/foliole/discussions/241). |
| Parent and child | Read the parent path and list direct children. List every direct child at the root or under a parent with pagination. | Set a parent when creating a material. | Move a material and reorder a Folder's children. Desktop drag previews show the destination or insertion point and can expand a hovered folder; these UI interactions do not delay or change a move. Desktop Move to searches existing destinations by title or path from the topic list. Mobile Move to offers a collapsible destination tree and global title/path search; these selection interactions keep the existing move rules and mutation contract. | Follow each page and repeat for each parent when exporting a tree. |
| Manual virtual Folder | List Folders and read ordered Topic membership from the Folder. | Create a manual virtual Folder. | Rename, add or remove Topics, reorder, trash, and restore. | Evaluate looking up a Topic's memberships directly. |
| Collection and filter rules | The manual virtual Folder API lists manual Folders. | Review whether external callers need structured access to collections or filter rules. | Review supported operations by virtual Folder type. | Check collection-based and rule-based membership separately from manually curated membership. |
| Dive and source relationships | The desktop bridge has Dive operations. Android and iOS companion can add eligible sources to an existing Dive and convert between Dives and virtual folders from node menus. Agent Control has no Dive routes. | Evaluate creating a Dive and setting its sources. | Evaluate listing, adding, and removing sources. | Confirm external organization and migration scenarios before choosing a contract. |
| Attachments and derived content | Material reads can include a derived material’s source anchor and desktop backlinks. | Create a question-and-answer Item or an anchored excerpt from one Topic text selection. | Review attachment transfer and source-link operations separately. | Confirm round-trip needs for attachments and derived content. |
| Learning settings and state | Opt in on material reads for the current Topic or Item schedule, priority, and learning settings. Review history has no route. | Import an active Topic reading schedule and priority with local permission. Import an Item’s first review date and priority with optional historical grades. | Material update accepts content, title, and answer fields. Editing an existing priority stays in the app, including the Android Flow Topic reading menu. | Determine which learning settings are valid per material type and which actions external tools need after creation. |

The HTTP create request takes an explicit `parent_id`, which can be null. The CLI supplies null when the parent flag is omitted. Material reads default to previews and report truncation. Request `content_mode: "full"` or `--content-mode full` to read complete content and answers with the same response revision. Collection tags can travel in Topic content, while the manual virtual Folder routes expose manual membership.

Open the SuperMemo batch preview for the current library with **Import from SuperMemo** in the desktop command palette, or from **Settings → General → Data migration**. Desktop internal builds also pin the command to the left toolbar by default. The desktop picker loads a selected XML export and checks for companion collection data beside it. Desktop file and folder imports explain source access failures and offer to reopen the system picker. If no readable collection can be matched, the desktop opens a system folder picker before showing a preview. Users can choose a collection or its containing directory, resolve several matching candidates in Foliole, or cancel to preview the XML alone. The Load data page includes export instructions, the last successfully loaded source and its pairing status, and recovery actions. Users can pair a collection after previewing the XML alone. A failed replacement leaves the working draft available. These actions stay in the desktop UI. The migration dialog uses a step sidebar for source loading, structure preview, scheduling, grade mapping, source information, and confirmation. Users can switch steps while keeping their current migration settings. The grade mapping step previews the resulting first review schedule using the draft’s current date blend and can restore the default mappings. Its planned tree and converted-content preview, exception details, scheduling slider, configurable grade mapping, source placement, and in-panel conversion rules stay in the desktop flow. The first review dates step compares SuperMemo and Foliole dates with the planned import dates, including when only one date is available. The desktop remembers the last successfully loaded XML path and migration settings locally for the current library. Opening migration again, including after a restart or completed conversion, reads the export from its original location. The XML itself is not stored by Foliole. Source details can be shown on original Topics or appended to the content of each material, including the question side of cards. New batches go into a top-level SuperMemo folder and preserve the converted hierarchy beneath it. Body, question, and answer conversion preserves paragraphs, lists, and supported tables nested inside exported custom HTML containers. With a paired collection, the desktop flow imports dismissed Topics and Items as dismissed and starts pending Items with no active review history. Foliole keeps the verified source article link. New imports restore a highlight and jump target for an excerpt when the parent text contains a unique selection. Foliole can recover an edited selection when its surviving text identifies both boundaries. For cloze Items, a unique answer or surrounding question text determines the range. SuperMemo extract colors and cloze marks can resolve repeated text when a single marked candidate matches. Materials without a resolved range remain accessible from their parent. Loading the original export for a saved batch lets desktop users preview and confirm directory changes in place. The update can import previously skipped materials when the current rules support them, including a skipped parent with existing children. It preserves the original batch identity and does not restore deleted materials. Existing nodes keep their identities, and manually moved entries keep their current location. The desktop update can relocate a text anchor in the same confirmation as a parent change, including when it also imports the corrected parent, if it can verify the original and destination selections. With the source export loaded, batch updates can also restore missing text anchors on existing materials when the saved import baseline and current source selection agree. Desktop users can also preview and update the placement of previously imported source information, with protection for edited citations and preservation of surrounding text. A saved batch can also update generated body, question, and answer text independently when it can verify the prior conversion and preserve local media and existing selections. A saved batch can also preview and recalculate the first review date using its saved blend when the card still uses its imported schedule. Reviews and manual rescheduling protect the existing schedule. The update preview also offers a recoverable Trash action for explicitly selected, unmodified materials that the current rules now skip. Edited, studied, published, and parent materials remain protected. From a recognized batch, users can compare a newer XML export against saved source evidence, block ambiguous element identities, and add verified new materials to the same batch. After a SuperMemo batch write, the desktop refreshes the prepared Flow queue so eligible imported materials can be studied in the same session. The desktop source information step previews a material from the loaded export and lets users apply a custom Markdown format for citations appended to content. For new imports the desktop structure step shows the original XML hierarchy and uses the matching collection’s sibling order when available. Users can select which Concepts and empty Topics become folders and see when a parent cannot hold an entry. The preview and import share the resolved structure. Agent Control does not expose these SuperMemo batch operations. External migration of individual materials uses the existing Agent Control routes.

The desktop SuperMemo confirmation page summarizes the current draft and conversion exceptions for a new batch. For an existing batch it shows the proposed writes and protects existing materials according to the update preview. Both paths show the native write result after confirmation. The confirmation page is desktop UI only.

Aide history shows material links for desktop conversation navigation. The linked material titles and IDs are included in Aide turn context. A linked material open at send time becomes the active material. Aide reads bodies through existing material permissions. Desktop users can remove manually linked materials from a draft or saved conversation. Future turns use the updated links and retain the conversation’s opening material. Agent Control has no conversation-link routes.

Clicking an unresolved title-based wiki link in the desktop editor creates and opens a Topic in Inbox. This is an editor interaction. Agent Control clients can create the same Topic with its title and the Inbox parent ID.

Mobile find-in-document runs on keyboard submission and uses a non-modal toolbar for stepping through matches while reading. Ending the search clears the current query and highlights. Query focus, match highlights, and step controls are reader UI state. Agent Control continues to expose material search and location details.

Markdown image preview and drag resizing are editor interactions. A saved width is part of the material Markdown returned by a full material read.

Desktop PDF imports index extracted text by page. Material search returns PDF locations from that index. The PDF-backed Topic body is separate and indexing does not write the extracted full text into it.

The desktop file import picker imports every selected file, with a separate post-import reading-mode choice for each EPUB. This OS picker flow stays internal to the desktop app; Agent Control text creation does not expose local file selection.

The desktop search panel remembers its preview line limit, separate font sizes for result titles, previews, and metadata, and whether to show each result's date and time. These are desktop display preferences. Agent Control search returns bounded excerpts independently of the panel's preview line limit.

### Retrying material creation

On a Foliole version that supports create retries, supply `request_id` in the HTTP body or `--request-id` in the CLI. Generate a unique ID for each intended creation and save it before sending. IDs are case-sensitive, 1–128 characters long, and may contain letters A–Z, digits, periods, underscores, colons, and hyphens.

If the response is lost, retry with the same ID and creation parameters against the same local library. HTTP and CLI share the same IDs. Foliole returns HTTP 200 with the original `material.id`, including after restart. The returned material reflects current state, or contains only the original ID if the material has been permanently removed. Reusing an ID with different valid parameters returns HTTP 409 with `request_id_conflict`. Failed creates leave the ID available. Each request still requires the usual authorization and any applicable learning import permission.

Receipts are stored in the local library database and do not sync to other library replicas. Omitting the ID requests a new creation each time.

### Importing a Topic reading schedule

The **Foliole CLI** installation entry is in desktop **Settings → General → External access**. In the same section, enable **Allow learning progress imports** for the current library. The permission defaults to off and stays local. A request with a learning schedule while it is off returns HTTP 403 with `learning_import_disabled`. Ordinary creation uses the existing permission.

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

### Importing an Item with review history

Include `history` in the same `review_schedule` object to create a previously reviewed Item. Each event has a timezone-aware `reviewed_at` and a Foliole `grade` from 1 to 4. Supply 1 to 1,000 events in chronological order. The list order breaks timestamp ties. Events must be in the past or present and no later than `due`.

Foliole replays the grades using the destination's scheduler settings and keeps the supplied due date until the first new grade. Undoing that grade restores the imported date. The Item, history and request receipt commit together. Use the same `request_id` and parameters to retry without creating a second Item. The existing learning import switch must be enabled. External tools map source grades before submitting them.

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

### Image focus in material content

Mobile body editing supports long-pressing a rendered image to copy or cut its Markdown to the system text clipboard, then pasting it with the system text menu in another editable body in the same library. Reference-style image destinations are made self-contained in the clipboard only. Cutting removes only the selected image occurrence after clipboard success, provided the original editing context and content revision remain current; failure or a stale context leaves the source untouched. The edit uses normal body saving and history. This is an editor interaction, not a new Agent Control API or CLI operation. Item answers are outside this image clipboard surface.

Desktop image focus is an editor action for a stored image occurrence. Its saved rectangle can be adjusted or removed in place from its border in the editor. Its rectangle travels with the Markdown in existing full-content reads, updates, and material sync. Focus transparency is a desktop appearance setting for the mask outside the rectangle. Agent Control has no dedicated operation for image focus or its display setting. Preserve the image label and destination when copying or updating focused material.

Desktop image crop also travels with the individual Markdown image occurrence in full-content reads, updates, and material sync. The crop changes the displayed area at the original display width while retaining the original attachment destination and bytes. The editor can reveal the original image in place to adjust or remove a crop. Agent Control has no dedicated crop operation. Preserve the label to keep the crop when editing neighboring content.

Desktop image cloze borders show in-place range handles that updates the existing review item and source projection. Range editing is an editor action. Agent Control has no dedicated image cloze range operation. The desktop image preview uses the editor’s image controls in place for cloze creation and range adjustment, annotation, focus, and crop where the source editor permits them. Saved changes are reflected in the open preview and in the source document. These gestures reuse the existing material operations and have no dedicated Agent Control commands.

### Paging search results

Use `offset: 0` with `materials/search`, or `--offset 0` in the CLI. Pass the returned `next_offset` with the same query and page size until it is null. The maximum page size is 40. Requests without an offset keep the original response. Each page uses the current search results, so restart after changes to the library or search settings.

### Traversing material children

For `materials/list-children`, omit `parent_id` for the workspace root or supply a material ID for its direct children. The CLI takes the same command and uses `--parent-id` for a material. Send `offset: 0` or pass `--offset 0` to start. For each next page, pass the returned `next_offset` with the same parent. Stop when `next_offset` is null, including for an empty or out-of-range page.

The default and maximum page size is 30. Each page reports the current total in `child_count` and whether more rows follow in `children_truncated`. Paginated results order by ascending position (missing positions sort as 999999), ascending SQLite `lower(title)`, descending update time, then ascending material ID. A request without an offset keeps the original bounded response and omits `next_offset`. A negative, fractional, nonnumeric, or unsafe offset returns HTTP 400. An unknown parent returns HTTP 404.

Each request reads the live directory. Inserts, removals, moves, or changes to sort fields between pages can cause rows to be repeated or skipped. For a consistent export, traverse while the library is stable and restart an affected listing at offset zero if it changes.

### Finding a material in the trash

In desktop folders, Dives, and virtual folders, item-column selection after moving the active material to Trash follows the displayed order. Agent Control trash operations have no desktop item-column context and retain their existing material and revision contract.

Use `POST /agent-control/v1/materials/list-trash` or `foliole materials/list-trash --query "Title"`. Omit the query to browse all trash roots. Title matching is case-insensitive and uses substrings. A match on a trashed descendant returns its subtree root once, just as in the desktop trash.

Results are ordered by deletion time, newest first, with ID breaking ties. Each result has `id`, `kind`, `title`, `parent_id`, `deleted_at`, and `updated_at`. Pass the result's `id` and `updated_at` as `id` and `expected_updated_at` to `materials/restore`. Restoring a root can restore its descendants.

The default page size is 30. Set `limit` from 1 to 100 and pass `next_offset` as `offset` (CLI `--offset`) until it is null. Offsets apply to the current trash contents, so a deletion or restore between pages can shift results. The route requires the Agent Control bearer token and the CLI checks for `materials.listTrash` in the session descriptor.

Callers can retain a copy of content they read before making a change. Use Foliole’s library backup when a batch needs a library-wide recovery point.

When changing a product capability:

1. Identify the external use case and record the decision for reading, creation, updates, or relationships in the relevant row. Record a concrete follow-up when delivery is deferred. Database schema changes are evidence for the review.
2. Reuse the product operation that owns validation, persistence, and sync. Keep search indexes, sync bookkeeping, and device-local UI state internal unless a specific public operation needs them.
3. Exercise the real API and CLI where supported. Verify the user-visible result, check existing callers' contracts, and cover restart or an independent sync peer where the operation promises those results.

The companion sync-group setup screen displays safe failure codes and the known device and stage when library reception is incomplete, including reported errors that can be retried. Once reception starts, the setup screen hides discovery and join actions until reception ends. These controls stay in the setup screen. Agent Control exposes no sync-group setup or diagnostic operation.

Desktop Settings → About records application events to files under the desktop instance’s application data directory with the existing redacted diagnostic context. Users can reveal the latest file after stopping. Foliole retains recordings for up to seven days and 64 MiB. The Logs settings page on Android and iPhone captures and exports a short local troubleshooting session. Agent Control exposes no operation to start capture, read the log, or export it. The user initiates capture and chooses where to share the exported file.

Android's Devanagari annotation boundary setting is a device-local touch selection preference in Settings → Diagnostics. The API and CLI continue to take explicit stored Markdown ranges.

After a long press in the Android reader, releasing the finger hands the transient range to Foliole’s drag handles. This interaction stays in the reader. Select paragraph in the mobile reading toolbar expands the transient selection using the desktop reading paragraph boundaries. Agent Control receives explicit source ranges for material operations.

The macOS and Windows preference to quit Foliole when closing its main window is local to the desktop library. It stays in Settings because it controls native window behavior and the availability of background services on that device.

Material History is a desktop navigation surface for the 100 most recently visited materials in the library. The desktop left toolbar, command palette, and shortcut open Material History, which opens materials through the existing navigation flow. Its View options remember the preview line limit, breadcrumb placement, and independent preview and breadcrumb font sizes. History and Search shortcut hints start collapsed and remember each panel’s choice as a desktop UI preference. The Agent Control API and CLI do not expose the visit list, manual pins, most recently edited material, or these display preferences.

Desktop Cut, Undo, and Redo suppress keyboard auto-repeat at the input boundary. Clipboard editing and interactive editing history stay in the desktop editor. Agent Control continues to use explicit material operations.

The desktop command palette searches the settings index and opens the selected category or setting. The same palette shows matching action tips and reveals their text inline. These desktop UI behaviors have no Agent Control API or CLI route.
