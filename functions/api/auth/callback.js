export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return new Response('인증 코드가 누락되었습니다.', { status: 400 });
  }

  try {
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
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

    if (!tokenResponse.ok) {
      return new Response('디스코드 토큰 발급에 실패했습니다.', { status: 400 });
    }

    const tokenData = await tokenResponse.json();

    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });

    if (!userResponse.ok) {
      return new Response('유저 정보를 가져오지 못했습니다.', { status: 500 });
    }

    const user = await userResponse.json();

    const userData = {
      id: user.id,
      username: user.username,
      global_name: user.global_name || user.username,
      avatar: user.avatar
    };

    // 한글 및 특수문자 완벽 호환 URI Component 인코딩
    const serialized = encodeURIComponent(JSON.stringify(userData));
    const cookieHeader = `devbot_session=${serialized}; Path=/; Max-Age=604800; Secure; SameSite=Lax; HttpOnly`;

    return new Response(null, {
      status: 302,
      headers: {
        'Location': '/?login=success',
        'Set-Cookie': cookieHeader
      }
    });

  } catch (err) {
    return new Response(`로그인 처리 오류: ${err.message}`, { status: 500 });
  }
}
