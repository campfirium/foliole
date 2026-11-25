# Agent Control capability inventory

The [route registry](../scripts/agent-control/foliole-agent-routes.mjs) defines the available API and CLI commands. This inventory records which product actions those commands support and where external tools still need product decisions.

| Object or relationship | Read | Create or initialize | Change or link | Follow-up |
| --- | --- | --- | --- | --- |
| Service and access | Health reports runtime identity. Authenticated clients can verify the token and discover capabilities. | The desktop host serves the current library on loopback. `foliole open` starts the desktop app the CLI was installed with when it is not running, then waits for Agent Control. | Write commands use the application’s validation and revision checks. | See the route registry for authentication and command details. |
| App build identification | Desktop Settings and mobile About show the source revision suffix for development and Preview builds. Mobile About also shows the installed build number. | — | — | The suffix stays in the app UI. Update checks and release metadata use the app version. |
| Search | Material search can return node, PDF, and external matches, with location details when available. | — | — | Page through matching results with an explicit offset. |
| Immersive reading | Desktop paragraph keys move within the open material in Browse and Flow. | — | Paragraph movement stays in the desktop reader. | Agent Control reads material content by ID. |
| PDF reading view | Desktop PDF zoom and sidebar placement are reader controls. Automatic width expansion follows narrower sidebar layout tiers, moving the left sidebar first when those tiers show no preference. | — | PDF reading layout stays in the desktop reader. | Material search already supports PDF locations. |
| Library backup and restore | Android and iOS Settings → Backup shows the backup folder and state. Restoring from a backup first reads the chosen backup folder or a zip of it, then shows its entries and attachments without replacing anything. | — | Choosing and replacing a library stays a device-local Settings action; the restored library keeps this device's identity and starts outside any sync group. | Agent Control has no backup or restore routes. A library-wide replacement needs the user at the device. |
| Android WebView guidance | If the Android renderer fails to start, a fallback page states the required Android System WebView version or the startup error. Restricted PDF originals include update instructions. | — | Device component updates are managed through Android and its update channels. | — |
| Trash | Find restorable subtree roots by title, including titles of trashed descendants. | — | Pass the returned ID and revision to `materials/restore`. | Emptying Trash requires confirmation in the desktop app. Permanent deletion is unavailable through Agent Control. Sync Group propagates permanent deletion as a separate fact. Import provenance and historical daily counts remain available to new Sync Group members, including after deletion records are reclaimed. A surviving material whose destination folder was permanently deleted moves to Inbox and remains visible through material lookup. |
| Folder | Read title and hierarchy. Search and list direct children. | Create with a title and parent. | Move, reorder children, trash, and restore. Rename with `materials/update` (`--title` in the CLI) using the revision from `materials/read`. | The desktop navigation count includes all descendant Topics, Excerpts, and Items in a physical folder. Agent Control lists direct children. |
| Topic | Read title, complete body on request, parent path, and child summaries. Search readable Topics. | Create with body, title, and parent. Optionally import an active reading schedule and priority. | Update body and title. Move, trash, and restore. | Evaluate structured learning data for export. |
| Item | Read the complete question and answer on request, plus identity hints for derived Items. | Create a question-and-answer Item with a parent and optional first review date and priority. | Update question, answer, and title. Move, trash, and restore where supported. | Import existing review history with the first due date for [Discussion #241](https://github.com/campfirium/foliole/discussions/241). |
| Parent and child | Read the parent path and list direct children. List every direct child at the root or under a parent with pagination. | Set a parent when creating a material. | Move a material and reorder a Folder's children. Desktop drag previews show the destination or insertion point and can expand a hovered folder; these UI interactions do not delay or change a move. Desktop Move to searches existing destinations by title or path from the topic list. Mobile Move to offers a collapsible destination tree and global title/path search; these selection interactions keep the existing move rules and mutation contract. | Follow each page and repeat for each parent when exporting a tree. |
| Manual virtual Folder | List Folders and read ordered Topic membership from the Folder. | Create a manual virtual Folder. Android and iOS companion offer direct creation from Directory → More → New. | Rename, add or remove Topics, reorder, trash, and restore. On mobile, use the index row menu to add or remove a direct Topic or ordinary Folder source, rename, or move the index to Trash. Restore it from its Trash row. Source materials and remaining memberships stay in the library. | Evaluate looking up a Topic's memberships directly. |
| Collection and filter rules | The manual virtual Folder API lists manual Folders. | Review whether external callers need structured access to collections or filter rules. | Review supported operations by virtual Folder type. On Android and iOS, Search saves the current keyword as a saved-search index under Virtual. Its index row menu renames it or moves it to Trash, and its Trash row restores it. Matching materials stay where they are. | Check collection-based and rule-based membership separately from manually curated membership. |
| Dive and source relationships | The desktop bridge has Dive operations. Agent Control has no Dive routes. | Android and iOS companion can create a Dive from Directory → More → New, with an optional initial source from the searchable library tree. | Companion can add or remove direct sources, including batch removal from the Dive list, convert between Dives and virtual folders, and move a Dive to Trash or restore it. These actions preserve the original source materials. | Confirm external organization and migration scenarios before choosing an Agent Control contract. |
| Attachments and derived content | Material reads can include a derived material’s source anchor and desktop backlinks. | Create a question-and-answer Item or an anchored excerpt from one Topic text selection. | Review attachment transfer and source-link operations separately. | Confirm round-trip needs for attachments and derived content. |
| Learning settings and state | Opt in on material reads for priority and current Topic or Item learning settings. Review history has no route. | Import an active Topic reading schedule and priority with local permission. Import an Item’s first review date and priority with optional historical grades. | `materials/update` sets the priority of a Topic, Item, or ordinary Folder with local permission. The Android Flow Topic reading menu also edits priority. | Editing an existing reading or review schedule via Agent Control needs a separate contract for preserving learning history. Retention and short-term scheduling are configured in the app. |

On Android and iOS, start Dive Flow by touching and holding its directory row or from the top-right Dive menu. The Dive menu also opens the local reminder form. Convert or trash the Dive from its directory row menu. Browse sorting applies to lists that consume the Browse preference and stays out of the Dive menu. These actions stay in the app UI.

An empty ordinary Folder in the companion offers the existing child creation form for a Topic or Folder. In Trash, hold an ordinary Folder row to restore it with its eligible contents. List selection counts only entries with a checkbox. These mobile entry points use the existing creation and Trash data contracts. Agent Control continues to operate on explicit material IDs.

The HTTP create request takes an explicit `parent_id`, which can be null. The CLI supplies null when the parent flag is omitted. Material reads default to previews and report truncation. Request `content_mode: "full"` or `--content-mode full` to read complete content and answers with the same response revision. Collection tags can travel in Topic content, while the manual virtual Folder routes expose manual membership.

Open the SuperMemo batch preview for the current library with **Import from SuperMemo** in the desktop command palette, or from **Settings → General → Data migration**. Desktop internal builds also pin the command to the left toolbar by default. The desktop picker loads a selected XML export and checks for companion collection data beside it. Review history with hours beyond midnight is imported using the resulting calendar timestamps. Foliole retains the original learning dates and hours in the batch, and uses source learning dates for the original schedule. Desktop file and folder imports explain source access failures and offer to reopen the system picker. If no readable collection can be matched, the desktop opens a system folder picker before showing a preview. Users can choose a collection or its containing directory, resolve several matching candidates in Foliole, or cancel to preview the XML alone. The Load data page includes export instructions, the last successfully loaded source and its pairing status, and recovery actions. Migration notices display shareable error codes, including an explicit unknown-failure code when no specific code is available. The raw exception stays out of the notice. Users can pair a collection after previewing the XML alone or replace a paired folder from Load data. A canceled or mismatched replacement keeps the working source and draft settings. A failed replacement leaves the working draft available. These actions stay in the desktop UI. The migration dialog uses a step sidebar for source loading, structure preview, scheduling, priority mapping, and combined import settings, with the same five steps for a new or previously imported batch. Users can switch steps while keeping their current migration settings. The final settings page for a new batch combines grade mapping, editable Meta field names and a fixed reference example with expandable Meta. Grade mapping can be reset independently. Reference field names are saved with the migration, and conversion uses the chosen names and the original reference values. Its planned tree and converted-content preview, exception details, scheduling slider, configurable grade and reference mapping, and in-panel conversion rules stay in the desktop flow. The first review dates step compares the SuperMemo and planned first review dates for the same Items in a future-only chart grouped by Monday–Sunday calendar week with a linear count scale. Counts due on or before the import preview day appear separately. The timeline initially shows about a year and scrolls horizontally to cover the full projected date range. The chart uses the original schedule for Items where import retains that schedule. The chart and weight slider stay in the desktop migration UI. The Priority mapping step uses the paired SuperMemo priority queue to map the original percentages to Foliole P0–P9. The editable integer boundaries are restored with the source draft. An exact boundary goes to the tier on its right, and 100% goes to P9. Import uses the chosen mapping for new materials, including additions to an existing batch. Existing batches can preview and apply priority changes to materials whose current priority matches the last imported or applied priority. Materials with a different priority keep their current value. The mapping stays in the desktop migration UI. The desktop remembers the last successfully loaded XML path and migration settings locally for the current library. Reopening migration restores the selected sources, settings, and latest conversion summary from local panel state and prepares the saved draft in the background. The saved batch can apply a new first review weight from the same scheduling page when its source is available. The load page shows the full paths of the selected XML and matched collection, with controls to change either source. Export instructions are shown before a source is loaded. Foliole saves the current migration view and its options in one local JSON file for the library. Reopening restores those pages from JSON and checks the selected sources in the background. A changed source prompts the user to reload. Missing files leave the saved view available, and confirmation explains which required source is unavailable. Confirmation checks the current sources again before conversion. Material bodies are excluded from the panel JSON, and companion resources are resolved from the selected collection directory. New desktop imports write mapped source details to the original Topic’s Meta. Extracts and cards omit matching source fields and append different fields to their body or question. The article number remains available for source relationships. Topic titles use the entry title, a leading document heading, or the reference title before falling back to body text. Existing batches retain their saved field names and can update citations and text after confirmation. Batch updates correct generated Topic titles internally when the current title matches the saved import. Update applies title corrections before opening the review of other changes. A batch with only these rule corrections finishes directly from Update. New batches go into a top-level SuperMemo folder and preserve the converted hierarchy beneath it. Body, question, and answer conversion preserves paragraphs, lists, and supported tables nested inside exported custom HTML containers. With a paired collection, the desktop flow imports dismissed Topics and Items as dismissed and starts pending Items with no active review history. Foliole keeps the verified source article link. New imports restore a highlight and jump target for an excerpt when the parent text contains a unique selection. Foliole can recover an edited selection when its surviving text identifies both boundaries. For cloze Items, a unique answer or surrounding question text determines the range. SuperMemo extract colors and cloze marks can resolve repeated text when a single marked candidate matches. Materials without a resolved range remain accessible from their parent. Loading the original export for a saved batch lets desktop users preview and confirm directory changes in place. The update can import previously skipped materials when the current rules support them, including a skipped parent with existing children. It preserves the original batch identity and does not restore deleted materials. Existing nodes keep their identities, and manually moved entries keep their current location. The desktop update can relocate a text anchor in the same confirmation as a parent change, including when it also imports the corrected parent, if it can verify the original and destination selections. With the source export loaded, batch updates can also restore missing text anchors on existing materials when the saved import baseline and current source selection agree. Desktop users can also preview and update the placement of previously imported source information, with protection for edited citations and preservation of surrounding text. A saved batch can also update generated body, question, and answer text independently when it can verify the prior conversion and preserve local media and existing selections. A saved batch can also preview and recalculate the first review date using the selected blend when the card still uses its imported schedule. Reviews and manual rescheduling protect the existing schedule. The update preview also offers a recoverable Trash action for explicitly selected, unmodified materials that the current rules now skip. Edited, studied, published, and parent materials remain protected. From a recognized batch, users can compare a newer XML export against saved source evidence, block ambiguous element identities, and add verified new materials to the same batch. After a SuperMemo batch write, the desktop refreshes the prepared Flow queue so eligible imported materials can be studied in the same session. The desktop structure step shows the source hierarchy and descendant counts for new and existing batches. Reopening a saved migration restores its state immediately and prepares original entry content in the background for structure previews. It uses the matching collection’s titles and sibling order when available and identifies XML-only previews. The structure page offers a filter for possible folders at any depth. It selects these Topics as folders by default and preserves the user’s changes to individual switches. Users can also adjust whether a Concept becomes a folder and see when a parent cannot hold an entry. The preview and import share the resolved structure. Agent Control does not expose these SuperMemo batch operations. External migration of individual materials uses the existing Agent Control routes.

New SuperMemo batches start conversion from the final settings step, Import settings. For an existing batch, Update opens a review dialog for proposed changes and explicit Trash selections. The five migration settings pages remain available after import. Deletion records in the sidebar show materials in Trash and permanently deleted materials from that batch. Update XML loads a newer export for the current batch, and Change Folder handles its paired collection. Saved folder classifications stay locked. New imports show progress on the Import button and open Import complete, once the write succeeds. This page explains which changes future migration updates preserve and links back to Import settings. The completed batch can return to this page from the sidebar. Import failures appear in a dialog and leave the draft available. Existing batch updates show their native write result in a compact dialog. These steps stay in the desktop UI.

Each desktop library keeps one migration JSON with a record for each selected XML path. Update XML reloads the active file in place and retains its migration record. Change XML restores a saved record for a known path or adds a record once a new path loads successfully. Inactive records retain their settings, batch mapping, and deletion records. Opening Deletion records refreshes the local migration JSON from the saved source mapping and the library’s deletion state. Reapplying the batch skips materials in Trash or permanently deleted. Restoring a material from Trash continues to use its original node. This page stays in the desktop UI.

Aide history shows material links for desktop conversation navigation. The linked material titles and IDs are included in Aide turn context. A linked material open at send time becomes the active material. Aide reads bodies through existing material permissions. Desktop users can remove manually linked materials from a draft or saved conversation. Future turns use the updated links and retain the conversation’s opening material. Agent Control has no conversation-link routes.

Desktop Aide settings provide individual controls for permissions and attached content. The Attached content section heading offers a reset for that section. These preferences stay on the device and are managed in the app.

New conversation opens an empty Aide composer on desktop. The conversation is created when the first message is sent. This composer action stays in the desktop UI.

Clicking an unresolved title-based wiki link in the desktop editor creates and opens a Topic in Inbox. This is an editor interaction. Agent Control clients can create the same Topic with its title and the Inbox parent ID.

Mobile find-in-document runs on keyboard submission and uses a non-modal toolbar for stepping through matches while reading. Ending the search clears the current query and highlights. Query focus, match highlights, and step controls are reader UI state. Agent Control continues to expose material search and location details.

Markdown image preview and drag resizing are editor interactions. A saved width is part of the material Markdown returned by a full material read.

Invalid Mermaid diagrams display their original code in the note or diagram preview. This fallback is local to the editor UI. Agent Control continues to read and write the original Markdown.

Desktop PDF imports index extracted text by page. Material search returns PDF locations from that index. The PDF-backed Topic body is separate and indexing does not write the extracted full text into it.

The desktop file import picker imports every selected file, with a separate post-import reading-mode choice for each EPUB. This OS picker flow stays internal to the desktop app; Agent Control text creation does not expose local file selection.

The desktop left toolbar includes a customizable **Open File** action. It uses the existing local-file picker and opens the selected document for editing in place. The Agent Control API and CLI do not expose the picker or external-file editing.

The desktop search panel remembers its preview line limit, separate font sizes for result titles, previews, and metadata, and whether to show each result's date and time. These are desktop display preferences. Agent Control search returns bounded excerpts independently of the panel's preview line limit.

### Retrying material creation

On a Foliole version that supports create retries, supply `request_id` in the HTTP body or `--request-id` in the CLI. Generate a unique ID for each intended creation and save it before sending. IDs are case-sensitive, 1–128 characters long, and may contain letters A–Z, digits, periods, underscores, colons, and hyphens.

If the response is lost, retry with the same ID and creation parameters against the same local library. HTTP and CLI share the same IDs. Foliole returns HTTP 200 with the original `material.id`, including after restart. The returned material reflects current state, or contains only the original ID if the material has been permanently removed. Reusing an ID with different valid parameters returns HTTP 409 with `request_id_conflict`. Failed creates leave the ID available. Each request still requires the usual authorization and any applicable learning import permission.

Receipts are stored in the local library database and do not sync to other library replicas. Omitting the ID requests a new creation each time.

### Starting the desktop app from the CLI

Agent Control runs inside the desktop app. Run `foliole open` before other commands when the app may be closed. It returns `{"status":"running"}` when Agent Control already answers, or starts the app installed with this CLI and returns `{"status":"started"}` once Agent Control is ready. It fails with `launch_timeout` after 60 seconds, for example when the app waits for first-run library setup. On Windows, run it from the signed-in desktop session: a process in a non-interactive session such as SSH cannot show a window and would block a later desktop launch, so the command returns `interactive_session_required`. A CLI run from source returns `launch_unavailable`. The Microsoft Store edition will need its own launch target and CLI alias; this command does not cover it yet.

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
- Ordinary Folder: `learning` contains its explicit `priority`. Descendants without their own priority can inherit this setting. A folder can enforce its priority from Review Options. The nearest enforcing folder supplies descendants' effective priority and preserves their stored values.

A missing schedule is null. A null setting override uses Foliole's normal inheritance rules. System and virtual Folders return `learning: null`. The response gives current scheduling state for one material. Review events and reading position use separate product data.

### Updating an existing material priority

Enable **Allow learning progress imports** for the current library, then send integer `priority` (0–9) with `id` and `expected_updated_at` to `materials/update`. Take the revision from `materials/read`. The CLI takes the same value through `--priority`. Send `priority: null` or `--priority inherit` to clear a material's explicit priority and restore inheritance.

```sh
foliole materials/update --id <id> --expected-updated-at <updated_at> --priority 2
```

This sets the material-level priority for a Topic (including an excerpt), Item, or ordinary Folder. Foliole applies its normal queue ordering and priority inheritance. Setting a Folder's priority affects descendants that inherit from it. Reading and review schedules and history are preserved. To update explicit priorities across a list of materials, send one update per ID. A stale revision returns HTTP 409. When learning imports are disabled, a valid priority update returns HTTP 403 with `learning_import_disabled`, including when combined with a text edit.

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

Offsets are zero-based UTF-16 code units into the complete stored Markdown body. `from` is inclusive and `to` is exclusive. The offsets distinguish repeated passages. Foliole trims surrounding whitespace, derives a title, and saves the excerpt as a child Topic with a highlight anchor. The response contains `material.id`. On desktop and mobile, open the child and click the source Topic in its breadcrumbs to jump to the original text passage. This viewport action stays in the UI. To read the stored anchor, use `materials/read` with `include_relations: true`.

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

Mobile folder lists support touch selection to move eligible entries to Trash. Trash supports bulk restore and confirmed permanent deletion of selected entries and their contents. Agent Control continues to use the existing material and revision contract for individual requests.

Use `POST /agent-control/v1/materials/list-trash` or `foliole materials/list-trash --query "Title"`. Omit the query to browse all trash roots. Title matching is case-insensitive and uses substrings. A match on a trashed descendant returns its subtree root once, just as in the desktop trash.

Results are ordered by deletion time, newest first, with ID breaking ties. Each result has `id`, `kind`, `title`, `parent_id`, `deleted_at`, and `updated_at`. Pass the result's `id` and `updated_at` as `id` and `expected_updated_at` to `materials/restore`. Restoring a root can restore its descendants.

The default page size is 30. Set `limit` from 1 to 100 and pass `next_offset` as `offset` (CLI `--offset`) until it is null. Offsets apply to the current trash contents, so a deletion or restore between pages can shift results. The route requires the Agent Control bearer token and the CLI checks for `materials.listTrash` in the session descriptor.

Callers can retain a copy of content they read before making a change. Use Foliole’s library backup when a batch needs a library-wide recovery point.

When changing a product capability:

1. Identify the external use case and record the decision for reading, creation, updates, or relationships in the relevant row. Record a concrete follow-up when delivery is deferred. Database schema changes are evidence for the review.
2. Reuse the product operation that owns validation, persistence, and sync. Keep search indexes, sync bookkeeping, and device-local UI state internal unless a specific public operation needs them.
3. Exercise the real API and CLI where supported. Verify the user-visible result, check existing callers' contracts, and cover restart or an independent sync peer where the operation promises those results.

The companion sync-group setup screen displays safe failure codes and the known device and stage when library reception is incomplete, including reported errors that can be retried. Once reception starts, the setup screen hides discovery and join actions until reception ends. These controls stay in the setup screen. Agent Control exposes no sync-group setup or diagnostic operation.

Desktop Settings → About records application events to files under the desktop instance’s application data directory with the existing redacted diagnostic context. A recording runs for up to five minutes and can continue across one desktop restart within that time. Users can reveal the latest file after stopping. During desktop recording, the file correlates a Flow grade selection, confirmed save and due time, saved queue choice, and displayed card using temporary numbers. It also correlates Split Topic clicks, delimiter match and preview counts, and the save outcome without including source text, titles, or delimiter text. These events stay in the user-initiated recording. Foliole retains recordings for up to seven days and 64 MiB. The Logs settings page on Android and iPhone captures and exports a short local troubleshooting session. Android recordings correlate Flow actions with learning-day queue changes, local writes, next-item selection and its scan size, successor prediction hits, and body readiness using temporary operation numbers. They add image counts, image bytes, and body length for the card left and the card shown; native file queue and run times; the background work active while a Flow write waits; JavaScript long tasks; and library size, time since the day boundary, and today’s attachment check. Overlapping attachment, sync, folder backup, refresh, read, and prediction work appears as relative intervals. The capture excludes content, resource paths, and persistent identifiers. Agent Control exposes no operation to start capture, read the log, or export it. The user initiates capture and chooses where to share the exported file.

Android's Devanagari annotation boundary setting is a device-local touch selection preference in Settings → Diagnostics. The API and CLI continue to take explicit stored Markdown ranges.

Dragging a Markdown text selection near the bottom of the desktop reading pane scrolls the article and extends the selection. The mouse gesture stays in the reader; the API and CLI still take explicit Markdown ranges.

After a long press in the Android reader, releasing the finger hands the transient range to Foliole’s drag handles. This interaction stays in the reader. Select paragraph in the mobile reading toolbar expands the transient selection using the desktop reading paragraph boundaries. Agent Control receives explicit source ranges for material operations.

The macOS and Windows preference to quit Foliole when closing its main window is local to the desktop library. It stays in Settings because it controls native window behavior and the availability of background services on that device.

Material History is a desktop navigation surface for the 100 most recently visited materials in the library. The desktop left toolbar, command palette, and shortcut open Material History, which opens materials through the existing navigation flow. Its View options remember the preview line limit, breadcrumb placement, and independent preview and breadcrumb font sizes. History and Search shortcut hints start collapsed and remember each panel’s choice as a desktop UI preference. The Agent Control API and CLI do not expose the visit list, manual pins, most recently edited material, or these display preferences.

Desktop Cut, Undo, and Redo suppress keyboard auto-repeat at the input boundary. Clipboard editing and interactive editing history stay in the desktop editor. Agent Control continues to use explicit material operations.

The desktop command palette searches the settings index and opens the selected category or setting. The palette matches English and localized labels and descriptions, and shows matching action tips inline. Search in desktop Settings also jumps to Global capture, backup search, library merge, and local attachment cleanup, and shows how to use formatting cleanup, image cloze, and formula cloze in a topic. These desktop UI behaviors have no Agent Control API or CLI route.

The desktop editor menu disables Split Topic when the current document cannot be split and explains the reason in the menu. This menu action has no Agent Control API or CLI route.
