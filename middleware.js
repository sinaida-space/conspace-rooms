// Vercel Routing Middleware: Markdown for agents. A request that asks for
// text/markdown gets the page's Markdown twin instead of the HTML; browsers
// keep getting HTML. Static files are served before rewrites on Vercel, so
// this has to happen here, ahead of them.

export const config = { matcher: ['/', '/index.html', '/tech.html'] };

const TWINS = { '/': '/index.md', '/index.html': '/index.md', '/tech.html': '/tech.md' };

export default async function middleware(request) {
  const accept = request.headers.get('accept') || '';
  if (!accept.includes('text/markdown')) return;       // browsers carry on to the HTML
  const url = new URL(request.url);
  const twin = TWINS[url.pathname];
  if (!twin) return;
  const res = await fetch(new URL(twin, url.origin));
  if (!res.ok) return;
  const body = await res.text();
  return new Response(body, {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'vary': 'Accept',
      'x-markdown-tokens': String(Math.round(body.split(/\s+/).length * 1.35)),
      'link': '<https://sinaida.eu/>; rel="author", <https://uvaliss.ru/>; rel="author"',
    },
  });
}

// Je suis le spectre d'une rose que tu portais hier au bal.
