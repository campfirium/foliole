import { READING_FONT_WEIGHT_DEFAULT, READING_FONT_WEIGHT_MAX, READING_FONT_WEIGHT_MIN, READING_FONT_WEIGHT_STEP } from './readingFontWeight';

const SAMPLE = 'AaBbFoliole0123中文阅读';
const WIDTH = 440;
const HEIGHT = 48;
const CANDIDATES = Array.from({ length: (READING_FONT_WEIGHT_MAX - READING_FONT_WEIGHT_MIN) / READING_FONT_WEIGHT_STEP + 1 },
  (_, index) => READING_FONT_WEIGHT_MIN + index * READING_FONT_WEIGHT_STEP);
const PREFERRED = [400, 700, 100, 200, 300, 500, 600];

export function distinctReadingWeights(samples: Array<{ weight: number; alpha: Uint8ClampedArray }>) {
  const groups: typeof samples[] = [];
  for (const sample of samples) {
    const group = groups.find(([first]) => first !== undefined && first.alpha.length === sample.alpha.length
      && first.alpha.every((value, index) => value === sample.alpha[index]));
    if (group) group.push(sample);
    else groups.push([sample]);
  }
  return groups.map((group) => PREFERRED.find((weight) => group.some((sample) => sample.weight === weight))
    ?? group[0]!.weight).sort((left, right) => left - right);
}

export function nearestReadingWeight(value: number, weights: readonly number[]) {
  return weights.reduce((nearest, weight) => Math.abs(weight - value) < Math.abs(nearest - value) ? weight : nearest,
    weights.includes(READING_FONT_WEIGHT_DEFAULT) ? READING_FONT_WEIGHT_DEFAULT : weights[0] ?? READING_FONT_WEIGHT_DEFAULT);
}

export function adjacentReadingWeight(value: number, weights: readonly number[], direction: number) {
  return direction > 0 ? weights.find((weight) => weight > value) ?? weights.at(-1) ?? value
    : [...weights].reverse().find((weight) => weight < value) ?? weights[0] ?? value;
}

function readAlpha(context: CanvasRenderingContext2D, family: string, weight: number) {
  context.clearRect(0, 0, WIDTH, HEIGHT);
  context.font = `${weight} 24px ${family}`;
  context.fillText(SAMPLE, 4, 32);
  const pixels = context.getImageData(0, 0, WIDTH, HEIGHT).data;
  const alpha = new Uint8ClampedArray(WIDTH * HEIGHT);
  for (let index = 0; index < alpha.length; index += 1) alpha[index] = pixels[index * 4 + 3]!;
  return { alpha, weight };
}

// Detect distinct rendered requests for this sample and fallback stack, not font metadata.
export async function probeReadingFontWeights(fontFamily: string, signal: AbortSignal) {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;font-synthesis-weight:none';
  canvas.style.fontFamily = fontFamily;
  document.body.append(canvas);
  try {
    const family = getComputedStyle(canvas).fontFamily;
    await Promise.all(CANDIDATES.map((weight) => document.fonts.load(`${weight} 24px ${family}`, SAMPLE)));
    signal.throwIfAborted();
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Reading font measurement unavailable');
    const samples = [];
    for (const weight of CANDIDATES) {
      signal.throwIfAborted();
      samples.push(readAlpha(context, family, weight));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    return distinctReadingWeights(samples);
  } finally {
    canvas.remove();
  }
}
