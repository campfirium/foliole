import { COMPANION_CUSTOM_CSS_VERSION, type CompanionCustomCssCollection } from './companionCustomCssModel';

const sourceCss = `/* Foliole mobile CSS example
 * Change the values below, then save and enable this snippet.
 * These rules apply to the Topic reading body.
 * Hex colors like #336699 work here. Use a unit such as em
 * for font size and a number without a unit for line height.
 */

/* Level 1 heading (#) */
.cm-line-h1 { color: #4f7fd1; }

/* Level 2 heading (##) */
.cm-line-h2 { color: #708fc9; }

/* Level 3 heading (###) */
.cm-line-h3 { color: var(--role-accent); }

/* Smaller headings (#### through ######) */
.cm-line-h4,
.cm-line-h5,
.cm-line-h6 { color: var(--role-text); }

/* Body paragraphs */
.cm-line.cm-line-paragraph {
  font-size: 1.05em;
  line-height: 1.65;
}

/* Block quotes (>) */
.cm-line.cm-line-quote { border-left-color: var(--role-accent); }
`;

export function createCompanionCustomCssStarterCollection(): CompanionCustomCssCollection {
  return {
    snippets: [{
      enabled: false,
      id: '1c04d8dc-1acd-465b-b20a-697905a080ce',
      name: 'CSS Example',
      sourceCss
    }],
    version: COMPANION_CUSTOM_CSS_VERSION
  };
}
