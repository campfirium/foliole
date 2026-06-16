import type { GuidePack } from '../guidePack';

export const GENERATED_GUIDE_PACK: GuidePack = {
  contractVersion: 1,
  generatedAt: '2026-06-17T00:00:00.000Z',
  source: {
    rootNodeId: null,
    rootTitle: 'Built-in Web Guides',
    warnings: ['Built-in development Guide Pack. Run the export script with a Glide root to replace it.']
  },
  topics: [
    {
      id: 'focused-reading-review',
      slug: 'focused-reading-review',
      title: 'Focused reading and review',
      description: 'A practical guide to reading, extracting, and reviewing topics in Foliole.',
      summary: 'Build a quiet loop from reading to review without turning every thought into a task.',
      runtime: { state: 'topic', topicId: 'focused-reading-review' },
      highlights: [],
      reviewItems: [],
      blocks: [
        { id: 'focused-reading-review-heading-1', kind: 'heading', text: 'Start with one source topic' },
        {
          id: 'focused-reading-review-paragraph-1',
          kind: 'paragraph',
          text: 'Choose one topic that is worth reading slowly. Keep the first pass simple: read for structure, mark what matters, and avoid reshaping the whole workspace too early.'
        },
        {
          id: 'focused-reading-review-paragraph-2',
          kind: 'paragraph',
          text: 'When a passage needs its own follow-up, turn it into a focused excerpt instead of scattering related material across separate notes.'
        },
        { id: 'focused-reading-review-heading-2', kind: 'heading', text: 'Keep review material small' },
        {
          id: 'focused-reading-review-paragraph-3',
          kind: 'paragraph',
          text: 'Review works best when each item asks for one clear recall. Use highlights and cloze prompts for precise checks, and keep longer explanations in the topic itself.'
        },
        {
          id: 'focused-reading-review-paragraph-4',
          kind: 'paragraph',
          text: 'A steady review queue should help you return to important ideas, not become another inbox to sort.'
        },
        { id: 'focused-reading-review-heading-3', kind: 'heading', text: 'Return to the source' },
        {
          id: 'focused-reading-review-paragraph-5',
          kind: 'paragraph',
          text: 'After review, revisit the source topic when an idea still feels unclear. The goal is not to memorize isolated fragments, but to keep reading and review connected.'
        }
      ]
    },
    {
      id: 'organize-source-topics',
      slug: 'organize-source-topics',
      title: 'Organize source topics',
      description: 'A short guide to keeping source topics easy to return to as a reading collection grows.',
      summary: 'Keep folders and topics simple enough that the next reading step stays visible.',
      runtime: { state: 'topic', topicId: 'organize-source-topics' },
      highlights: [],
      reviewItems: [],
      blocks: [
        { id: 'organize-source-topics-heading-1', kind: 'heading', text: 'Use folders for stable context' },
        {
          id: 'organize-source-topics-paragraph-1',
          kind: 'paragraph',
          text: 'Group topics by the context you expect to revisit. A folder should make the next topic easier to find, not become a second classification project.'
        },
        {
          id: 'organize-source-topics-paragraph-2',
          kind: 'paragraph',
          text: 'When a topic no longer belongs in its first place, move it once the better home is clear.'
        },
        { id: 'organize-source-topics-heading-2', kind: 'heading', text: 'Keep the inbox small' },
        {
          id: 'organize-source-topics-paragraph-3',
          kind: 'paragraph',
          text: 'Let the inbox collect new topics briefly, then move useful material into folders before the list becomes another reading burden.'
        },
        {
          id: 'organize-source-topics-paragraph-4',
          kind: 'paragraph',
          text: 'If a topic is only a temporary reminder, decide whether it deserves a source topic before building review material from it.'
        }
      ]
    }
  ]
};
