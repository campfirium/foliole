export interface SuperMemoDemoTopic {
  title: string;
  body: string;
  items: [question: string, answer: string][];
}

// Built-in sample content for the browser demo. A topic without a body is a possible folder.
export const SUPER_MEMO_DEMO_FOLDERS: { title: string; topics: SuperMemoDemoTopic[] }[] = [
  { title: 'Memory and learning', topics: [
    { title: 'The spacing effect', body: 'Reviews spread over time are remembered longer than reviews packed into one session.', items: [
      ['What is the spacing effect?', 'Spaced reviews produce longer-lasting memory than massed reviews.'],
      ['What happens to the best interval as memory grows stronger?', 'It becomes longer.'],
      ['Which study habit works against the spacing effect?', 'Cramming.']
    ] },
    { title: 'Retrieval practice', body: 'Trying to recall an answer strengthens memory more than reading it again.', items: [
      ['What is retrieval practice?', 'Actively recalling information from memory.'],
      ['Why can rereading feel misleading?', 'Familiarity is easily mistaken for recall.'],
      ['When is feedback most useful?', 'Right after an attempt to recall.']
    ] },
    { title: 'Incremental reading', body: 'Long articles are processed in small portions, and key passages become extracts and cards.', items: [
      ['What is an extract?', 'A passage kept from an article for later processing.'],
      ['What turns an extract into an active recall exercise?', 'A question or a cloze deletion.']
    ] }
  ] },
  { title: 'Astronomy', topics: [
    { title: 'The Solar System', body: '', items: [
      ['Which planet is closest to the Sun?', 'Mercury.'],
      ['Which planet is the largest?', 'Jupiter.'],
      ['Which planet rotates on its side?', 'Uranus.'],
      ['Where is the main asteroid belt?', 'Between Mars and Jupiter.']
    ] },
    { title: 'Stellar life cycles', body: 'A star’s mass largely decides how long it shines and what it leaves behind.', items: [
      ['What powers a main sequence star?', 'Fusion of hydrogen into helium.'],
      ['What remains after a Sun-like star dies?', 'A white dwarf.'],
      ['Do massive stars live longer or shorter?', 'Shorter.']
    ] },
    { title: 'Light as a messenger', body: 'Spectra reveal what distant objects are made of and how they move.', items: [
      ['What do absorption lines identify?', 'The elements that absorbed the light.'],
      ['What does a redshift indicate?', 'The source is moving away.']
    ] }
  ] },
  { title: 'World history', topics: [
    { title: 'Writing systems', body: 'Writing appeared independently in several places.', items: [
      ['Which script was pressed into clay tablets in Mesopotamia?', 'Cuneiform.'],
      ['What does an alphabet represent?', 'Individual speech sounds.'],
      ['Which stone helped decipher Egyptian hieroglyphs?', 'The Rosetta Stone.']
    ] },
    { title: 'The printing press', body: 'Movable type made books far cheaper to produce.', items: [
      ['Who introduced the movable-type press in Europe?', 'Johannes Gutenberg.'],
      ['In which century did this happen?', 'The fifteenth century.']
    ] }
  ] }
];
