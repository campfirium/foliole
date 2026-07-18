import { describe, expect, it } from 'vitest';

import { runAgentCli } from './foliole-agent.mjs';

describe('foliole agent cli discovery', () => {
  it('reports product, CLI contract, and Agent Control protocol versions without a session', async () => {
    await expect(runAgentCli(['--version'], { env: {}, productVersion: '0.6.5' })).resolves.toEqual({
      output: {
        agent_control_protocol_version: 1,
        cli_contract_version: 1,
        name: 'foliole',
        product_version: '0.6.5'
      },
      status: 0
    });
  });

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
      arguments: { optional: ['content', 'title'], required: ['id', 'expected-updated-at'] },
      name: 'materials/update'
    }));
    const names = result.output.commands.map((command) => command.name);
    expect(names).toEqual(expect.arrayContaining([
      'materials/create', 'materials/move', 'materials/restore',
      'virtual-folders/update', 'virtual-folders/delete-soft'
    ]));
    expect(names).not.toContain('auth/verify');
    expect(JSON.stringify(result.output)).not.toContain('C:\\secret\\descriptor.json');
    expect(JSON.stringify(result.output)).not.toContain('secret');
  });

  it('supports conventional global help without a running Foliole session', async () => {
    for (const argv of [[], ['help'], ['--help'], ['-h']]) {
      const result = await runAgentCli(argv, { env: {} });
      expect(result.status).toBe(0);
      expect(result.output).toContain('Foliole CLI');
      expect(result.output).toContain('foliole <command> [options]');
      expect(result.output).toContain('materials/update');
      expect(result.output).toContain('Keep the Foliole desktop app running');
      expect(result.output).toContain('Exit codes:');
    }
  });

  it('documents command arguments and write safety in human and JSON forms', async () => {
    const human = await runAgentCli(['materials/update', '--help'], { env: {} });
    expect(human.status).toBe(0);
    expect(human.output).toContain('Updates only the supplied title or content');
    expect(human.output).toContain('--expected-updated-at');
    expect(human.output).toContain('--backup-dir <path>');
    expect(human.output).toContain('latest materials/read');

    const json = await runAgentCli(['help', 'virtual-folders', 'reorder', '--json'], { env: {} });
    expect(json.status).toBe(0);
    expect(json.output).toMatchObject({ access: 'write', name: 'virtual-folders/reorder' });
    expect(json.output.notes.join(' ')).toContain('every currently visible Topic ID exactly once');
  });

  it('lists command groups and accepts nested command aliases', async () => {
    const group = await runAgentCli(['materials', '--help'], { env: {} });
    expect(group.status).toBe(0);
    expect(group.output).toContain('Foliole Topics and Folders');
    expect(group.output).not.toContain('virtual-folders/list');

    const descriptor = '/tmp/foliole-help-descriptor.json';
    const calls = [];
    const result = await runAgentCli(['materials', 'search', '--descriptor', descriptor, '--query', 'FSRS'], {
      readFile: undefined,
      fetch: async (url) => {
        calls.push(url);
        return { json: async () => ({ results: [] }), ok: true };
      }
    });
    expect(result).toEqual({ output: { error: 'session_unavailable' }, status: 3 });
    expect(calls).toHaveLength(0);
  });

  it('rejects unknown or malformed help topics without reading a session', async () => {
    expect(await runAgentCli(['help', 'missing'], { env: {} })).toEqual({
      output: { error: 'unknown_help_topic', topic: 'missing' }, status: 2
    });
    expect(await runAgentCli(['help', 'materials', 'update', 'extra'], { env: {} })).toEqual({
      output: { error: 'invalid_help_arguments' }, status: 2
    });
  });
});
