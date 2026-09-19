export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  // 1. 통계 및 목록 조회
  if (action === 'stats') {
    try {
      if (!env.DB) {
        return new Response(JSON.stringify({ totalVisits: 0, inquiries: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // 전체 방문자 수
      const visitRes = await env.DB.prepare(`SELECT COUNT(*) as count FROM site_visits`).first();
      // 고유 로그인 유저 수
      const userRes = await env.DB.prepare(`SELECT COUNT(DISTINCT user_id) as count FROM site_visits WHERE user_id IS NOT NULL`).first();
      // 문의 내역
      const { results: inquiries } = await env.DB.prepare(`SELECT * FROM inquiries ORDER BY id DESC`).all();

      return new Response(JSON.stringify({
        totalVisits: visitRes?.count || 0,
        loggedUsers: userRes?.count || 0,
        inquiries: inquiries || []
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  }

  // 2. 관리자 DM 답변 전송
  if (action === 'reply' && request.method === 'POST') {
    try {
      const { inquiryId, userId, reply } = await request.json();
      const botToken = env.DISCORD_BOT_TOKEN ? env.DISCORD_BOT_TOKEN.trim() : '';

      if (!botToken) {
        return new Response(JSON.stringify({ error: 'DISCORD_BOT_TOKEN이 설정되지 않았습니다.' }), { status: 500 });
      }

      // DM 채널 생성
      const dmRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
        method: 'POST',
        headers: { 'Authorization': `Bot ${botToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_id: userId })
      });

      if (!dmRes.ok) {
        return new Response(JSON.stringify({ error: '해당 유저의 DM이 닫혀있거나 채널을 열 수 없습니다.' }), { status: 400 });
      }

      const dmChannel = await dmRes.json();

      // DM 메시지 발송
      const sendRes = await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Bot ${botToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [{
            title: '💬 [DEV BOT] 관리자 답변이 도착했습니다',
            description: reply,
            color: 0x5865F2,
            fields: [
              { name: '📞 추가 문의/상담', value: '[공식 디스코드 서버](https://discord.gg/8D7mtVGPyC) | [텔레그램](https://t.me/rr777_p)' }
            ],
            footer: { text: 'DEV BOT Support Team' },
            timestamp: new Date().toISOString()
          }]
        })
      });

      if (!sendRes.ok) {
        return new Response(JSON.stringify({ error: '메시지 전송 실패' }), { status: 500 });
      }

      // 상태 업데이트
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
