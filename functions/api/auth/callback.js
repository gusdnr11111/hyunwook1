export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return new Response('인증 코드가 누락되었습니다.', { status: 400 });
  }

  try {
    // 1. 디스코드에 코드를 전달하고 Access Token 발급
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID,
        client_secret: env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: env.DISCORD_REDIRECT_URI || 'https://ddev.my/api/auth/callback'
      })
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      return new Response(`디스코드 토큰 교환 실패: ${errorData}`, { status: 400 });
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // 2. 발급받은 Access Token으로 사용자 프로필 조회
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!userResponse.ok) {
      return new Response('디스코드 유저 정보 조회 실패', { status: 500 });
    }

    const user = await userResponse.json();

    // 3. 클라이언트에 저장할 세션 데이터 구성
    const sessionData = {
      id: user.id,
      username: user.username,
      global_name: user.global_name || user.username,
      avatar: user.avatar
    };

    // 4. 쿠키 헤더 생성 (SameSite=Lax, Secure 필수)
    const cookieValue = encodeURIComponent(JSON.stringify(sessionData));
    const cookieHeader = `session=${cookieValue}; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax`;

    // 5. 로그인 성공 플래그를 붙여 메인 페이지로 302 리다이렉트
    return new Response(null, {
      status: 302,
      headers: {
        'Location': '/?login=success',
        'Set-Cookie': cookieHeader
      }
    });

  } catch (err) {
    return new Response(`서버 오류 발생: ${err.message}`, { status: 500 });
  }
}
