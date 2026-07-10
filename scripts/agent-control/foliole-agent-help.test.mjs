import { describe, expect, it } from 'vitest';

import { runAgentCli } from './foliole-agent.mjs';

describe('foliole agent cli discovery', () => {
  it('describes commands from the route registry without exposing session details', async () => {
    const result = await runAgentCli(['help', '--json'], {
      env: { FOLIOLE_AGENT_DESCRIPTOR: 'C:\\secret\\descriptor.json' }
    });

    expect(result.status).toBe(0);
    expect(result.output).toMatchObject({ name: 'foliole', version: 1 });
    expect(result.output.commands).toContainEqual(expect.objectContaining({
      access: 'read',
      name: 'materials/read'
    }));
    expect(result.output.commands).toContainEqual(expect.objectContaining({
      access: 'write',
      name: 'materials/update'
    }));
    const names = result.output.commands.map((command) => command.name);
    expect(names).toEqual(expect.arrayContaining([
      'materials/create', 'materials/move', 'materials/restore',
      'virtual-folders/update', 'virtual-folders/delete-soft'
    ]));
    expect(names).not.toContain('auth/verify');
    expect(JSON.stringify(result.output)).not.toContain('descriptor');
    expect(JSON.stringify(result.output)).not.toContain('secret');
    expect(await runAgentCli(['help'])).toEqual({
      output: { error: 'invalid_help_arguments' }, status: 2
    });
  });
});
