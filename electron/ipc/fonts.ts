export interface RuntimeSystemFontCatalog {
  fonts: string[];
  monospace_fonts: string[];
}

export function listSystemFonts(): RuntimeSystemFontCatalog {
  return {
    fonts: [],
    monospace_fonts: []
  };
}
