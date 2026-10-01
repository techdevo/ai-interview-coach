function decodeHtml(value: string) {
  return value
    .replace(/<script[\\s\\S]*?<\\/script>/gi, ' ')
    .replace(/<style[\\s\\S]*?<\\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\\s+/g, ' ')
    .trim();
}

function isBlockedHost(hostname: string) {
  const host = hostname.toLowerCase();
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    host.startsWith('172.16.') ||
    host.startsWith('172.17.') ||
    host.startsWith('172.18.') ||
    host.startsWith('172.19.') ||
    host.startsWith('172.20.') ||
    host.startsWith('172.21.') ||
    host.startsWith('172.22.') ||
    host.startsWith('172.23.') ||
    host.startsWith('172.24.') ||
    host.startsWith('172.25.') ||
    host.startsWith('172.26.') ||
    host.startsWith('172.27.') ||
    host.startsWith('172.28.') ||
    host.startsWith('172.29.') ||
    host.startsWith('172.30.') ||
    host.startsWith('172.31.')
  );
}

export async function extractJobDescriptionFromUrl(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Please provide a valid job description URL.');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only HTTP and HTTPS job description URLs are supported.');
  }

  if (isBlockedHost(url.hostname)) {
    throw new Error('This job description URL is not allowed.');
  }

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'AI-Interview-Coach/1.0',
      Accept: 'text/html,application/xhtml+xml,text/plain',
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Could not fetch the job description (HTTP ${response.status}).`);
  }

  const contentType = response.headers.get('content-type') || '';
  const body = await response.text();

  if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
    throw new Error('The URL did not return a readable web page.');
  }

  const text = contentType.includes('text/html') ? decodeHtml(body) : body.trim();

  if (text.length < 100) {
    throw new Error('Could not extract enough job description text from this URL.');
  }

  return text.slice(0, 30000);
}
