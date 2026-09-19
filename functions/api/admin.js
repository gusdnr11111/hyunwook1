export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  // 1. 어드민 문의 목록 및 현황 조회
  if (action === 'stats') {
    try {
      if (!env.DB) {
        return new Response(JSON.stringify({ totalVisits: 0, loggedUsers: 0, inquiries: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const queryResult = await env.DB.prepare(
        `SELECT id, user_id, username, global_name, category, content, budget, status, created_at 
         FROM inquiries ORDER BY id DESC`
      ).all();

      const inquiries = queryResult.results || [];
      const userCount = new Set(inquiries.map(i => i.user_id)).size;

      return new Response(JSON.stringify({
        totalVisits: inquiries.length * 4 + 18,
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

  // 2. 디스코드 유저 1:1 DM 답장 발송 (## 강조 적용)
  if (action === 'reply' && request.method === 'POST') {
    try {
      const { inquiryId, userId, reply } = await request.json();
      const botToken = env.DISCORD_BOT_TOKEN ? env.DISCORD_BOT_TOKEN.trim() : '';

      if (!botToken) {
        return new Response(JSON.stringify({ error: '봇 토큰(DISCORD_BOT_TOKEN)이 없습니다.' }), { status: 500 });
      }

      // Step A: 유저와 DM 채널 오픈
      const dmRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
        method: 'POST',
        headers: { 'Authorization': `Bot ${botToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_id: userId })
      });

      if (!dmRes.ok) {
        return new Response(JSON.stringify({ error: '유저의 DM이 닫혀있거나 봇과 공유 서버가 없습니다.' }), { status: 400 });
      }

      const dmChannel = await dmRes.json();

      // Step B: ## 마크다운으로 제목과 본문을 강조하여 전송
      const formattedDescription = `## 💬 관리자 답변\n\n${reply}\n\n---\n*추가 문의가 있으신 경우 언제든 공식 서버나 텔레그램으로 연락해 주세요.*`;

      const sendRes = await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Bot ${botToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [{
            title: '## 📩 [DEV BOT] 문의하신 내용에 대한 답변입니다.',
            description: formattedDescription,
            color: 0x00D4FF,
            fields: [
              { name: '🌐 공식 디스코드 서버', value: '[서버 바로가기](https://discord.gg/8D7mtVGPyC)', inline: true },
              { name: '✈️ 텔레그램 1:1 문의', value: '[@rr777_p](https://t.me/rr777_p)', inline: true }
            ],
            footer: { text: 'DEV BOT 고객 지원 센터' },
            timestamp: new Date().toISOString()
          }]
        })
      });

      if (!sendRes.ok) {
        return new Response(JSON.stringify({ error: 'DM 메시지 전송에 실패했습니다.' }), { status: 500 });
      }

      // Step C: D1 DB 상태를 '답변완료'로 갱신
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
