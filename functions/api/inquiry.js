export async function onRequestPost({ request, env }) {
  try {
    // 1. 쿠키에서 세션 추출 (devbot_session)
    const cookieHeader = request.headers.get('Cookie') || '';
    const match = cookieHeader.match(/(?:^|;\s*)devbot_session=([^;]+)/);

    if (!match || !match[1]) {
      return new Response(JSON.stringify({ error: '로그인 세션이 만료되었습니다. 다시 로그인해 주세요.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let user = null;
    try {
      user = JSON.parse(decodeURIComponent(match[1]));
    } catch (e) {
      return new Response(JSON.stringify({ error: '세션 정보가 유효하지 않습니다.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 2. 요청 본문 파싱
    const { category, content, budget } = await request.json();

    if (!content || !content.trim()) {
      return new Response(JSON.stringify({ error: '문의 내용을 입력해 주세요.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 3. D1 데이터베이스 저장 (DB 바인딩이 되어 있는 경우)
    if (env.DB) {
      try {
        await env.DB.prepare(
          `INSERT INTO inquiries (user_id, username, global_name, category, content, budget, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          user.id,
          user.username,
          user.global_name || user.username,
          category || '기타',
          content,
          budget || '미정/협의',
          new Date().toISOString()
        ).run();
      } catch (dbErr) {
        console.error('DB 저장 실패(계속 진행):', dbErr);
      }
    }

    // 4. 디스코드 채널로 봇을 통해 임베드 메시지 전송
    const channelId = env.DISCORD_CHANNEL_ID ? String(env.DISCORD_CHANNEL_ID).trim() : '1550831898505253014';
    const botToken = env.DISCORD_BOT_TOKEN ? env.DISCORD_BOT_TOKEN.trim() : '';

    if (!botToken) {
      return new Response(JSON.stringify({ error: '서버 봇 토큰(DISCORD_BOT_TOKEN)이 설정되지 않았습니다.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const avatarUrl = user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
      : 'https://cdn.discordapp.com/embed/avatars/0.png';

    const discordPayload = {
      embeds: [
        {
          title: `📬 새로운 문의가 접수되었습니다! [${category}]`,
          color: 0x5865F2,
          fields: [
            {
              name: '👤 신청자',
              value: `${user.global_name || user.username} (<@${user.id}> / \`${user.username}\`)`,
              inline: true
            },
            {
              name: '💰 희망 예산',
              value: budget || '미정/협의',
              inline: true
            },
            {
              name: '📝 문의 상세 내용',
              value: content.length > 1000 ? content.slice(0, 1000) + '...' : content,
              inline: false
            }
          ],
          thumbnail: { url: avatarUrl },
          footer: { text: `User ID: ${user.id}` },
          timestamp: new Date().toISOString()
        }
      ]
    };

    const discordRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${botToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(discordPayload)
    });

    if (!discordRes.ok) {
      const errDetail = await discordRes.text();
      console.error('Discord API 에러:', errDetail);
      return new Response(JSON.stringify({ error: `디스코드 채널 전송 실패: ${errDetail}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: `서버 오류: ${err.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
