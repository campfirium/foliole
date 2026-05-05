import { expect, it } from 'vitest';

import { getWorkspaceSurfaceAutoPaletteChoices } from './workspaceSurfaceAutoPaletteChoices';
import { parseWorkspaceSurfaceColor, workspaceSurfaceColorToHsl } from './workspaceSurfaceColor';

function getLightness(value: string) {
  const parsed = parseWorkspaceSurfaceColor(value);
  expect(parsed).not.toBeNull();
  return workspaceSurfaceColorToHsl(parsed!).l;
}

it('keeps random palette column hierarchy stable while varying overall tone', () => {
  const choices = getWorkspaceSurfaceAutoPaletteChoices({
    documentPureWhite: false,
    folderTopicSharedTone: false
  });

  expect(choices.length).toBeGreaterThan(0);

  for (const choice of choices) {
    const [rail, folder, topic, document, sidebar] = choice.palette;
    const railL = getLightness(rail!);
    const folderL = getLightness(folder!);
    const topicL = getLightness(topic!);
    const documentL = getLightness(document!);
    const sidebarL = getLightness(sidebar!);

    expect(railL).toBeLessThan(folderL);
    expect(folderL).toBeLessThan(sidebarL);
    expect(sidebarL).toBeLessThan(topicL);
    expect(topicL).toBeLessThan(documentL);
    expect(folderL).toBeGreaterThanOrEqual(62);
    expect(sidebarL).toBeGreaterThanOrEqual(72);
  }
});
