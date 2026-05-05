export type WorkspaceSurfaceAutoSeedPreset = {
  hex: string;
  id: string;
  label: string;
};

export const WORKSPACE_SURFACE_AUTO_SEED_PRESETS: readonly WorkspaceSurfaceAutoSeedPreset[] = [
  { id: 'gray', label: 'Gray', hex: '#7a7a7a' },
  { id: 'sage', label: 'Sage', hex: '#7f8f76' },
  { id: 'beige', label: 'Beige', hex: '#b39272' },
  { id: 'terracotta', label: 'Terracotta', hex: '#b9745f' },
  { id: 'amber', label: 'Amber', hex: '#b99754' },
  { id: 'olive', label: 'Olive', hex: '#8a962f' },
  { id: 'fern', label: 'Fern', hex: '#829b54' },
  { id: 'loden', label: 'Loden', hex: '#6f8c5d' },
  { id: 'teal', label: 'Teal', hex: '#5f8e8d' },
  { id: 'jade', label: 'Jade', hex: '#5d9683' },
  { id: 'blue', label: 'Blue', hex: '#6d88b0' },
  { id: 'slate-blue', label: 'Slate Blue', hex: '#7388a4' },
  { id: 'mist', label: 'Mist', hex: '#a5acb2' },
  { id: 'stone', label: 'Stone', hex: '#a69b90' },
  { id: 'sand', label: 'Sand', hex: '#bea27f' },
  { id: 'linen', label: 'Linen', hex: '#c0a98c' },
  { id: 'clay', label: 'Clay', hex: '#bb8f7f' },
  { id: 'peach', label: 'Peach', hex: '#cb9d8d' },
  { id: 'apricot', label: 'Apricot', hex: '#c99a78' },
  { id: 'ochre', label: 'Ochre', hex: '#bf9b5e' },
  { id: 'moss', label: 'Moss', hex: '#899c61' },
  { id: 'eucalyptus', label: 'Eucalyptus', hex: '#7c9b8f' },
  { id: 'sea', label: 'Sea', hex: '#6e99a0' },
  { id: 'sky', label: 'Sky', hex: '#82a3c2' },
  { id: 'dusk', label: 'Dusk', hex: '#8997b8' },
  { id: 'indigo', label: 'Indigo', hex: '#808dba' },
  { id: 'plum', label: 'Plum', hex: '#9785ac' },
  { id: 'mauve', label: 'Mauve', hex: '#ab8aa1' },
  { id: 'rose', label: 'Rose', hex: '#bb8da0' },
  { id: 'blush', label: 'Blush', hex: '#c69d9f' },
  { id: 'mulberry', label: 'Mulberry', hex: '#a17f8d' },
  { id: 'taupe', label: 'Taupe', hex: '#9a9189' },
  { id: 'ash', label: 'Ash', hex: '#8d949c' },
  { id: 'graphite', label: 'Graphite', hex: '#7f848a' },
  { id: 'silver', label: 'Silver', hex: '#aab0b5' }
] as const;
