export interface WorkspaceSurfaceColorValue {
  a: number;
  b: number;
  g: number;
  r: number;
}

function clampByte(value: number) {
  return Math.min(255, Math.max(0, Math.round(value)));
}

function clampPercentage(value: number, max: number) {
  return Math.min(max, Math.max(0, value));
}

function toHex(value: number) {
  return clampByte(value).toString(16).padStart(2, '0');
}

function parseHexPair(value: string) {
  return Number.parseInt(value, 16);
}

function hueToRgb(p: number, q: number, t: number) {
  let next = t;
  if (next < 0) {
    next += 1;
  }
  if (next > 1) {
    next -= 1;
  }
  if (next < 1 / 6) {
    return p + (q - p) * 6 * next;
  }
  if (next < 1 / 2) {
    return q;
  }
  if (next < 2 / 3) {
    return p + (q - p) * (2 / 3 - next) * 6;
  }
  return p;
}

export function parseWorkspaceSurfaceColor(value: string): WorkspaceSurfaceColorValue | null {
  const normalized = value.trim().toLowerCase();
  const hex = normalized.startsWith('#') ? normalized.slice(1) : normalized;
  if (/^[0-9a-f]{6}$/.test(hex)) {
    return {
      a: 1,
      b: parseHexPair(hex.slice(4, 6)),
      g: parseHexPair(hex.slice(2, 4)),
      r: parseHexPair(hex.slice(0, 2))
    };
  }
  if (/^[0-9a-f]{8}$/.test(hex)) {
    return {
      a: parseHexPair(hex.slice(6, 8)) / 255,
      b: parseHexPair(hex.slice(4, 6)),
      g: parseHexPair(hex.slice(2, 4)),
      r: parseHexPair(hex.slice(0, 2))
    };
  }
  return null;
}

export function formatWorkspaceSurfaceColorHex(color: WorkspaceSurfaceColorValue) {
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

export function formatWorkspaceSurfaceColorCss(color: WorkspaceSurfaceColorValue) {
  const hex = formatWorkspaceSurfaceColorHex(color);
  if (color.a >= 0.999) {
    return hex;
  }
  return `${hex}${toHex(color.a * 255)}`;
}

export function withWorkspaceSurfaceAlpha(color: WorkspaceSurfaceColorValue, alphaPercent: number) {
  return { ...color, a: clampPercentage(alphaPercent, 100) / 100 };
}

export function withWorkspaceSurfaceHex(color: WorkspaceSurfaceColorValue, hexValue: string) {
  const parsed = parseWorkspaceSurfaceColor(hexValue);
  if (!parsed) {
    return color;
  }
  return { ...parsed, a: color.a };
}

export function workspaceSurfaceColorToHsl(color: WorkspaceSurfaceColorValue) {
  const red = clampByte(color.r) / 255;
  const green = clampByte(color.g) / 255;
  const blue = clampByte(color.b) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;

  if (max === min) {
    return { h: 0, l: Math.round(lightness * 100), s: 0 };
  }

  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue = 0;

  if (max === red) {
    hue = (green - blue) / delta + (green < blue ? 6 : 0);
  } else if (max === green) {
    hue = (blue - red) / delta + 2;
  } else {
    hue = (red - green) / delta + 4;
  }

  return {
    h: Math.round((hue / 6) * 360) % 360,
    l: Math.round(lightness * 100),
    s: Math.round(saturation * 100)
  };
}

export function workspaceSurfaceColorFromHsl(input: { a: number; h: number; l: number; s: number }) {
  const hue = ((input.h % 360) + 360) % 360 / 360;
  const saturation = clampPercentage(input.s, 100) / 100;
  const lightness = clampPercentage(input.l, 100) / 100;

  if (saturation === 0) {
    const gray = clampByte(lightness * 255);
    return { a: input.a, b: gray, g: gray, r: gray };
  }

  const q = lightness < 0.5
    ? lightness * (1 + saturation)
    : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;

  return {
    a: input.a,
    b: clampByte(hueToRgb(p, q, hue - 1 / 3) * 255),
    g: clampByte(hueToRgb(p, q, hue) * 255),
    r: clampByte(hueToRgb(p, q, hue + 1 / 3) * 255)
  };
}

export function workspaceSurfaceColorToHsv(color: WorkspaceSurfaceColorValue) {
  const red = clampByte(color.r) / 255;
  const green = clampByte(color.g) / 255;
  const blue = clampByte(color.b) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;

  if (delta !== 0) {
    if (max === red) {
      hue = (green - blue) / delta + (green < blue ? 6 : 0);
    } else if (max === green) {
      hue = (blue - red) / delta + 2;
    } else {
      hue = (red - green) / delta + 4;
    }
  }

  return {
    h: Math.round((hue / 6) * 360) % 360,
    s: max === 0 ? 0 : Math.round((delta / max) * 100),
    v: Math.round(max * 100)
  };
}

export function workspaceSurfaceColorFromHsv(input: { a: number; h: number; s: number; v: number }) {
  const hue = ((input.h % 360) + 360) % 360;
  const saturation = clampPercentage(input.s, 100) / 100;
  const value = clampPercentage(input.v, 100) / 100;
  const chroma = value * saturation;
  const segment = hue / 60;
  const second = chroma * (1 - Math.abs((segment % 2) - 1));
  const match = value - chroma;

  let red = 0;
  let green = 0;
  let blue = 0;

  if (segment >= 0 && segment < 1) {
    red = chroma;
    green = second;
  } else if (segment < 2) {
    red = second;
    green = chroma;
  } else if (segment < 3) {
    green = chroma;
    blue = second;
  } else if (segment < 4) {
    green = second;
    blue = chroma;
  } else if (segment < 5) {
    red = second;
    blue = chroma;
  } else {
    red = chroma;
    blue = second;
  }

  return {
    a: input.a,
    b: clampByte((blue + match) * 255),
    g: clampByte((green + match) * 255),
    r: clampByte((red + match) * 255)
  };
}

export function sanitizeWorkspaceSurfaceColor(value: string, fallback: string) {
  const parsed = parseWorkspaceSurfaceColor(value);
  if (!parsed) {
    return fallback;
  }
  return formatWorkspaceSurfaceColorCss(parsed);
}
