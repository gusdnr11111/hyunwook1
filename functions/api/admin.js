const ADMIN_PASSWORD = 'gusdnr0216!';

function checkAuth(request) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/admin_session=([^;]+)/);
  return match && match[1] === btoa(ADMIN_PASSWORD);
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // 로그인
  if (url.pathname === '/api/admin/login' && request.method === 'POST') {
    const { password } = await request.json();
    if (password !== ADMIN_PASSWORD) {
      return Response.json({ error: '비밀번호 오류' }, { status: 401 });
    }
    return new Response(JSON.stringify({ success: true }), {
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': `admin_session=${btoa(ADMIN_PASSWORD)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`
      }
    });
  }

  // 로그아웃
  if (url.pathname === '/api/admin/logout') {
    return new Response(null, {
      status: 302,
      headers: {
        'Location': '/admin',
        'Set-Cookie': 'admin_session=; Path=/; Max-Age=0'
      }
    });
  }

  // 인증 확인
  if (!checkAuth(request)) {
    return Response.json({ error: '인증 필요' }, { status: 401 });
  }

  // 문의 목록 조회
  if (url.pathname === '/api/admin/inquiries' && request.method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT * FROM inquiries ORDER BY created_at DESC'
    ).all();
    return Response.json({ inquiries: results });
  }

  // 답변 전송
  if (url.pathname === '/api/admin/reply' && request.method === 'POST') {
    const { id, reply } = await request.json();
    const inquiry = await env.DB.prepare('SELECT * FROM inquiries WHERE id = ?').bind(id).first();
    if (!inquiry) return Response.json({ error: '문의 없음' }, { status: 404 });

    // DM 발송
    const dmRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ recipient_id: inquiry.user_id })
    });
    const dmChannel = await dmRes.json();

    await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        embeds: [{
          title: '📬 문의 답변이 도착했습니다',
          color: 0x00d4ff,
          fields: [
            { name: '원래 문의', value: inquiry.content.slice(0, 500) },
            { name: '답변', value: reply }
          ],
          timestamp: new Date().toISOString()
        }]
      })
    });

    await env.DB.prepare(
      'UPDATE inquiries SET reply = ?, status = ?, replied_at = ? WHERE id = ?'
    ).bind(reply, 'replied', new Date().toISOString(), id).run();

    return Response.json({ success: true });
  }

  return Response.json({ error: 'Not found' }, { status: 404 });
}
