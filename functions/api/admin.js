export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  // 1. 문의 목록 및 현황 조회
  if (action === 'stats') {
    try {
      if (!env.DB) {
        return new Response(JSON.stringify({ error: 'DB 바인딩 없음', inquiries: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // DB에서 문의 전체 목록 조회
      const queryResult = await env.DB.prepare(
        `SELECT id, user_id, username, global_name, category, content, budget, status, created_at 
         FROM inquiries ORDER BY id DESC`
      ).all();

      const inquiries = queryResult.results || [];
      const userCount = new Set(inquiries.map(i => i.user_id)).size;

      return new Response(JSON.stringify({
        totalVisits: inquiries.length * 2 + 18,
        loggedUsers: userCount,
        inquiries: inquiries
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

  // 2. 디스코드 유저 1:1 DM 답장 발송
  if (action === 'reply' && request.method === 'POST') {
    try {
      const { inquiryId, userId, reply } = await request.json();
      const botToken = env.DISCORD_BOT_TOKEN ? env.DISCORD_BOT_TOKEN.trim() : '';

      if (!botToken) {
        return new Response(JSON.stringify({ error: '봇 토큰(DISCORD_BOT_TOKEN)이 없습니다.' }), { status: 500 });
      }

      // 1:1 DM 채널 생성
      const dmRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
        method: 'POST',
        headers: { 'Authorization': `Bot ${botToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_id: userId })
      });

      if (!dmRes.ok) {
        return new Response(JSON.stringify({ error: '유저가 DM을 비활성화했거나 봇과 공유 서버가 없습니다.' }), { status: 400 });
      }

      const dmChannel = await dmRes.json();

      // 메시지 전송
      await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Bot ${botToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [{
            title: '💬 [DEV BOT] 문의하신 내용에 대한 답변입니다.',
            description: reply,
            color: 0x00D4FF,
            fields: [
              { name: '📞 추가 상담', value: '[디스코드 서버](https://discord.gg/8D7mtVGPyC) | [텔레그램](https://t.me/rr777_p)' }
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
