import https from 'node:https';

export function readwiseHttpsFetch(input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' || input instanceof URL ? input.toString() : input.url;
  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      method: init?.method ?? 'GET'
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => {
        const headers = new Headers();
        for (const [key, value] of Object.entries(response.headers)) {
          if (typeof value === 'string') headers.set(key, value);
          if (Array.isArray(value)) value.forEach((item) => headers.append(key, item));
        }
        resolve(new Response(Buffer.concat(chunks), {
          headers,
          status: response.statusCode ?? 0,
          statusText: response.statusMessage
        }));
      });
    });
    request.on('error', reject);
    request.end();
  });
}
