export async function onRequestPost({ request, env }) {
  try {
    const { category, content, budget, user } = await request.json();

    if (!user || !user.id) {
      return new Response(JSON.stringify({ error: '로그인 정보가 없습니다.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!content || !content.trim()) {
      return new Response(JSON.stringify({ error: '문의 내용을 입력해 주세요.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const createdAt = new Date().toISOString();

    // 1. D1 DB 저장 (어드민 패널 연동)
    if (env.DB) {
      try {
        await env.DB.prepare(
          `INSERT INTO inquiries (user_id, username, global_name, category, content, budget, status, created_at) 
           VALUES (?, ?, ?, ?, ?, ?, '대기중', ?)`
        ).bind(
          String(user.id),
          String(user.username || ''),
          String(user.global_name || user.username || ''),
          String(category || '기타'),
          String(content),
          String(budget || '미정/협의'),
          createdAt
        ).run();
      } catch (dbErr) {
        console.error('D1 저장 오류:', dbErr);
      }
    }

    // 2. 디스코드 채널 알림 발송 (확실하게 await 처리)
    const channelId = env.DISCORD_CHANNEL_ID ? String(env.DISCORD_CHANNEL_ID).trim() : '1550831898505253014';
    const botToken = env.DISCORD_BOT_TOKEN ? env.DISCORD_BOT_TOKEN.trim() : '';

    if (botToken) {
      const avatarUrl = user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
        : 'https://cdn.discordapp.com/embed/avatars/0.png';

      const discordPayload = {
        content: `🔔 **새로운 외주/제작 문의가 접수되었습니다!** (<@${user.id}>)`,
        embeds: [
          {
            title: `📋 [${category}] 문의 접수 알림`,
            color: 0x5865F2,
            fields: [
              {
                name: '👤 신청자',
                value: `${user.global_name || user.username} (\`@${user.username}\` / <@${user.id}>)`,
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
            footer: { text: `User ID: ${user.id} | DEV BOT System` },
            timestamp: createdAt
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
        console.error('디스코드 채널 전송 실패:', errDetail);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
