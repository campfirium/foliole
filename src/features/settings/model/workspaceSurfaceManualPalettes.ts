export type WorkspaceSurfaceManualPaletteDefinition = {
  family: string;
  id: string;
  tones: readonly [string, string, string, string, string];
  whiteDocumentTones: readonly [string, string, string, string, string];
};

export const WORKSPACE_SURFACE_MANUAL_PALETTES: readonly WorkspaceSurfaceManualPaletteDefinition[] = [
  { family: 'foliole-default', id: 'foliole-default-greige-paper', tones: ['#b9b1a7', '#e7e3dd', '#f3eee8', '#fbfaf8', '#fbfaf7'], whiteDocumentTones: ['#b9b1a7', '#e7e3dd', '#f3eee8', '#ffffff', '#fbfaf7'] },
  { family: 'foliole-warm-paper', id: 'foliole-warm-paper-trial', tones: ['#bfac9e', '#f0e9e2', '#f9f4f0', '#fbfaf8', '#fbf9f7'], whiteDocumentTones: ['#bfac9e', '#f0e9e2', '#f9f4f0', '#ffffff', '#fbf9f7'] },
  { family: 'foliole-mist', id: 'foliole-mist-trial', tones: ['#ebe5df', '#f2efea', '#f7f5f2', '#fbfaf8', '#fbfaf8'], whiteDocumentTones: ['#ebe5df', '#f2efea', '#f7f5f2', '#ffffff', '#f7f5f2'] },
  { family: 'foliole-paper', id: 'foliole-paper-trial', tones: ['#d8d3cc', '#f0eeeb', '#f7f5f2', '#fbfaf8', '#fbfaf8'], whiteDocumentTones: ['#d8d3cc', '#f0eeeb', '#f7f5f2', '#ffffff', '#fbfaf8'] },
  { family: 'foliole-ash', id: 'foliole-ash-trial', tones: ['#b9afa6', '#e9e4de', '#f3eee8', '#fbfaf8', '#faf8f5'], whiteDocumentTones: ['#b9afa6', '#e9e4de', '#f3eee8', '#ffffff', '#faf8f5'] },
  { family: 'graphite', id: 'graphite-paper-deep', tones: ['#686868', '#c4c4c4', '#dddddd', '#f3f3f3', '#e7e7e7'], whiteDocumentTones: ['#747474', '#d0d0d0', '#e5e5e5', '#ffffff', '#f1f1f1'] },
  { family: 'graphite', id: 'graphite-paper-soft', tones: ['#7d7d7d', '#cdcdcd', '#e3e3e3', '#f5f5f5', '#ebebeb'], whiteDocumentTones: ['#878787', '#d8d8d8', '#e9e9e9', '#ffffff', '#f3f3f3'] },
  { family: 'warm-ash', id: 'warm-ash-linen', tones: ['#8f857c', '#d4ccc5', '#e7e0da', '#f5f1ed', '#ece8e4'], whiteDocumentTones: ['#9b9087', '#ddd6cf', '#ece6e0', '#ffffff', '#f4f2ef'] },
  { family: 'warm-ash', id: 'warm-ash-paper', tones: ['#9c9188', '#ddd4cc', '#ede5de', '#f7f2ec', '#f0ebe6'], whiteDocumentTones: ['#a79b92', '#e4dbd4', '#f1eae4', '#ffffff', '#f7f4f1'] },

  { family: 'sage', id: 'sage-canvas-deep', tones: ['#6f7d69', '#c3cec0', '#dbe3d7', '#f0f2eb', '#e4e9e1'], whiteDocumentTones: ['#7c8975', '#cfd8cc', '#e3e9df', '#ffffff', '#f0f3ee'] },
  { family: 'sage', id: 'sage-canvas-soft', tones: ['#82907b', '#d1d9cc', '#e3e8de', '#f3f5ef', '#eaede7'], whiteDocumentTones: ['#8d9b86', '#d9e0d5', '#e8ede5', '#ffffff', '#f3f5f1'] },
  { family: 'olive', id: 'olive-ledger-deep', tones: ['#7c7b58', '#c9c8aa', '#dfdec7', '#f0efdf', '#e4e3d5'], whiteDocumentTones: ['#8a8964', '#d3d2b6', '#e5e3cf', '#ffffff', '#f0efe6'] },
  { family: 'olive', id: 'olive-ledger-soft', tones: ['#918f69', '#d8d5bb', '#e8e4d4', '#f4f2e7', '#ebe9df'], whiteDocumentTones: ['#9d9a74', '#dfdcc5', '#ece8db', '#ffffff', '#f4f2ed'] },
  { family: 'moss', id: 'moss-study-deep', tones: ['#687857', '#bec7b4', '#d8dece', '#eef1e8', '#e2e5dc'], whiteDocumentTones: ['#738361', '#c8d0be', '#dee4d6', '#ffffff', '#edf0ea'] },
  { family: 'moss', id: 'moss-study-soft', tones: ['#7d8b6c', '#ccd3c2', '#e0e5da', '#f2f4ed', '#e8ebe4'], whiteDocumentTones: ['#889678', '#d4dacd', '#e5e9e0', '#ffffff', '#f1f3ef'] },
  { family: 'pine', id: 'pine-atlas-deep', tones: ['#4f7066', '#bbd0ca', '#d7e5e1', '#edf4f1', '#e2ebe8'], whiteDocumentTones: ['#5b7d72', '#c6d8d3', '#dde9e5', '#ffffff', '#edf2f1'] },
  { family: 'pine', id: 'pine-atlas-soft', tones: ['#68867d', '#cadad5', '#e1eae7', '#f2f6f4', '#eaefed'], whiteDocumentTones: ['#749188', '#d3e1dc', '#e7eeeb', '#ffffff', '#f2f5f4'] },

  { family: 'teal', id: 'teal-harbor-deep', tones: ['#4f7e82', '#b8d2d5', '#d8e8ea', '#eff5f5', '#e4edee'], whiteDocumentTones: ['#5d8b90', '#c4dadd', '#deecee', '#ffffff', '#eef4f5'] },
  { family: 'teal', id: 'teal-harbor-soft', tones: ['#67949a', '#c8dde0', '#e2ecee', '#f3f7f7', '#ebf0f1'], whiteDocumentTones: ['#74a0a6', '#d1e4e6', '#e8f0f1', '#ffffff', '#f3f6f7'] },
  { family: 'blue', id: 'blue-harbor-deep', tones: ['#58779a', '#bfd0df', '#dae5ed', '#eef3f7', '#e5ebf0'], whiteDocumentTones: ['#6684a6', '#cad9e5', '#e2ebf1', '#ffffff', '#f0f4f7'] },
  { family: 'blue', id: 'blue-harbor-soft', tones: ['#7290b2', '#cfdae7', '#e5ecf3', '#f4f7fa', '#edf1f5'], whiteDocumentTones: ['#7f9dc0', '#d7e1ec', '#eaf0f5', '#ffffff', '#f4f7f9'] },
  { family: 'indigo', id: 'indigo-evening-deep', tones: ['#666f99', '#c0c6df', '#dbe0ee', '#eff2f7', '#e6e9f1'], whiteDocumentTones: ['#737daa', '#cad0e5', '#e3e7f1', '#ffffff', '#f1f2f7'] },
  { family: 'indigo', id: 'indigo-evening-soft', tones: ['#7c84af', '#d0d4e8', '#e4e7f3', '#f4f6fa', '#edeef5'], whiteDocumentTones: ['#8891bc', '#d8dcef', '#e9ebf6', '#ffffff', '#f4f5f9'] },

  { family: 'plum', id: 'plum-study-deep', tones: ['#7b6989', '#cbbfd1', '#e1d9e5', '#f1ecf2', '#e8e3ea'], whiteDocumentTones: ['#877596', '#d4cad9', '#e8e1ea', '#ffffff', '#f2eff3'] },
  { family: 'plum', id: 'plum-study-soft', tones: ['#9582a0', '#d9d0de', '#e9e3eb', '#f6f2f6', '#eeebef'], whiteDocumentTones: ['#a08dab', '#e0d8e4', '#eee9ef', '#ffffff', '#f6f3f6'] },
  { family: 'rose', id: 'rose-fresco-deep', tones: ['#946977', '#d3bcc4', '#e8dbe0', '#f5eef1', '#ede5e8'], whiteDocumentTones: ['#a07684', '#dcc8ce', '#eee2e6', '#ffffff', '#f5f0f2'] },
  { family: 'rose', id: 'rose-fresco-soft', tones: ['#aa808c', '#dfcdd2', '#eee3e6', '#f8f3f5', '#f2ebed'], whiteDocumentTones: ['#b68b97', '#e5d5d9', '#f2e9eb', '#ffffff', '#f7f4f4'] },

  { family: 'terracotta', id: 'terracotta-fresco-deep', tones: ['#9e6154', '#d9b5ab', '#ebd4ce', '#f5e8e3', '#eddedb'], whiteDocumentTones: ['#aa6e61', '#e0c1b8', '#f0dcd6', '#ffffff', '#f5edea'] },
  { family: 'terracotta', id: 'terracotta-fresco-soft', tones: ['#b3786a', '#e2c7bf', '#f0dfda', '#f8efec', '#f2e7e4'], whiteDocumentTones: ['#bf8476', '#e8d0c8', '#f4e6e1', '#ffffff', '#f8f2f0'] },
  { family: 'amber', id: 'amber-ledger-deep', tones: ['#967447', '#d4be99', '#eadcc0', '#f6efdf', '#ebe3d2'], whiteDocumentTones: ['#a38155', '#dcc8a8', '#efe3cb', '#ffffff', '#f4efe5'] },
  { family: 'amber', id: 'amber-ledger-soft', tones: ['#ad8756', '#e0cfb0', '#f0e6d2', '#faf4e7', '#f1ebdf'], whiteDocumentTones: ['#b99463', '#e6d6bb', '#f4ecd9', '#ffffff', '#f7f4ec'] },
  { family: 'ochre', id: 'ochre-ledger-deep', tones: ['#8f7d4b', '#cec39f', '#e5ddb9', '#f4efda', '#e7e2cd'], whiteDocumentTones: ['#9c8956', '#d7ccab', '#ebe4c5', '#ffffff', '#f2efe2'] },
  { family: 'ochre', id: 'ochre-ledger-soft', tones: ['#a59563', '#ddd3b5', '#efe7cf', '#f8f4e5', '#f0ebdc'], whiteDocumentTones: ['#b0a06f', '#e4dcc0', '#f3ecd7', '#ffffff', '#f7f4eb'] },

  { family: 'silver', id: 'silver-sheet-deep', tones: ['#6f7680', '#ccd2d9', '#e1e6eb', '#f4f6f8', '#ebedf0'], whiteDocumentTones: ['#7b838d', '#d4dae0', '#e7ebef', '#ffffff', '#f3f4f6'] },
  { family: 'silver', id: 'silver-sheet-soft', tones: ['#858c95', '#d8dde2', '#e8ecef', '#f7f9fa', '#f0f2f3'], whiteDocumentTones: ['#9097a1', '#dfe4e8', '#edf0f3', '#ffffff', '#f6f7f8'] },
  { family: 'smoke', id: 'smoke-paper-deep', tones: ['#756f72', '#d1cacd', '#e5dfe2', '#f5f2f3', '#ece8ea'], whiteDocumentTones: ['#817b7e', '#d9d2d5', '#eae5e7', '#ffffff', '#f3f1f2'] },
  { family: 'smoke', id: 'smoke-paper-soft', tones: ['#8b8588', '#dcd6d8', '#ece7e8', '#f8f5f6', '#f1eeef'], whiteDocumentTones: ['#969093', '#e1dbdd', '#f0ecec', '#ffffff', '#f7f5f5'] },
  { family: 'stone', id: 'stone-ledger-deep', tones: ['#84796f', '#d7cec6', '#e9e2db', '#f6f2ed', '#ede9e5'], whiteDocumentTones: ['#90857b', '#ddd5ce', '#eee8e2', '#ffffff', '#f5f3f0'] },
  { family: 'stone', id: 'stone-ledger-soft', tones: ['#9a8f85', '#e1d9d1', '#efe9e3', '#faf6f2', '#f2efec'], whiteDocumentTones: ['#a59a90', '#e7e0d9', '#f3ede8', '#ffffff', '#f8f5f3'] },

  { family: 'parchment', id: 'parchment-paper-deep', tones: ['#99866b', '#e1d4bf', '#f0e8d8', '#faf6ea', '#f2ede3'], whiteDocumentTones: ['#a59378', '#e7dcc9', '#f4eddf', '#ffffff', '#f8f5ef'] },
  { family: 'parchment', id: 'parchment-paper-soft', tones: ['#af9b7d', '#eadfcf', '#f5eee2', '#fcf8ef', '#f6f2ea'], whiteDocumentTones: ['#baa689', '#efe5d7', '#f8f1e7', '#ffffff', '#faf7f3'] },
  { family: 'oat', id: 'oat-paper-deep', tones: ['#a28d75', '#e3d5c5', '#f1e6da', '#faf4ec', '#f2ece5'], whiteDocumentTones: ['#ae9981', '#e8dccd', '#f4ebe1', '#ffffff', '#f8f4f0'] },
  { family: 'oat', id: 'oat-paper-soft', tones: ['#b6a089', '#ece0d2', '#f7eee5', '#fcf8f2', '#f7f2ed'], whiteDocumentTones: ['#c0aa93', '#f0e6d9', '#faf2ea', '#ffffff', '#fbf8f5'] },
  { family: 'linen', id: 'linen-paper-deep', tones: ['#a39082', '#e3d8cf', '#f0e8e1', '#f9f5f1', '#f3eeea'], whiteDocumentTones: ['#af9c8e', '#e8ded6', '#f4ede7', '#ffffff', '#f8f5f3'] },
  { family: 'linen', id: 'linen-paper-soft', tones: ['#b5a395', '#ece3dc', '#f6f0eb', '#fcf9f6', '#f8f4f1'], whiteDocumentTones: ['#bfac9e', '#f0e9e2', '#f9f4f0', '#ffffff', '#fbf9f7'] },
  { family: 'ivory', id: 'ivory-paper-deep', tones: ['#948a77', '#e1d8c8', '#eee7db', '#faf7ef', '#f1ede7'], whiteDocumentTones: ['#9f9582', '#e7dfd0', '#f2ecdf', '#ffffff', '#f7f4ef'] },
  { family: 'ivory', id: 'ivory-paper-soft', tones: ['#a89d89', '#ebe4d8', '#f5f0e7', '#fdfbf6', '#f7f4f0'], whiteDocumentTones: ['#b3a894', '#efe8dd', '#f8f3eb', '#ffffff', '#faf8f5'] },
  { family: 'sand', id: 'sand-paper-deep', tones: ['#9f8668', '#e2d1bd', '#efe4d5', '#faf4ea', '#f1ebe2'], whiteDocumentTones: ['#aa9274', '#e8d8c7', '#f3eadf', '#ffffff', '#f7f4ef'] },
  { family: 'sand', id: 'sand-paper-soft', tones: ['#b49b7e', '#ecdfd0', '#f6eee3', '#fcf8f0', '#f7f2eb'], whiteDocumentTones: ['#bea68a', '#f0e5d7', '#f9f2e9', '#ffffff', '#fbf8f4'] },

  { family: 'eucalyptus', id: 'eucalyptus-canvas-deep', tones: ['#647b73', '#c7d6d0', '#dfe8e3', '#f1f5f2', '#e8edea'], whiteDocumentTones: ['#70877f', '#d0ddd8', '#e5ece8', '#ffffff', '#f1f4f3'] },
  { family: 'eucalyptus', id: 'eucalyptus-canvas-soft', tones: ['#7a9189', '#d4e0db', '#e8efec', '#f6f9f7', '#eff3f1'], whiteDocumentTones: ['#859d95', '#dae6e1', '#edf3f1', '#ffffff', '#f6f8f7'] },
  { family: 'forest', id: 'forest-ledger-deep', tones: ['#4d6556', '#bed0c3', '#d9e3db', '#eef3ef', '#e4e9e5'], whiteDocumentTones: ['#597262', '#c7d7cd', '#dee7e1', '#ffffff', '#eef2ef'] },
  { family: 'forest', id: 'forest-ledger-soft', tones: ['#678171', '#ccdbd2', '#e3ebe5', '#f3f7f4', '#ebf0ec'], whiteDocumentTones: ['#728d7d', '#d3e1da', '#e8efea', '#ffffff', '#f3f6f4'] },
  { family: 'jade', id: 'jade-harbor-deep', tones: ['#4f8074', '#bdd7cf', '#d9eae5', '#eef6f3', '#e4eeeb'], whiteDocumentTones: ['#5c8d82', '#c7dfd8', '#dff0eb', '#ffffff', '#eff6f4'] },
  { family: 'jade', id: 'jade-harbor-soft', tones: ['#669a8d', '#cce3dd', '#e4f0ec', '#f4faf8', '#edf3f1'], whiteDocumentTones: ['#71a699', '#d3e8e3', '#e9f4f0', '#ffffff', '#f4f8f7'] },

  { family: 'slate', id: 'slate-paper-deep', tones: ['#5c6977', '#c4ced8', '#dde4eb', '#f1f4f7', '#e7ebef'], whiteDocumentTones: ['#687584', '#ccd5dd', '#e3e9ef', '#ffffff', '#f1f3f6'] },
  { family: 'slate', id: 'slate-paper-soft', tones: ['#71808f', '#d2dae1', '#e7edf1', '#f6f8fa', '#eff2f4'], whiteDocumentTones: ['#7c8b9a', '#d9e0e6', '#ecf1f4', '#ffffff', '#f5f7f9'] },
  { family: 'steel', id: 'steel-paper-deep', tones: ['#62717d', '#c8d2db', '#e0e7ed', '#f2f5f8', '#e9edf1'], whiteDocumentTones: ['#6d7c89', '#d0d9e0', '#e6ecf1', '#ffffff', '#f2f5f7'] },
  { family: 'steel', id: 'steel-paper-soft', tones: ['#788794', '#d4dce3', '#e8edf2', '#f7f9fb', '#f0f3f5'], whiteDocumentTones: ['#83909d', '#dae1e7', '#edf2f5', '#ffffff', '#f6f8f9'] },
  { family: 'dusk', id: 'dusk-paper-deep', tones: ['#6e748d', '#cfd3e2', '#e3e6f0', '#f3f4f8', '#ebedf3'], whiteDocumentTones: ['#797f98', '#d6d9e7', '#e8eaf3', '#ffffff', '#f3f4f8'] },
  { family: 'dusk', id: 'dusk-paper-soft', tones: ['#858aa4', '#dbe0ea', '#eceef5', '#f8f9fc', '#f2f4f7'], whiteDocumentTones: ['#9095ae', '#e0e4ee', '#f0f2f7', '#ffffff', '#f7f8fa'] },

  { family: 'mauve', id: 'mauve-study-deep', tones: ['#877a8d', '#d7cfda', '#e9e4ea', '#f6f2f6', '#eeebef'], whiteDocumentTones: ['#928598', '#ddd6df', '#eeeaee', '#ffffff', '#f6f4f6'] },
  { family: 'mauve', id: 'mauve-study-soft', tones: ['#9b8ea1', '#e0d9e3', '#f0ecf1', '#faf7fa', '#f4f2f5'], whiteDocumentTones: ['#a699ac', '#e5dfe8', '#f3eff4', '#ffffff', '#f8f7f9'] },
  { family: 'brick', id: 'brick-fresco-deep', tones: ['#8d5b4f', '#d7bbb3', '#ead7d2', '#f5ebe8', '#ede1de'], whiteDocumentTones: ['#99675b', '#dec4bd', '#efdfdb', '#ffffff', '#f5eeed'] },
  { family: 'brick', id: 'brick-fresco-soft', tones: ['#a66f62', '#e1cbc4', '#f0e2dd', '#f8f1ee', '#f2eae7'], whiteDocumentTones: ['#b17b6e', '#e7d3cd', '#f4e8e4', '#ffffff', '#f8f3f1'] },
  { family: 'sepia', id: 'sepia-ledger-deep', tones: ['#7f6951', '#cfbfae', '#e5d9cb', '#f4ede5', '#e9e2da'], whiteDocumentTones: ['#8b755d', '#d8c9b9', '#ebe1d5', '#ffffff', '#f3efea'] },
  { family: 'sepia', id: 'sepia-ledger-soft', tones: ['#967f67', '#ddd1c3', '#efe7dc', '#f8f4ee', '#f1ede6'], whiteDocumentTones: ['#a18b73', '#e3d8cb', '#f3ece3', '#ffffff', '#f8f5f1'] },
  { family: 'walnut', id: 'walnut-ledger-deep', tones: ['#6e5a48', '#c7baab', '#e0d6cb', '#f1ebe4', '#e5dfd9'], whiteDocumentTones: ['#7a6553', '#d0c4b6', '#e7ddd4', '#ffffff', '#f1ede9'] },
  { family: 'walnut', id: 'walnut-ledger-soft', tones: ['#856f5d', '#d6ccc1', '#ebe3db', '#f7f3ee', '#efeae5'], whiteDocumentTones: ['#907a68', '#ddd4ca', '#f0e9e2', '#ffffff', '#f6f3f0'] }
] as const;

export const WORKSPACE_SURFACE_DARK_MANUAL_PALETTES: readonly WorkspaceSurfaceManualPaletteDefinition[] = [
  { family: 'graphite', id: 'dark-graphite-study', tones: ['#171b1a', '#1a1f1e', '#1c2221', '#161918', '#1a1f1e'], whiteDocumentTones: ['#171b1a', '#1a1f1e', '#1c2221', '#161918', '#1a1f1e'] },
  { family: 'graphite', id: 'dark-graphite-paper', tones: ['#20211f', '#282a27', '#30332f', '#181918', '#383d37'], whiteDocumentTones: ['#20211f', '#282a27', '#30332f', '#181918', '#383d37'] },
  { family: 'moss', id: 'dark-moss-study', tones: ['#1d241f', '#263027', '#2f3a30', '#151916', '#374238'], whiteDocumentTones: ['#1d241f', '#263027', '#2f3a30', '#151916', '#374238'] },
  { family: 'moss', id: 'dark-moss-ledger', tones: ['#20261d', '#2a3226', '#333d2f', '#171a15', '#3b4637'], whiteDocumentTones: ['#20261d', '#2a3226', '#333d2f', '#171a15', '#3b4637'] },
  { family: 'ink-blue', id: 'dark-ink-blue-harbor', tones: ['#1a2230', '#253044', '#2e3b52', '#121722', '#364560'], whiteDocumentTones: ['#1a2230', '#253044', '#2e3b52', '#121722', '#364560'] },
  { family: 'ink-blue', id: 'dark-ink-blue-slate', tones: ['#1c2430', '#273140', '#303c4e', '#141922', '#394759'], whiteDocumentTones: ['#1c2430', '#273140', '#303c4e', '#141922', '#394759'] },
  { family: 'sepia', id: 'dark-sepia-ledger', tones: ['#29231c', '#362e25', '#41382d', '#1c1712', '#4e4235'], whiteDocumentTones: ['#29231c', '#362e25', '#41382d', '#1c1712', '#4e4235'] },
  { family: 'sepia', id: 'dark-sepia-ash', tones: ['#2a241f', '#362f29', '#413a32', '#1b1714', '#4c443b'], whiteDocumentTones: ['#2a241f', '#362f29', '#413a32', '#1b1714', '#4c443b'] },
  { family: 'plum-ash', id: 'dark-plum-ash-study', tones: ['#261f2b', '#32293a', '#3d3246', '#19151d', '#493b53'], whiteDocumentTones: ['#261f2b', '#32293a', '#3d3246', '#19151d', '#493b53'] },
  { family: 'teal-slate', id: 'dark-teal-slate-atlas', tones: ['#172629', '#203337', '#284044', '#11191a', '#304b50'], whiteDocumentTones: ['#172629', '#203337', '#284044', '#11191a', '#304b50'] }
] as const;
