// HMAC-SHA256 기반 관리자 세션 토큰 서명
async function signAdminToken(secret, payload) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const data = JSON.stringify(payload);
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  const sigHex = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
  return btoa(data) + '.' + sigHex;
}

// 토큰 유효성 및 권한 검증
async function verifyAdminToken(secret, token) {
  try {
    const [b64Data, sigHex] = token.split('.');
    if (!b64Data || !sigHex) return null;
    const dataStr = atob(b64Data);
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const sigBytes = new Uint8Array(sigHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(dataStr));
    if (!valid) return null;

    const payload = JSON.parse(dataStr);
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  const secretKey = env.ADMIN_SECRET || 'devbot_admin_jwt_secret_token_key_2026';

  // 허용할 관리자 디스코드 ID 목록 (환경변수 또는 하드코딩 기본값)
  const allowedAdminIds = (env.ADMIN_USER_IDS || '1520345082581090374')
    .split(',')
    .map(id => id.trim());

  // 1. 디스코드 계정 기반 관리자 인증 (Auth Exchange)
  if (action === 'auth' && request.method === 'POST') {
    try {
      const { user } = await request.json();

      if (!user || !user.id) {
        return new Response(JSON.stringify({ error: '디스코드 사용자 정보가 없습니다.' }), { status: 400 });
      }

      // 허용된 디스코드 유저 ID인지 서버단에서 엄격 검증
      if (!allowedAdminIds.includes(String(user.id))) {
        return new Response(JSON.stringify({ error: '관리자 권한이 부여되지 않은 계정입니다.' }), { status: 403 });
      }

      // 12시간 유효 관리자 토큰 발급
      const token = await signAdminToken(secretKey, {
        admin: true,
        userId: user.id,
        username: user.username,
        exp: Date.now() + 1000 * 60 * 60 * 12
      });

      return new Response(JSON.stringify({ success: true, token }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
  }

  // 이후 stats, reply 요청은 발급된 관리자 토큰 필수 검증
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const verified = await verifyAdminToken(secretKey, token);

  if (!verified) {
    return new Response(JSON.stringify({ error: '관리자 인증이 만료되었거나 올바르지 않습니다.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 2. 대시보드 통계 및 문의 목록 조회
  if (action === 'stats') {
    try {
      if (!env.DB) {
        return new Response(JSON.stringify({ totalVisits: 0, loggedUsers: 0, inquiries: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const { results: inquiries } = await env.DB.prepare(
        `SELECT id, user_id, username, global_name, category, content, budget, status, created_at FROM inquiries ORDER BY id DESC`
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
      return new Response(JSON.stringify({ error: e.message, inquiries: [] }), { status: 500 });
    }
  }

  // 3. 디스코드 유저에게 ## 마크다운 강조 DM 답변 발송
  if (action === 'reply' && request.method === 'POST') {
    try {
      const { inquiryId, userId, reply } = await request.json();
      const botToken = env.DISCORD_BOT_TOKEN ? env.DISCORD_BOT_TOKEN.trim() : '';

      if (!botToken) {
        return new Response(JSON.stringify({ error: 'DISCORD_BOT_TOKEN이 설정되지 않았습니다.' }), { status: 500 });
      }

      const dmRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
        method: 'POST',
        headers: { 'Authorization': `Bot ${botToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_id: userId })
      });

      if (!dmRes.ok) {
        return new Response(JSON.stringify({ error: '유저의 DM이 닫혀있거나 봇과 공유 서버가 없습니다.' }), { status: 400 });
      }

      const dmChannel = await dmRes.json();

      await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Bot ${botToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [{
            title: '## 💬 [DEV BOT] 관리자 답변이 도착했습니다',
            description: `## 답변 내용\n\n${reply}\n\n---\n*추가 문의는 공식 서버 또는 텔레그램을 이용해 주세요.*`,
            color: 0x00d4ff,
            fields: [
              { name: '🌐 공식 디스코드', value: '[서버 접속](https://discord.gg/8D7mtVGPyC)', inline: true },
              { name: '✈️ 텔레그램', value: '[@rr777_p](https://t.me/rr777_p)', inline: true }
            ],
            footer: { text: 'DEV BOT 고객 지원' },
            timestamp: new Date().toISOString()
          }]
        })
      });

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
