export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (!code) return new Response('No code', { status: 400 });

  // 토큰 교환
  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: env.DISCORD_REDIRECT_URI
    })
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) return new Response('Token error', { status: 400 });

  // 유저 정보 조회
  const userRes = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` }
  });
  const user = await userRes.json();

  // 쿠키에 세션 저장 (간단한 방식: user JSON을 base64로)
  const session = btoa(JSON.stringify({ id: user.id, username: user.username, global_name: user.global_name, avatar: user.avatar }));
  const cookie = `session=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`;

  return new Response(null, {
    status: 302,
    headers: {
      'Location': '/',
      'Set-Cookie': cookie
    }
  });
}
