export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (!code) return new Response('No code', { status: 400 });

  try {
    // 1. 토큰 교환
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID,
        client_secret: env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: env.DISCORD_REDIRECT_URI
      })
    });
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      return new Response('Token error: ' + JSON.stringify(tokenData), {
        status: 400,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }

    // 2. 유저 정보 조회
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const user = await userRes.json();

    // 3. 세션 생성 (한글 안전)
    const sessionData = JSON.stringify({
      id: user.id,
      username: user.username,
      global_name: user.global_name || '',
      avatar: user.avatar || ''
    });
    const session = encodeURIComponent(sessionData);

    const cookie = `session=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`;

    // 4. 메인 페이지로 리다이렉트
    return new Response(null, {
      status: 302,
      headers: {
        'Location': '/?login=success',
        'Set-Cookie': cookie
      }
    });
  } catch (err) {
    return new Response('Callback error: ' + err.message + '\n' + err.stack, {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}
