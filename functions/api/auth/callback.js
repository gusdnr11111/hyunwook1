export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return new Response('인증 코드가 없습니다.', { status: 400 });
  }

  try {
    // 1. 디스코드 Access Token 교환
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

    // 2. 디스코드 사용자 프로필 조회
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

    // 3. Base64 인코딩을 거쳐 쿠키 특수문자 깨짐 및 유실 원천 방지
    const serializedUser = btoa(unescape(encodeURIComponent(JSON.stringify(userData))));
    const cookieString = `devbot_session=${serializedUser}; Path=/; Max-Age=604800; Secure; SameSite=Lax; HttpOnly`;

    return new Response(null, {
      status: 302,
      headers: {
        'Location': '/?login=success',
        'Set-Cookie': cookieString
      }
    });

  } catch (err) {
    return new Response(`로그인 처리 중 오류 발생: ${err.message}`, { status: 500 });
  }
}
