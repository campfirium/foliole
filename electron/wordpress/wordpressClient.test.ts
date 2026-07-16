import { beforeEach, expect, it, vi } from 'vitest';

import { verifyWordPressConnection, writeWordPressPost } from './wordpressClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

it('verifies a Core-compatible site with HTTPS REST Application Password auth', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 7 }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200
  }));

  const result = await verifyWordPressConnection({
    applicationPassword: 'site-app-password',
    siteUrl: 'https://blog.example.com/',
    username: 'writer'
  });

  expect(result).toMatchObject({ adapter: 'core_rest', siteUrl: 'https://blog.example.com' });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0]![0]).toBe('https://blog.example.com/wp-json/wp/v2/users/me?context=edit');
  expect((fetchMock.mock.calls[0]![1]?.headers as Record<string, string>).Authorization).toMatch(/^Basic /u);
});

it('verifies a WordPress.com site by matching wp.getUsersBlogs without adapter fallback', async () => {
  const response = `<?xml version="1.0"?><methodResponse><params><param><value><array><data>
    <value><struct><member><name>blogid</name><value><string>91</string></value></member>
    <member><name>url</name><value><string>https://free-site.wordpress.com/</string></value></member></struct></value>
  </data></array></value></param></params></methodResponse>`;
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(response, { status: 200 }));

  const result = await verifyWordPressConnection({
    applicationPassword: 'account-app-password',
    siteUrl: 'https://free-site.wordpress.com',
    username: 'account-name'
  });

  expect(result).toEqual({
    adapter: 'wordpress_com_xmlrpc',
    blogId: '91',
    endpoint: 'https://free-site.wordpress.com/xmlrpc.php',
    siteUrl: 'https://free-site.wordpress.com'
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0]![1]?.body as string).toContain('<methodName>wp.getUsersBlogs</methodName>');
});

it('creates then updates through XML-RPC using the supplied post id', async () => {
  const xml = (value: string) => `<?xml version="1.0"?><methodResponse><params><param>${value}</param></params></methodResponse>`;
  const fetchMock = vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(xml('<value><string>123</string></value>')))
    .mockResolvedValueOnce(new Response(xml('<value><struct><member><name>link</name><value><string>https://free-site.wordpress.com/post</string></value></member></struct></value>')))
    .mockResolvedValueOnce(new Response(xml('<value><boolean>1</boolean></value>')))
    .mockResolvedValueOnce(new Response(xml('<value><struct><member><name>link</name><value><string>https://free-site.wordpress.com/post</string></value></member></struct></value>')));
  const config = {
    adapter: 'wordpress_com_xmlrpc' as const,
    blogId: '91',
    credential: {
      adapter: 'wordpress_com_xmlrpc' as const,
      applicationPassword: 'secret',
      siteUrl: 'https://free-site.wordpress.com',
      username: 'writer'
    },
    endpoint: 'https://free-site.wordpress.com/xmlrpc.php',
    siteUrl: 'https://free-site.wordpress.com'
  };

  const created = await writeWordPressPost(config, { content: '<p>Body</p>', status: 'draft', title: 'Title' });
  const updated = await writeWordPressPost(config, { content: '<p>Changed</p>', status: 'publish', title: 'Title' }, created.postId);

  expect(created.postId).toBe('123');
  expect(updated.postId).toBe('123');
  expect(fetchMock).toHaveBeenCalledTimes(4);
  expect(fetchMock.mock.calls[0]![1]?.body).toContain('<methodName>wp.newPost</methodName>');
  expect(fetchMock.mock.calls[2]![1]?.body).toContain('<methodName>wp.editPost</methodName>');
  expect(fetchMock.mock.calls[2]![1]?.body).toContain('<int>123</int>');
});

it('rejects non-HTTPS sites before sending credentials', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch');
  await expect(verifyWordPressConnection({
    applicationPassword: 'secret', siteUrl: 'http://blog.example.com', username: 'writer'
  })).rejects.toThrow('valid HTTPS');
  expect(fetchMock).not.toHaveBeenCalled();
});
