export async function onRequestPost({ request }) {
  const url = new URL(request.url);
  const hostname = url.hostname;
  let cookieDomain = '';
  if (hostname.includes('ddev.my')) {
    cookieDomain = '; Domain=.ddev.my';
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `devbot_session=; Path=/${cookieDomain}; Max-Age=0; Secure; SameSite=Lax`
    }
  });
}
