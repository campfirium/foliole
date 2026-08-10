/* global process */

export async function runTask3Stage({ label, now = Date.now, run,
  write = (value) => process.stdout.write(value) }) {
  const startedAt = now();
  write(`[t121-task3] stage=${label} status=started\n`);
  try {
    const result = await run();
    write(`[t121-task3] stage=${label} status=completed durationMs=${now() - startedAt}\n`);
    return result;
  } catch (error) {
    write(`[t121-task3] stage=${label} status=failed durationMs=${now() - startedAt}\n`);
    throw error;
  }
}
