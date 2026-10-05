export const FRAMED_SIMULATOR_ITEM_COUNTS = [300, 1_000, 10_000] as const;

export type FramedSimulatorItemCount = typeof FRAMED_SIMULATOR_ITEM_COUNTS[number];
export type FramedSimulatorStage =
  | 'applied'
  | 'authenticated'
  | 'framed'
  | 'receipt_committed'
  | 'staged';

export type FramedSimulatorStageCounts = Readonly<Record<FramedSimulatorStage, number>>;

export interface RssSampler {
  sampleBytes(): number;
}

export type FramedSimulatorCostSample = Readonly<{
  endingRssBytes: number;
  itemCount: FramedSimulatorItemCount;
  peakRssBytes: number;
  rssDeltaBytes: number;
  stageCounts: FramedSimulatorStageCounts;
  startingRssBytes: number;
}>;

type MutableStageCounts = Record<FramedSimulatorStage, number>;

function emptyStageCounts(): MutableStageCounts {
  return {
    applied: 0,
    authenticated: 0,
    framed: 0,
    receipt_committed: 0,
    staged: 0
  };
}

function checkedRssSample(sampler: RssSampler) {
  const value = sampler.sampleBytes();
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('rss_sample_invalid');
  return value;
}

export class ProcessRssSampler implements RssSampler {
  sampleBytes() {
    return process.memoryUsage().rss;
  }
}

export async function measureFramedSimulatorCosts(args: {
  rssSampler: RssSampler;
  run: (context: Readonly<{
    increment: (stage: FramedSimulatorStage, count?: number) => void;
    itemCount: FramedSimulatorItemCount;
    sampleRss: () => number;
  }>) => Promise<void>;
}) {
  const samples: FramedSimulatorCostSample[] = [];
  for (const itemCount of FRAMED_SIMULATOR_ITEM_COUNTS) {
    const stageCounts = emptyStageCounts();
    const startingRssBytes = checkedRssSample(args.rssSampler);
    let peakRssBytes = startingRssBytes;
    const sampleRss = () => {
      const sample = checkedRssSample(args.rssSampler);
      peakRssBytes = Math.max(peakRssBytes, sample);
      return sample;
    };
    const increment = (stage: FramedSimulatorStage, count = 1) => {
      if (!Number.isSafeInteger(count) || count < 0) throw new Error('stage_count_increment_invalid');
      stageCounts[stage] += count;
    };
    await args.run({ increment, itemCount, sampleRss });
    const endingRssBytes = sampleRss();
    samples.push({
      endingRssBytes,
      itemCount,
      peakRssBytes,
      rssDeltaBytes: endingRssBytes - startingRssBytes,
      stageCounts: { ...stageCounts },
      startingRssBytes
    });
  }
  return samples;
}
