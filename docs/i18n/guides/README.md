# Guides Content Source

This folder is the source for the Foliole Demo Guides content.

## Structure

- `guide.yml` is a small line-oriented outline. Each non-empty line starts with a slug.
- Top-level slugs are stable content ids and Markdown filenames. Nested lines use local short slugs; the compiler expands them to dotted ids and filenames such as `welcome-to-foliole.reading-break-the-whole-into-pieces`.
- Add `, item` after the slug for review items. Lines without a type are topics.
- Indentation defines parent and order. Topics may contain child topics, and review items are indented under their parent topic.
- Topic Markdown files live under `<locale>/<topic-id>.md`; child topic files use the expanded dotted id.
- Item Markdown files live under `<locale>/<parent-topic-slug>.<item-slug>.md`; the generated item id uses the same full dotted slug.
- English (`en`) is required for every slug. Other locales may omit files and will fall back to English.
- `assets.json` assigns packaged images to stable topic ids once. The Desktop guide generator injects those images into every locale's final Topic Markdown; locale Markdown files do not repeat asset URLs.

## Markdown

Topic files use normal Markdown:

```markdown
# Topic title

Opening sentence.
Second sentence in the same reading paragraph.

## Section title

Section body.
```

For short Guide topics, keep the body as one reading paragraph. Use a single line break between sentences when it improves source readability. Use a blank line only when the content should become a separate block, such as a section heading, image, list, or genuinely separate paragraph. The compiler preserves blank-line paragraph boundaries because the Demo reader uses them for reading-mode paragraph navigation.

Item files use a horizontal rule to split prompt and answer. Use the local short item slug in `guide.yml`; the Markdown filename uses the expanded dotted id.

```markdown
# Item title

Prompt text.

---

Answer text.
```

Do not use Markdown frontmatter in these files.
