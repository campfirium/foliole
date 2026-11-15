import { URL } from 'node:url';
import { runGh } from './github-monitor-gh.mjs';

const replyFields = 'id createdAt url author { login ... on User { databaseId } }';
const pageFields = 'pageInfo { hasNextPage endCursor }';

function graphqlPages(query, variables, select, stop = () => false) {
  const rows = [];
  let cursor = variables.cursor;
  do {
    const args = Object.entries({ ...variables, cursor })
      .filter(([, value]) => value !== undefined)
      .flatMap(([key, value]) => [typeof value === 'number' ? '-F' : '-f', `${key}=${value}`]);
    const page = select(runGh(['api', 'graphql', '-f', `query=${query}`, ...args])?.data);
    if (!page?.nodes || !page.pageInfo) throw new Error('GitHub did not return a comment page');
    rows.push(...page.nodes);
    cursor = page.pageInfo.hasNextPage && !stop(page.nodes) ? page.pageInfo.endCursor : null;
  } while (cursor);
  return rows;
}

export function listIssueReplies(repository, since) {
  const endpoint = `repos/${repository}/issues/comments?since=${encodeURIComponent(since)}&per_page=100`;
  return runGh(['api', '--paginate', '--slurp', endpoint]).flat()
    .filter((row) => new URL(row.html_url).pathname.includes('/issues/'))
    .map((row) => ({
      id: String(row.id), createdAt: row.created_at, url: row.html_url, login: row.user?.login, authorId: row.user?.id,
      parentUrl: row.html_url.split('#')[0], number: Number(row.issue_url.split('/').at(-1))
    }));
}

export function listDiscussionReplies(repository, since) {
  const [owner, repo] = repository.split('/');
  const variables = { owner, repo };
  const changed = graphqlPages(`query($owner: String!, $repo: String!, $cursor: String) {
    repository(owner: $owner, name: $repo) {
      discussions(first: 50, after: $cursor, orderBy: {field: UPDATED_AT, direction: DESC}) {
        nodes { number title url updatedAt }
        ${pageFields}
      }
    }
  }`, variables, (data) => data?.repository?.discussions,
  (nodes) => nodes.some(({ updatedAt }) => updatedAt < since));
  return changed.filter(({ updatedAt }) => updatedAt >= since).flatMap((discussion) =>
    discussionComments(variables, discussion.number).map((row) => ({
      id: row.id, createdAt: row.createdAt, url: row.url, login: row.author?.login, authorId: row.author?.databaseId,
      title: discussion.title, parentUrl: discussion.url, number: discussion.number
    })));
}

function discussionComments(variables, number) {
  const comments = graphqlPages(`query($owner: String!, $repo: String!, $number: Int!, $cursor: String) {
    repository(owner: $owner, name: $repo) {
      discussion(number: $number) {
        comments(first: 50, after: $cursor) {
          nodes { ${replyFields} replies(first: 30) { nodes { ${replyFields} } ${pageFields} } }
          ${pageFields}
        }
      }
    }
  }`, { ...variables, number }, (data) => data?.repository?.discussion?.comments);
  return comments.flatMap((comment) => {
    const replies = comment.replies.pageInfo.hasNextPage ? graphqlPages(`query($id: ID!, $cursor: String) {
      node(id: $id) { ... on DiscussionComment {
        replies(first: 100, after: $cursor) { nodes { ${replyFields} } ${pageFields} }
      } }
    }`, { id: comment.id, cursor: comment.replies.pageInfo.endCursor }, (data) => data?.node?.replies) :
      [];
    return [comment, ...comment.replies.nodes, ...replies];
  });
}
