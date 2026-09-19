export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return new Response('인증 코드가 없습니다.', { status: 400 });
  }

  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID,
        client_secret: env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: env.DISCORD_REDIRECT_URI || 'https://ddev.my/api/auth/callback'
      })
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      return new Response(`토큰 교환 실패: ${errText}`, { status: 400 });
    }

    const tokenData = await tokenRes.json();

    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });

    if (!userRes.ok) {
      return new Response('유저 정보 조회 실패', { status: 500 });
    }

    const user = await userRes.json();
    const userData = {
      id: user.id,
      username: user.username,
      global_name: user.global_name || user.username,
      avatar: user.avatar
    };

    const serialized = encodeURIComponent(JSON.stringify(userData));
    const cookieHeader = `devbot_session=${serialized}; Path=/; Max-Age=604800; Secure; SameSite=Lax`;

    return new Response(null, {
      status: 302,
      headers: {
        'Location': `/?login=success&u=${serialized}`,
        'Set-Cookie': cookieHeader
      }
    });

  } catch (err) {
    return new Response(`콜백 오류: ${err.message}`, { status: 500 });
  }
}
