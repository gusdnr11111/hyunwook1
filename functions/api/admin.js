export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  // 1. 문의 내역 전체 조회
  if (action === 'list') {
    try {
      if (!env.DB) {
        return new Response(JSON.stringify({ inquiries: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const { results } = await env.DB.prepare(
        `SELECT * FROM inquiries ORDER BY id DESC`
      ).all();

      return new Response(JSON.stringify({ inquiries: results || [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // 2. 유저에게 디스코드 DM 발송
  if (action === 'reply' && request.method === 'POST') {
    try {
      const { userId, reply } = await request.json();
      const botToken = env.DISCORD_BOT_TOKEN ? env.DISCORD_BOT_TOKEN.trim() : '';

      if (!botToken) {
        return new Response(JSON.stringify({ error: '봇 토큰(DISCORD_BOT_TOKEN)이 설정되지 않았습니다.' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Step A: 디스코드 유저와 1:1 DM 채널 생성
      const dmChannelRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${botToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ recipient_id: userId })
      });

      if (!dmChannelRes.ok) {
        const errText = await dmChannelRes.text();
        return new Response(JSON.stringify({ error: `DM 채널 생성 실패 (유저가 DM을 차단했을 수 있음): ${errText}` }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const dmChannel = await dmChannelRes.json();

      // Step B: DM 채널로 답변 임베드 전송
      const sendRes = await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${botToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          embeds: [
            {
              title: '💬 DEV BOT 문의에 대한 답변이 도착했습니다!',
              description: reply,
              color: 0x00D4FF,
              fields: [
                {
                  name: '📞 추가 상담 및 진행',
                  value: '[디스코드 서버 참여하기](https://discord.gg/8D7mtVGPyC) 또는 [텔레그램 문의](https://t.me/rr777_p)'
                }
              ],
              footer: { text: 'DEV BOT 고객 지원' },
              timestamp: new Date().toISOString()
            }
          ]
        })
      });

      if (!sendRes.ok) {
        const sendErr = await sendRes.text();
        return new Response(JSON.stringify({ error: `DM 발송 실패: ${sendErr}` }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: `서버 처리 에러: ${err.message}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  return new Response('잘못된 요청입니다.', { status: 400 });
}
