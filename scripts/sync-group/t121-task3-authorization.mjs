import { createHash } from 'node:crypto';

export function authorizationDigest(request) {
  return createHash('sha256').update(JSON.stringify(request.boundary)).digest('hex');
}

export function createTask3Authorization(candidate) {
  const request = { boundary: { candidate, mutations: [
    'protect A, B, and isolated C before mutation',
    'reset only isolated Windows C to its already-empty product workspace',
    'let Android B approve Windows C into the existing Sync Group',
    'create one product Topic on A, one product Capture on B, and one product Topic on C'
  ], schemaVersion: 1 } };
  request.authorizationDigest = authorizationDigest(request);
  return request;
}
