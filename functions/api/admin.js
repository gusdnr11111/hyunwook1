export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  // 1. 문의 리스트 및 통계 조회
  if (action === 'stats') {
    try {
      if (!env.DB) {
        return new Response(JSON.stringify({ totalVisits: 0, loggedUsers: 0, inquiries: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const { results: inquiries } = await env.DB.prepare(
        `SELECT * FROM inquiries ORDER BY id DESC`
      ).all();

      const userCount = new Set((inquiries || []).map(i => i.user_id)).size;

      return new Response(JSON.stringify({
        totalVisits: (inquiries || []).length * 4 + 18,
        loggedUsers: userCount,
        inquiries: inquiries || []
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message, inquiries: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // 2. 디스코드 1:1 DM 답장 발송
  if (action === 'reply' && request.method === 'POST') {
    try {
      const { inquiryId, userId, reply } = await request.json();
      const botToken = env.DISCORD_BOT_TOKEN ? env.DISCORD_BOT_TOKEN.trim() : '';

      if (!botToken) {
        return new Response(JSON.stringify({ error: '봇 토큰이 없습니다.' }), { status: 500 });
      }

      // 유저와 DM 채널 오픈
      const dmRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
        method: 'POST',
        headers: { 'Authorization': `Bot ${botToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_id: userId })
      });

      if (!dmRes.ok) {
        return new Response(JSON.stringify({ error: '유저의 DM이 닫혀있거나 봇과 같은 서버에 없습니다.' }), { status: 400 });
      }

      const dmChannel = await dmRes.json();

      // DM 메시지 전송
      await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Bot ${botToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [{
            title: '💬 [DEV BOT] 문의하신 내용에 대한 답변이 도착했습니다!',
            description: reply,
            color: 0x5865F2,
            fields: [
              { name: '📞 실시간 상담', value: '[디스코드 서버](https://discord.gg/8D7mtVGPyC) | [텔레그램](https://t.me/rr777_p)' }
            ],
            footer: { text: 'DEV BOT 고객 지원' },
            timestamp: new Date().toISOString()
          }]
        })
      });

      // DB 상태 업데이트
      if (env.DB && inquiryId) {
        await env.DB.prepare(`UPDATE inquiries SET status = '답변완료' WHERE id = ?`).bind(inquiryId).run();
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }

  return new Response('Not Found', { status: 404 });
}
