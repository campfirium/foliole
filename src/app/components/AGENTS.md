# AGENTS

## Workspace Right Panels

- Right-side inspector panels must declare and consume an explicit current-context rule before reading topic data.
- External documents only enable the outline and performance panels; other inspector panels must not reuse the previously selected workspace topic while an external document is open.
- Highlights only run for a regular topic context; folder, external document, empty, virtual, trash, derived highlight, and cloze contexts must not collect or display aggregated highlights.
- Folder, virtual, trash, empty, derived highlight, and cloze contexts may keep global inspector panels, but topic-bound panels must render blank instead of reading topic-scoped data or showing explanatory unavailable copy.
