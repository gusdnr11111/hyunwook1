export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  // 1. 어드민 문의 목록 및 통계 조회
  if (action === 'stats') {
    try {
      if (!env.DB) {
        return new Response(JSON.stringify({ totalVisits: 0, inquiries: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // 문의 목록 전체 조회
      const { results: inquiries } = await env.DB.prepare(
        `SELECT * FROM inquiries ORDER BY id DESC`
      ).all();

      // 고유 유저 수 계산
      const userCount = new Set((inquiries || []).map(i => i.user_id)).size;

      return new Response(JSON.stringify({
        totalVisits: (inquiries || []).length * 3 + 12, // 방문 추정 및 접속 카운트
        loggedUsers: userCount,
        inquiries: inquiries || []
      }), {
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

  // 2. 관리자가 유저에게 디스코드 1:1 DM 발송
  if (action === 'reply' && request.method === 'POST') {
    try {
      const { inquiryId, userId, reply } = await request.json();
      const botToken = env.DISCORD_BOT_TOKEN ? env.DISCORD_BOT_TOKEN.trim() : '';

      if (!botToken) {
        return new Response(JSON.stringify({ error: 'DISCORD_BOT_TOKEN이 없습니다.' }), { status: 500 });
      }

      // Step A: 유저와 DM 채널 오픈
      const dmRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${botToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ recipient_id: userId })
      });

      if (!dmRes.ok) {
        return new Response(JSON.stringify({ error: '유저가 DM을 차단했거나 봇과 같은 서버에 없습니다.' }), { status: 400 });
      }

      const dmChannel = await dmRes.json();

      // Step B: DM 채널로 답장 메시지 전송
      const sendRes = await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${botToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          embeds: [{
            title: '💬 [DEV BOT] 문의하신 내용에 대한 답변이 도착했습니다!',
            description: reply,
            color: 0x00D4FF,
            fields: [
              { name: '📞 실시간 상담', value: '[디스코드 서버](https://discord.gg/8D7mtVGPyC) | [텔레그램](https://t.me/rr777_p)' }
            ],
            footer: { text: 'DEV BOT 외주 문의 답변' },
            timestamp: new Date().toISOString()
          }]
        })
      });

      if (!sendRes.ok) {
        return new Response(JSON.stringify({ error: 'DM 전송 실패' }), { status: 500 });
      }

      // Step C: D1 DB 상태를 '답변완료'로 변경
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
