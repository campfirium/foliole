import { listDiscussionReplies, listIssueReplies } from './github-handoff-reply-api.mjs';
import { recordMonitorError } from './github-monitor-gh.mjs';

const replyReaders = { discussion: listDiscussionReplies, issue: listIssueReplies };

export function collectReplyEvents(config, state, errors, now, readers = replyReaders) {
  const events = [];
  const checkpoints = {};
  if (!config?.enabled) return { events, checkpoints };

  const ownLogins = new Set((config.ownLogins ?? []).map((login) => login.toLowerCase()));
  const ownIds = new Set(config.ownUserIds ?? []);
  for (const [kind, read] of Object.entries(readers)) {
    const since = state.replyCheckpoints?.[kind];
    try {
      if (since) {
        events.push(...buildReplyEvents(config, kind, read(config.repository, since)
          .filter(({ createdAt, login, authorId }) => createdAt >= since && createdAt < now &&
            !ownLogins.has(login?.toLowerCase()) && !ownIds.has(authorId)), state.submitted));
      }
      checkpoints[kind] = now;
    } catch (error) {
      recordMonitorError(errors, 'foliole/github-reply', kind, error);
    }
  }
  return { events, checkpoints };
}

function buildReplyEvents(config, kind, replies, submitted) {
  const source = 'foliole/github-reply';
  return replies.flatMap((reply) => {
    const dedupeKey = `${source}:${config.repository}:${kind}:${reply.id}`;
    if (submitted[dedupeKey]) return [];
    const topic = kind === 'discussion' ? `D${reply.number}` : `Issue #${reply.number}`;
    return [{
      source,
      dedupeKey,
      title: `新回复 · ${topic}`,
      prompt: [
        `${topic} 收到 GitHub 新回复。`,
        `原帖：${reply.parentUrl}`,
        `回复：${reply.url}`,
        '请先等我确认。需要接回原聊天时，按原帖链接定位并核对原聊天，再把这条回复交给它。'
      ].join('\n'),
      ttlSeconds: config.defaultTtlSeconds
    }];
  });
}
