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
    applicationPassword: 'abcd efgh ijkl mnop qrst uvwx',
    siteUrl: 'blog.example.com/',
    username: 'writer'
  });

  expect(result).toMatchObject({ adapter: 'core_rest', siteUrl: 'https://blog.example.com' });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0]![0]).toBe('https://blog.example.com/wp-json/wp/v2/users/me?context=edit');
  expect((fetchMock.mock.calls[0]![1]?.headers as Record<string, string>).Authorization).toMatch(/^Basic /u);
});

it('verifies the requested WordPress.com site directly when the account blog list is empty', async () => {
  const response = `<?xml version="1.0"?><methodResponse><params><param><value><struct>
    <member><name>siteurl</name><value><struct><member><name>value</name>
    <value><string>https://free-site.wordpress.com</string></value></member></struct></value></member>
  </struct></value></param></params></methodResponse>`;
  const fetchMock = vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify({ ID: 91 }), { status: 200 }))
    .mockResolvedValueOnce(new Response(response, { status: 200 }));

  const result = await verifyWordPressConnection({
    applicationPassword: 'abcd efgh ijkl mnop',
    siteUrl: 'free-site.wordpress.com',
    username: 'account-name'
  });

  expect(result).toEqual({
    adapter: 'wordpress_com_xmlrpc',
    blogId: '91',
    endpoint: 'https://free-site.wordpress.com/xmlrpc.php',
    siteUrl: 'https://free-site.wordpress.com'
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[0]![0]).toBe('https://public-api.wordpress.com/rest/v1.1/sites/free-site.wordpress.com');
  expect(fetchMock.mock.calls[0]![1]).toEqual({ method: 'GET', redirect: 'error' });
  expect(fetchMock.mock.calls[1]![1]?.body as string).toContain('<methodName>wp.getOptions</methodName>');
  expect(fetchMock.mock.calls[1]![1]?.body as string).toContain('<int>91</int>');
  expect(fetchMock.mock.calls[1]![1]?.body as string).not.toContain('wp.getUsersBlogs');
});

it('does not connect when WordPress.com omits the requested site settings', async () => {
  const response = `<?xml version="1.0"?><methodResponse><params><param>
    <value><array><data></data></array></value>
  </param></params></methodResponse>`;
  vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify({ ID: 91 }), { status: 200 }))
    .mockResolvedValueOnce(new Response(response, { status: 200 }));

  await expect(verifyWordPressConnection({
    applicationPassword: 'abcd efgh ijkl mnop',
    siteUrl: 'free-site.wordpress.com',
    username: 'account-name'
  })).rejects.toThrow('did not return the requested site settings');
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

  const created = await writeWordPressPost(config, {
    content: '<p>Body</p>', status: 'draft',
    termsNames: { category: ['Writing'], post_tag: ['foliole'] }, title: 'Title'
  });
  const updated = await writeWordPressPost(config, { content: '<p>Changed</p>', status: 'publish', title: 'Title' }, created.postId);

  expect(created.postId).toBe('123');
  expect(updated.postId).toBe('123');
  expect(fetchMock).toHaveBeenCalledTimes(4);
  expect(fetchMock.mock.calls[0]![1]?.body).toContain('<methodName>wp.newPost</methodName>');
  expect(fetchMock.mock.calls[0]![1]?.body).toContain('<name>terms_names</name>');
  expect(fetchMock.mock.calls[0]![1]?.body).toContain('<string>Writing</string>');
  expect(fetchMock.mock.calls[0]![1]?.body).toContain('<string>foliole</string>');
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

it('rejects incomplete Application Passwords before sending credentials', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch');
  await expect(verifyWordPressConnection({
    applicationPassword: 'too-short', siteUrl: 'example.com', username: 'writer'
  })).rejects.toThrow('24-character');
  expect(fetchMock).not.toHaveBeenCalled();
});
