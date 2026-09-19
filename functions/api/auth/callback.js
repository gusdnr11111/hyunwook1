export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return new Response('인증 코드가 누락되었습니다.', { status: 400 });
  }

  try {
    // 1. 디스코드 토큰 발급
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
      const errText = await tokenResponse.text();
      return new Response(`디스코드 토큰 발급 실패: ${errText}`, { status: 400 });
    }

    const tokenData = await tokenResponse.json();

    // 2. 디스코드 유저 정보 조회
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });

    if (!userResponse.ok) {
      return new Response('유저 정보 조회 실패', { status: 500 });
    }

    const user = await userResponse.json();

    const userData = {
      id: user.id,
      username: user.username,
      global_name: user.global_name || user.username,
      avatar: user.avatar
    };

    const serialized = encodeURIComponent(JSON.stringify(userData));

    // 호스트 도메인 판별 (ddev.my 또는 localhost 등 자동 대응)
    const hostname = url.hostname;
    let cookieDomain = '';
    if (hostname.includes('ddev.my')) {
      cookieDomain = '; Domain=.ddev.my';
    }

    // 쿠키 생성 (Domain 명시로 서브도메인 간 쿠키 증발 방지)
    const cookieHeader = `devbot_session=${serialized}; Path=/${cookieDomain}; Max-Age=604800; Secure; SameSite=Lax`;

    // 만약 브라우저가 쿠키를 막더라도 로컬스토리지에 저장할 수 있게 u 파라미터 추가
    const redirectUrl = `/?login=success&u=${serialized}`;

    return new Response(null, {
      status: 302,
      headers: {
        'Location': redirectUrl,
        'Set-Cookie': cookieHeader
      }
    });

  } catch (err) {
    return new Response(`콜백 처리 오류: ${err.message}`, { status: 500 });
  }
}
