export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state') || '';

  if (!code) {
    return new Response('인증 코드가 누락되었습니다.', { status: 400 });
  }

  try {
    // 1. 디스코드 토큰 발급
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
      return new Response(`토큰 발급 실패: ${err}`, { status: 400 });
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

    // 3. 1550831898505253014 채널로 로그인 알림 전송 (await로 완료 보장)
    const channelId = '1550831898505253014';
    const botToken = env.DISCORD_BOT_TOKEN ? env.DISCORD_BOT_TOKEN.trim() : '';

    if (botToken) {
      const avatarUrl = user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
        : 'https://cdn.discordapp.com/embed/avatars/0.png';

      const loginTime = new Date().toISOString();

      try {
        await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bot ${botToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            content: `🔔 **웹사이트 로그인 알림** (<@${user.id}>)`,
            embeds: [{
              title: '🔑 웹사이트 로그인 감지',
              description: `<@${user.id}> 님이 사이트에 로그인했습니다.`,
              color: 0x5865F2,
              fields: [
                { name: '👤 유저 닉네임', value: `${user.global_name || user.username}`, inline: true },
                { name: '🏷️ 유저 태그', value: `@${user.username}`, inline: true },
                { name: '🆔 유저 ID', value: `\`${user.id}\``, inline: false },
                { name: '🌐 로그인 위치', value: state === 'admin' ? '🛡️ 관리자 패널 (/admin)' : '🏠 메인 홈페이지 (/)', inline: false }
              ],
              thumbnail: { url: avatarUrl },
              footer: { text: 'DEV BOT 시스템' },
              timestamp: loginTime
            }]
          })
        });
      } catch (sendErr) {
        console.error('로그인 채널 알림 발송 에러:', sendErr);
      }
    }

    // 4. 세션 토큰 발행 후 리다이렉트
    const tokenPayload = btoa(unescape(encodeURIComponent(JSON.stringify(userData))));
    const cookieHeader = `devbot_session=${tokenPayload}; Path=/; Max-Age=604800; Secure; SameSite=Lax`;
    const redirectPath = state === 'admin' ? '/admin' : '/';

    return new Response(null, {
      status: 302,
      headers: {
        'Location': `${redirectPath}?login=success&tk=${tokenPayload}`,
        'Set-Cookie': cookieHeader
      }
    });

  } catch (err) {
    return new Response(`서버 에러: ${err.message}`, { status: 500 });
  }
}
