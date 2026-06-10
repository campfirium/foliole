export interface WebGuideSection {
  heading: string;
  body: string[];
}

export interface WebGuideSeed {
  slug: string;
  title: string;
  description: string;
  summary: string;
  sections: WebGuideSection[];
}

export const WEB_GUIDES: WebGuideSeed[] = [
  {
    slug: 'focused-reading-review',
    title: 'Focused reading and review',
    description: 'A practical guide to reading, extracting, and reviewing topics in Foliole.',
    summary: 'Build a quiet loop from reading to review without turning every thought into a task.',
    sections: [
      {
        heading: 'Start with one source topic',
        body: [
          'Choose one topic that is worth reading slowly. Keep the first pass simple: read for structure, mark what matters, and avoid reshaping the whole workspace too early.',
          'When a passage needs its own follow-up, turn it into a focused excerpt instead of scattering related material across separate notes.'
        ]
      },
      {
        heading: 'Keep review material small',
        body: [
          'Review works best when each item asks for one clear recall. Use highlights and cloze prompts for precise checks, and keep longer explanations in the topic itself.',
          'A steady review queue should help you return to important ideas, not become another inbox to sort.'
        ]
      },
      {
        heading: 'Return to the source',
        body: [
          'After review, revisit the source topic when an idea still feels unclear. The goal is not to memorize isolated fragments, but to keep reading and review connected.'
        ]
      }
    ]
  },
  {
    slug: 'organize-source-topics',
    title: 'Organize source topics',
    description: 'A short guide to keeping source topics easy to return to as a reading collection grows.',
    summary: 'Keep folders and topics simple enough that the next reading step stays visible.',
    sections: [
      {
        heading: 'Use folders for stable context',
        body: [
          'Group topics by the context you expect to revisit. A folder should make the next topic easier to find, not become a second classification project.',
          'When a topic no longer belongs in its first place, move it once the better home is clear.'
        ]
      },
      {
        heading: 'Keep the inbox small',
        body: [
          'Let the inbox collect new topics briefly, then move useful material into folders before the list becomes another reading burden.',
          'If a topic is only a temporary reminder, decide whether it deserves a source topic before building review material from it.'
        ]
      }
    ]
  }
];

export const DEFAULT_WEB_GUIDE = WEB_GUIDES[0];

export function canonicalGuidePath(slug: string) {
  return `/guides/${slug}/`;
}
