import {
  getWordPressSiteKind,
  isWordPressApplicationPasswordValid,
  normalizeWordPressApplicationPassword,
  normalizeWordPressSiteUrl
} from '../../lib/core/wordpress/wordpressConnectionInput.js';
import type {
  NativeWordPressPostStatus,
  NativeWordPressPublishAdapter
} from '../../lib/platform/nativeWordPressPublishContract.js';

import { createXmlRpcCall, parseXmlRpcResponse, type XmlRpcValue } from './xmlRpcCodec.js';

export interface WordPressCredential {
  adapter: NativeWordPressPublishAdapter;
  applicationPassword: string;
  siteUrl: string;
  username: string;
}

export interface VerifiedWordPressSite {
  adapter: NativeWordPressPublishAdapter;
  blogId: string | null;
  endpoint: string;
  siteUrl: string;
}

export interface WordPressClientConfig extends VerifiedWordPressSite {
  credential: WordPressCredential;
}

interface WordPressPostInput {
  content: string;
  status: NativeWordPressPostStatus;
  title: string;
}

export function resolveWordPressAdapter(siteUrl: string): NativeWordPressPublishAdapter {
  return getWordPressSiteKind(siteUrl) === 'wordpressCom'
    ? 'wordpress_com_xmlrpc'
    : 'core_rest';
}

function buildBasicAuthorization(credential: Pick<WordPressCredential, 'applicationPassword' | 'username'>) {
  return `Basic ${Buffer.from(`${credential.username}:${credential.applicationPassword}`).toString('base64')}`;
}

async function fetchWordPress(input: string, init: RequestInit, errorMessage: string) {
  try {
    return await fetch(input, { ...init, redirect: 'error' });
  } catch {
    throw new Error(errorMessage);
  }
}

async function readCoreJson(response: Response, errorMessage: string) {
  if (!response.ok) throw new Error(`${errorMessage} (${response.status})`);
  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    throw new Error('WordPress returned an invalid REST response.');
  }
}

async function callXmlRpc(endpoint: string, method: string, params: XmlRpcValue[]) {
  const response = await fetchWordPress(endpoint, {
    body: createXmlRpcCall(method, params),
    headers: { 'Content-Type': 'text/xml' },
    method: 'POST'
  }, 'The WordPress.com site is not responding.');
  if (!response.ok) throw new Error(`WordPress.com XML-RPC request failed (${response.status}).`);
  const text = await response.text();
  try {
    return parseXmlRpcResponse(text);
  } catch {
    throw new Error('WordPress.com rejected the XML-RPC request. Check the application password and try again.');
  }
}

function toRecord(value: XmlRpcValue): Record<string, XmlRpcValue> | null {
  return value && typeof value === 'object' && !Array.isArray(value) && !Buffer.isBuffer(value)
    ? value as Record<string, XmlRpcValue>
    : null;
}

async function readWordPressComSiteId(siteUrl: string) {
  const hostname = new URL(siteUrl).hostname;
  const endpoint = `https://public-api.wordpress.com/rest/v1.1/sites/${encodeURIComponent(hostname)}`;
  const response = await fetchWordPress(endpoint, { method: 'GET' }, 'WordPress.com could not resolve the requested site.');
  const site = await readCoreJson(response, 'WordPress.com could not resolve the requested site');
  const siteId = site.ID;
  if (typeof siteId !== 'string' && typeof siteId !== 'number') {
    throw new Error('WordPress.com did not return the requested site ID.');
  }
  return String(siteId);
}

async function verifyWordPressComSite(siteUrl: string, username: string, applicationPassword: string) {
  const endpoint = `${siteUrl}/xmlrpc.php`;
  const requestedBlogId = await readWordPressComSiteId(siteUrl);
  const result = await callXmlRpc(endpoint, 'wp.getOptions', [
    Number(requestedBlogId), username, applicationPassword, ['blog_title', 'home_url', 'siteurl']
  ]);
  if (!toRecord(result)) throw new Error('WordPress.com did not return the requested site settings.');
  return { adapter: 'wordpress_com_xmlrpc' as const, blogId: requestedBlogId, endpoint, siteUrl };
}

async function verifyCoreSite(siteUrl: string, username: string, applicationPassword: string) {
  const endpoint = `${siteUrl}/wp-json/wp/v2`;
  const response = await fetchWordPress(`${endpoint}/users/me?context=edit`, {
    headers: { Authorization: buildBasicAuthorization({ applicationPassword, username }) },
    method: 'GET'
  }, 'The WordPress site is not responding.');
  const user = await readCoreJson(response, 'WordPress Application Password authentication failed');
  if (typeof user.id !== 'number') throw new Error('WordPress did not return the connected user.');
  return { adapter: 'core_rest' as const, blogId: null, endpoint, siteUrl };
}

export async function verifyWordPressConnection(input: {
  applicationPassword: string;
  siteUrl: string;
  username: string;
}): Promise<VerifiedWordPressSite> {
  const siteUrl = normalizeWordPressSiteUrl(input.siteUrl);
  const username = input.username.trim();
  const applicationPassword = normalizeWordPressApplicationPassword(input.applicationPassword);
  if (!username || !applicationPassword) throw new Error('Enter a username and Application Password.');
  const siteKind = getWordPressSiteKind(siteUrl);
  if (!isWordPressApplicationPasswordValid(applicationPassword, siteKind)) {
    throw new Error(siteKind === 'wordpressCom'
      ? 'Enter the complete 16-character WordPress.com Application Password.'
      : 'Enter the complete 24-character WordPress Application Password.');
  }
  return resolveWordPressAdapter(siteUrl) === 'wordpress_com_xmlrpc'
    ? verifyWordPressComSite(siteUrl, username, applicationPassword)
    : verifyCoreSite(siteUrl, username, applicationPassword);
}

async function writeCorePost(config: WordPressClientConfig, input: WordPressPostInput, postId?: string) {
  const response = await fetchWordPress(`${config.endpoint}/posts${postId ? `/${postId}` : ''}`, {
    body: JSON.stringify(input),
    headers: {
      Authorization: buildBasicAuthorization(config.credential),
      'Content-Type': 'application/json'
    },
    method: 'POST'
  }, 'The WordPress site is not responding.');
  const post = await readCoreJson(response, 'WordPress could not save the post');
  if ((typeof post.id !== 'number' && typeof post.id !== 'string') || typeof post.link !== 'string') {
    throw new Error('WordPress did not return the saved post.');
  }
  return { postId: String(post.id), url: post.link };
}

async function readXmlRpcPost(config: WordPressClientConfig, postId: string) {
  const credential = config.credential;
  const value = await callXmlRpc(config.endpoint, 'wp.getPost', [
    Number(config.blogId ?? 0), credential.username, credential.applicationPassword, parseXmlRpcPostId(postId)
  ]);
  const post = toRecord(value);
  const url = post?.link;
  if (typeof url !== 'string') throw new Error('WordPress.com did not return the saved post URL.');
  return { postId, url };
}

function parseXmlRpcPostId(postId: string) {
  const value = Number(postId);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('WordPress.com returned an invalid post ID.');
  return value;
}

async function writeXmlRpcPost(config: WordPressClientConfig, input: WordPressPostInput, postId?: string) {
  const credential = config.credential;
  const content = {
    post_content: input.content,
    post_status: input.status,
    post_title: input.title,
    post_type: 'post'
  };
  const common: XmlRpcValue[] = [Number(config.blogId ?? 0), credential.username, credential.applicationPassword];
  const result = postId
    ? await callXmlRpc(config.endpoint, 'wp.editPost', [...common, parseXmlRpcPostId(postId), content])
    : await callXmlRpc(config.endpoint, 'wp.newPost', [...common, content]);
  if (postId && result !== true) throw new Error('WordPress.com did not confirm the post update.');
  const savedPostId = postId ?? (typeof result === 'string' || typeof result === 'number' ? String(result) : '');
  if (!savedPostId) throw new Error('WordPress.com did not return the saved post ID.');
  return readXmlRpcPost(config, savedPostId);
}

export function writeWordPressPost(config: WordPressClientConfig, input: WordPressPostInput, postId?: string) {
  return config.adapter === 'core_rest'
    ? writeCorePost(config, input, postId)
    : writeXmlRpcPost(config, input, postId);
}
