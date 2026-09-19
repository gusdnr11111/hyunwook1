export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return new Response('인증 코드가 누락되었습니다.', { status: 400 });
  }

  try {
    // 1. 디스코드 토큰 교환
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
      const err = await tokenRes.text();
      return new Response(`토큰 교환 에러: ${err}`, { status: 400 });
    }

    const tokenData = await tokenRes.json();

    // 2. 디스코드 프로필 조회
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

    // 3. D1에 로그인 기록 저장
    if (env.DB) {
      try {
        const ip = request.headers.get('cf-connecting-ip') || 'unknown';
        const ua = request.headers.get('user-agent') || 'unknown';
        await env.DB.prepare(
          `INSERT INTO site_visits (ip, user_agent, user_id) VALUES (?, ?, ?)`
        ).bind(ip, ua, user.id).run();
      } catch (e) {}
    }

    // 4. Base64 인코딩 후 토큰 형식으로 전달 (쿠키 의존 탈피)
    const tokenPayload = btoa(unescape(encodeURIComponent(JSON.stringify(userData))));
    const cookieHeader = `devbot_session=${tokenPayload}; Path=/; Max-Age=604800; Secure; SameSite=Lax`;

    // 브라우저로 리다이렉트하면서 토큰 파라미터(tk) 부여
    return new Response(null, {
      status: 302,
      headers: {
        'Location': `/?login=success&tk=${tokenPayload}`,
        'Set-Cookie': cookieHeader
      }
    });

  } catch (err) {
    return new Response(`서버 오류: ${err.message}`, { status: 500 });
  }
}
