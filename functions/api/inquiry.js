export async function onRequestPost(context) {
  const { request, env } = context;
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/session=([^;]+)/);
  if (!match) return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  let user;
  try {
    user = JSON.parse(atob(match[1]));
  } catch {
    return Response.json({ error: '세션 오류' }, { status: 401 });
  }

  const { content } = await request.json();
  if (!content || content.length < 2) {
    return Response.json({ error: '내용을 입력해주세요.' }, { status: 400 });
  }

  // D1 저장
  const result = await env.DB.prepare(
    'INSERT INTO inquiries (user_id, username, global_name, avatar, content, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    user.id, user.username, user.global_name || '', user.avatar || '',
    content, 'pending', new Date().toISOString()
  ).run();

  const inquiryId = result.meta.last_row_id;

  // 디스코드 채널에 알림
  await fetch(`https://discord.com/api/v10/channels/${env.DISCORD_CHANNEL_ID}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      embeds: [{
        title: '📩 새 문의가 도착했습니다',
        color: 0x5865F2,
        fields: [
          { name: '문의자', value: `<@${user.id}> (${user.global_name || user.username})`, inline: true },
          { name: '문의 ID', value: `#${inquiryId}`, inline: true },
          { name: '내용', value: content.slice(0, 1000) }
        ],
        footer: { text: '어드민 패널에서 확인하세요' },
        timestamp: new Date().toISOString()
      }]
    })
  });

  return Response.json({ success: true, id: inquiryId });
}
