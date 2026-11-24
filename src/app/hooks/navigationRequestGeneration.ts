// One counter shared by every navigation entry. A cold-note open that waits for its body only switches if no other
// navigation started meanwhile, so a late read cannot pull the view back to a note the user already left.
let generation = 0;

export function nextNavigationGeneration() {
  generation += 1;
  return generation;
}

export function isNavigationGenerationCurrent(token: number) {
  return generation === token;
}
