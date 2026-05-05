export type WorkspaceSurfaceManualPaletteDefinition = {
  family: string;
  id: string;
  tones: readonly [string, string, string, string, string];
  whiteDocumentTones: readonly [string, string, string, string, string];
};

export const WORKSPACE_SURFACE_MANUAL_PALETTES: readonly WorkspaceSurfaceManualPaletteDefinition[] = [
  { family: 'graphite', id: 'graphite-paper-deep', tones: ['#686868', '#c4c4c4', '#dddddd', '#f3f3f3', '#d0d0d0'], whiteDocumentTones: ['#747474', '#d0d0d0', '#e5e5e5', '#ffffff', '#d9d9d9'] },
  { family: 'graphite', id: 'graphite-paper-soft', tones: ['#7d7d7d', '#cdcdcd', '#e3e3e3', '#f5f5f5', '#d7d7d7'], whiteDocumentTones: ['#878787', '#d8d8d8', '#e9e9e9', '#ffffff', '#dfdfdf'] },
  { family: 'warm-ash', id: 'warm-ash-linen', tones: ['#8f857c', '#d4ccc5', '#e7e0da', '#f5f1ed', '#ddd5ce'], whiteDocumentTones: ['#9b9087', '#ddd6cf', '#ece6e0', '#ffffff', '#e4ddd7'] },
  { family: 'warm-ash', id: 'warm-ash-paper', tones: ['#9c9188', '#ddd4cc', '#ede5de', '#f7f2ec', '#e5ddd6'], whiteDocumentTones: ['#a79b92', '#e4dbd4', '#f1eae4', '#ffffff', '#ebe4de'] },

  { family: 'sage', id: 'sage-canvas-deep', tones: ['#6f7d69', '#c3cec0', '#dbe3d7', '#f0f2eb', '#d0d8cc'], whiteDocumentTones: ['#7c8975', '#cfd8cc', '#e3e9df', '#ffffff', '#d8dfd4'] },
  { family: 'sage', id: 'sage-canvas-soft', tones: ['#82907b', '#d1d9cc', '#e3e8de', '#f3f5ef', '#dbe1d6'], whiteDocumentTones: ['#8d9b86', '#d9e0d5', '#e8ede5', '#ffffff', '#e2e7de'] },
  { family: 'olive', id: 'olive-ledger-deep', tones: ['#7c7b58', '#c9c8aa', '#dfdec7', '#f0efdf', '#d5d4be'], whiteDocumentTones: ['#8a8964', '#d3d2b6', '#e5e3cf', '#ffffff', '#dcdac6'] },
  { family: 'olive', id: 'olive-ledger-soft', tones: ['#918f69', '#d8d5bb', '#e8e4d4', '#f4f2e7', '#e0dcc8'], whiteDocumentTones: ['#9d9a74', '#dfdcc5', '#ece8db', '#ffffff', '#e6e2d0'] },
  { family: 'moss', id: 'moss-study-deep', tones: ['#687857', '#bec7b4', '#d8dece', '#eef1e8', '#ccd3c3'], whiteDocumentTones: ['#738361', '#c8d0be', '#dee4d6', '#ffffff', '#d3d9cb'] },
  { family: 'moss', id: 'moss-study-soft', tones: ['#7d8b6c', '#ccd3c2', '#e0e5da', '#f2f4ed', '#d8ded2'], whiteDocumentTones: ['#889678', '#d4dacd', '#e5e9e0', '#ffffff', '#dee4da'] },
  { family: 'pine', id: 'pine-atlas-deep', tones: ['#4f7066', '#bbd0ca', '#d7e5e1', '#edf4f1', '#cddcd8'], whiteDocumentTones: ['#5b7d72', '#c6d8d3', '#dde9e5', '#ffffff', '#d5e2de'] },
  { family: 'pine', id: 'pine-atlas-soft', tones: ['#68867d', '#cadad5', '#e1eae7', '#f2f6f4', '#d9e4e0'], whiteDocumentTones: ['#749188', '#d3e1dc', '#e7eeeb', '#ffffff', '#dfe8e5'] },

  { family: 'teal', id: 'teal-harbor-deep', tones: ['#4f7e82', '#b8d2d5', '#d8e8ea', '#eff5f5', '#cddfe1'], whiteDocumentTones: ['#5d8b90', '#c4dadd', '#deecee', '#ffffff', '#d5e4e6'] },
  { family: 'teal', id: 'teal-harbor-soft', tones: ['#67949a', '#c8dde0', '#e2ecee', '#f3f7f7', '#d9e7e9'], whiteDocumentTones: ['#74a0a6', '#d1e4e6', '#e8f0f1', '#ffffff', '#deebec'] },
  { family: 'blue', id: 'blue-harbor-deep', tones: ['#58779a', '#bfd0df', '#dae5ed', '#eef3f7', '#d0dbe4'], whiteDocumentTones: ['#6684a6', '#cad9e5', '#e2ebf1', '#ffffff', '#d8e2e9'] },
  { family: 'blue', id: 'blue-harbor-soft', tones: ['#7290b2', '#cfdae7', '#e5ecf3', '#f4f7fa', '#dce4eb'], whiteDocumentTones: ['#7f9dc0', '#d7e1ec', '#eaf0f5', '#ffffff', '#e2e8ee'] },
  { family: 'indigo', id: 'indigo-evening-deep', tones: ['#666f99', '#c0c6df', '#dbe0ee', '#eff2f7', '#d0d4e3'], whiteDocumentTones: ['#737daa', '#cad0e5', '#e3e7f1', '#ffffff', '#d8dced'] },
  { family: 'indigo', id: 'indigo-evening-soft', tones: ['#7c84af', '#d0d4e8', '#e4e7f3', '#f4f6fa', '#dde0ee'], whiteDocumentTones: ['#8891bc', '#d8dcef', '#e9ebf6', '#ffffff', '#e2e5f1'] },

  { family: 'plum', id: 'plum-study-deep', tones: ['#7b6989', '#cbbfd1', '#e1d9e5', '#f1ecf2', '#d7cedb'], whiteDocumentTones: ['#877596', '#d4cad9', '#e8e1ea', '#ffffff', '#ddd5e1'] },
  { family: 'plum', id: 'plum-study-soft', tones: ['#9582a0', '#d9d0de', '#e9e3eb', '#f6f2f6', '#e2dbe5'], whiteDocumentTones: ['#a08dab', '#e0d8e4', '#eee9ef', '#ffffff', '#e7e0ea'] },
  { family: 'rose', id: 'rose-fresco-deep', tones: ['#946977', '#d3bcc4', '#e8dbe0', '#f5eef1', '#deced3'], whiteDocumentTones: ['#a07684', '#dcc8ce', '#eee2e6', '#ffffff', '#e4d6da'] },
  { family: 'rose', id: 'rose-fresco-soft', tones: ['#aa808c', '#dfcdd2', '#eee3e6', '#f8f3f5', '#e8dce0'], whiteDocumentTones: ['#b68b97', '#e5d5d9', '#f2e9eb', '#ffffff', '#ece2e5'] },

  { family: 'terracotta', id: 'terracotta-fresco-deep', tones: ['#9e6154', '#d9b5ab', '#ebd4ce', '#f5e8e3', '#e2cbc4'], whiteDocumentTones: ['#aa6e61', '#e0c1b8', '#f0dcd6', '#ffffff', '#e7d4ce'] },
  { family: 'terracotta', id: 'terracotta-fresco-soft', tones: ['#b3786a', '#e2c7bf', '#f0dfda', '#f8efec', '#ead8d2'], whiteDocumentTones: ['#bf8476', '#e8d0c8', '#f4e6e1', '#ffffff', '#eee0db'] },
  { family: 'amber', id: 'amber-ledger-deep', tones: ['#967447', '#d4be99', '#eadcc0', '#f6efdf', '#e0d0b4'], whiteDocumentTones: ['#a38155', '#dcc8a8', '#efe3cb', '#ffffff', '#e5d8c0'] },
  { family: 'amber', id: 'amber-ledger-soft', tones: ['#ad8756', '#e0cfb0', '#f0e6d2', '#faf4e7', '#e9ddc7'], whiteDocumentTones: ['#b99463', '#e6d6bb', '#f4ecd9', '#ffffff', '#ede3d0'] },
  { family: 'ochre', id: 'ochre-ledger-deep', tones: ['#8f7d4b', '#cec39f', '#e5ddb9', '#f4efda', '#ddd3ae'], whiteDocumentTones: ['#9c8956', '#d7ccab', '#ebe4c5', '#ffffff', '#e3dbba'] },
  { family: 'ochre', id: 'ochre-ledger-soft', tones: ['#a59563', '#ddd3b5', '#efe7cf', '#f8f4e5', '#e7dcc1'], whiteDocumentTones: ['#b0a06f', '#e4dcc0', '#f3ecd7', '#ffffff', '#ece3cb'] },

  { family: 'silver', id: 'silver-sheet-deep', tones: ['#6f7680', '#ccd2d9', '#e1e6eb', '#f4f6f8', '#d7dde2'], whiteDocumentTones: ['#7b838d', '#d4dae0', '#e7ebef', '#ffffff', '#dde2e7'] },
  { family: 'silver', id: 'silver-sheet-soft', tones: ['#858c95', '#d8dde2', '#e8ecef', '#f7f9fa', '#e1e6e9'], whiteDocumentTones: ['#9097a1', '#dfe4e8', '#edf0f3', '#ffffff', '#e6eaed'] },
  { family: 'smoke', id: 'smoke-paper-deep', tones: ['#756f72', '#d1cacd', '#e5dfe2', '#f5f2f3', '#ddd6d8'], whiteDocumentTones: ['#817b7e', '#d9d2d5', '#eae5e7', '#ffffff', '#e2dbde'] },
  { family: 'smoke', id: 'smoke-paper-soft', tones: ['#8b8588', '#dcd6d8', '#ece7e8', '#f8f5f6', '#e4dfe0'], whiteDocumentTones: ['#969093', '#e1dbdd', '#f0ecec', '#ffffff', '#e9e4e5'] },
  { family: 'stone', id: 'stone-ledger-deep', tones: ['#84796f', '#d7cec6', '#e9e2db', '#f6f2ed', '#e0d8d0'], whiteDocumentTones: ['#90857b', '#ddd5ce', '#eee8e2', '#ffffff', '#e5ddd6'] },
  { family: 'stone', id: 'stone-ledger-soft', tones: ['#9a8f85', '#e1d9d1', '#efe9e3', '#faf6f2', '#e8e1da'], whiteDocumentTones: ['#a59a90', '#e7e0d9', '#f3ede8', '#ffffff', '#ece6df'] },

  { family: 'parchment', id: 'parchment-paper-deep', tones: ['#99866b', '#e1d4bf', '#f0e8d8', '#faf6ea', '#eadfcf'], whiteDocumentTones: ['#a59378', '#e7dcc9', '#f4eddf', '#ffffff', '#efe5d6'] },
  { family: 'parchment', id: 'parchment-paper-soft', tones: ['#af9b7d', '#eadfcf', '#f5eee2', '#fcf8ef', '#f1e7da'], whiteDocumentTones: ['#baa689', '#efe5d7', '#f8f1e7', '#ffffff', '#f4ece0'] },
  { family: 'oat', id: 'oat-paper-deep', tones: ['#a28d75', '#e3d5c5', '#f1e6da', '#faf4ec', '#ecdfd2'], whiteDocumentTones: ['#ae9981', '#e8dccd', '#f4ebe1', '#ffffff', '#f0e5d9'] },
  { family: 'oat', id: 'oat-paper-soft', tones: ['#b6a089', '#ece0d2', '#f7eee5', '#fcf8f2', '#f3e9df'], whiteDocumentTones: ['#c0aa93', '#f0e6d9', '#faf2ea', '#ffffff', '#f6ede5'] },
  { family: 'linen', id: 'linen-paper-deep', tones: ['#a39082', '#e3d8cf', '#f0e8e1', '#f9f5f1', '#e9dfd8'], whiteDocumentTones: ['#af9c8e', '#e8ded6', '#f4ede7', '#ffffff', '#eee5df'] },
  { family: 'linen', id: 'linen-paper-soft', tones: ['#b5a395', '#ece3dc', '#f6f0eb', '#fcf9f6', '#f2ebe5'], whiteDocumentTones: ['#bfac9e', '#f0e9e2', '#f9f4f0', '#ffffff', '#f5efea'] },
  { family: 'ivory', id: 'ivory-paper-deep', tones: ['#948a77', '#e1d8c8', '#eee7db', '#faf7ef', '#e9e1d4'], whiteDocumentTones: ['#9f9582', '#e7dfd0', '#f2ecdf', '#ffffff', '#eee6da'] },
  { family: 'ivory', id: 'ivory-paper-soft', tones: ['#a89d89', '#ebe4d8', '#f5f0e7', '#fdfbf6', '#f1ece2'], whiteDocumentTones: ['#b3a894', '#efe8dd', '#f8f3eb', '#ffffff', '#f4efe7'] },
  { family: 'sand', id: 'sand-paper-deep', tones: ['#9f8668', '#e2d1bd', '#efe4d5', '#faf4ea', '#ebdccd'], whiteDocumentTones: ['#aa9274', '#e8d8c7', '#f3eadf', '#ffffff', '#efe2d5'] },
  { family: 'sand', id: 'sand-paper-soft', tones: ['#b49b7e', '#ecdfd0', '#f6eee3', '#fcf8f0', '#f2e7dc'], whiteDocumentTones: ['#bea68a', '#f0e5d7', '#f9f2e9', '#ffffff', '#f5ece3'] },

  { family: 'eucalyptus', id: 'eucalyptus-canvas-deep', tones: ['#647b73', '#c7d6d0', '#dfe8e3', '#f1f5f2', '#d3e0da'], whiteDocumentTones: ['#70877f', '#d0ddd8', '#e5ece8', '#ffffff', '#d9e5e0'] },
  { family: 'eucalyptus', id: 'eucalyptus-canvas-soft', tones: ['#7a9189', '#d4e0db', '#e8efec', '#f6f9f7', '#dfe9e5'], whiteDocumentTones: ['#859d95', '#dae6e1', '#edf3f1', '#ffffff', '#e4edea'] },
  { family: 'forest', id: 'forest-ledger-deep', tones: ['#4d6556', '#bed0c3', '#d9e3db', '#eef3ef', '#cad9cf'], whiteDocumentTones: ['#597262', '#c7d7cd', '#dee7e1', '#ffffff', '#d0dfd5'] },
  { family: 'forest', id: 'forest-ledger-soft', tones: ['#678171', '#ccdbd2', '#e3ebe5', '#f3f7f4', '#d8e4dd'], whiteDocumentTones: ['#728d7d', '#d3e1da', '#e8efea', '#ffffff', '#dde8e2'] },
  { family: 'jade', id: 'jade-harbor-deep', tones: ['#4f8074', '#bdd7cf', '#d9eae5', '#eef6f3', '#cbe0da'], whiteDocumentTones: ['#5c8d82', '#c7dfd8', '#dff0eb', '#ffffff', '#d2e6e0'] },
  { family: 'jade', id: 'jade-harbor-soft', tones: ['#669a8d', '#cce3dd', '#e4f0ec', '#f4faf8', '#d9ebe6'], whiteDocumentTones: ['#71a699', '#d3e8e3', '#e9f4f0', '#ffffff', '#dff0eb'] },

  { family: 'slate', id: 'slate-paper-deep', tones: ['#5c6977', '#c4ced8', '#dde4eb', '#f1f4f7', '#d1d9e0'], whiteDocumentTones: ['#687584', '#ccd5dd', '#e3e9ef', '#ffffff', '#d7dfe6'] },
  { family: 'slate', id: 'slate-paper-soft', tones: ['#71808f', '#d2dae1', '#e7edf1', '#f6f8fa', '#dfe6eb'], whiteDocumentTones: ['#7c8b9a', '#d9e0e6', '#ecf1f4', '#ffffff', '#e4ebef'] },
  { family: 'steel', id: 'steel-paper-deep', tones: ['#62717d', '#c8d2db', '#e0e7ed', '#f2f5f8', '#d4dde4'], whiteDocumentTones: ['#6d7c89', '#d0d9e0', '#e6ecf1', '#ffffff', '#dae2e8'] },
  { family: 'steel', id: 'steel-paper-soft', tones: ['#788794', '#d4dce3', '#e8edf2', '#f7f9fb', '#e0e6eb'], whiteDocumentTones: ['#83909d', '#dae1e7', '#edf2f5', '#ffffff', '#e5ebef'] },
  { family: 'dusk', id: 'dusk-paper-deep', tones: ['#6e748d', '#cfd3e2', '#e3e6f0', '#f3f4f8', '#dbdeea'], whiteDocumentTones: ['#797f98', '#d6d9e7', '#e8eaf3', '#ffffff', '#e0e3ee'] },
  { family: 'dusk', id: 'dusk-paper-soft', tones: ['#858aa4', '#dbe0ea', '#eceef5', '#f8f9fc', '#e5e7f1'], whiteDocumentTones: ['#9095ae', '#e0e4ee', '#f0f2f7', '#ffffff', '#e9ebf4'] },

  { family: 'mauve', id: 'mauve-study-deep', tones: ['#877a8d', '#d7cfda', '#e9e4ea', '#f6f2f6', '#e1dbe3'], whiteDocumentTones: ['#928598', '#ddd6df', '#eeeaee', '#ffffff', '#e6e1e8'] },
  { family: 'mauve', id: 'mauve-study-soft', tones: ['#9b8ea1', '#e0d9e3', '#f0ecf1', '#faf7fa', '#e8e2ea'], whiteDocumentTones: ['#a699ac', '#e5dfe8', '#f3eff4', '#ffffff', '#ede8ee'] },
  { family: 'brick', id: 'brick-fresco-deep', tones: ['#8d5b4f', '#d7bbb3', '#ead7d2', '#f5ebe8', '#dfcbc5'], whiteDocumentTones: ['#99675b', '#dec4bd', '#efdfdb', '#ffffff', '#e4d3ce'] },
  { family: 'brick', id: 'brick-fresco-soft', tones: ['#a66f62', '#e1cbc4', '#f0e2dd', '#f8f1ee', '#e9d8d3'], whiteDocumentTones: ['#b17b6e', '#e7d3cd', '#f4e8e4', '#ffffff', '#eddeD9'] },
  { family: 'sepia', id: 'sepia-ledger-deep', tones: ['#7f6951', '#cfbfae', '#e5d9cb', '#f4ede5', '#dccfbe'], whiteDocumentTones: ['#8b755d', '#d8c9b9', '#ebe1d5', '#ffffff', '#e1d6c8'] },
  { family: 'sepia', id: 'sepia-ledger-soft', tones: ['#967f67', '#ddd1c3', '#efe7dc', '#f8f4ee', '#e7ddd1'], whiteDocumentTones: ['#a18b73', '#e3d8cb', '#f3ece3', '#ffffff', '#ece4d9'] },
  { family: 'walnut', id: 'walnut-ledger-deep', tones: ['#6e5a48', '#c7baab', '#e0d6cb', '#f1ebe4', '#d6cbbf'], whiteDocumentTones: ['#7a6553', '#d0c4b6', '#e7ddd4', '#ffffff', '#ddd3c8'] },
  { family: 'walnut', id: 'walnut-ledger-soft', tones: ['#856f5d', '#d6ccc1', '#ebe3db', '#f7f3ee', '#e1d8cf'], whiteDocumentTones: ['#907a68', '#ddd4ca', '#f0e9e2', '#ffffff', '#e7dfd7'] }
] as const;

export const WORKSPACE_SURFACE_DARK_MANUAL_PALETTES: readonly WorkspaceSurfaceManualPaletteDefinition[] = [
  { family: 'graphite', id: 'dark-graphite-study', tones: ['#1c1d1c', '#242624', '#2c2f2b', '#151615', '#343832'], whiteDocumentTones: ['#1c1d1c', '#242624', '#2c2f2b', '#151615', '#343832'] },
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
