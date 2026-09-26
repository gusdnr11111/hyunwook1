export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const state = url.searchParams.get('state') || '';

  const clientId = env.DISCORD_CLIENT_ID ? env.DISCORD_CLIENT_ID.trim() : '';
  const redirectUri = env.DISCORD_REDIRECT_URI 
    ? env.DISCORD_REDIRECT_URI.trim() 
    : 'https://ddev.my/api/auth/callback';

  if (!clientId) {
    return new Response('DISCORD_CLIENT_ID가 환경변수에 설정되어 있지 않습니다.', { status: 500 });
  }

  // 디스코드 권한 요청 URL 생성
  const discordAuthUrl = new URL('https://discord.com/api/oauth2/authorize');
  discordAuthUrl.searchParams.set('client_id', clientId);
  discordAuthUrl.searchParams.set('redirect_uri', redirectUri);
  discordAuthUrl.searchParams.set('response_type', 'code');
  discordAuthUrl.searchParams.set('scope', 'identify');
  discordAuthUrl.searchParams.set('prompt', 'consent');
  if (state) {
    discordAuthUrl.searchParams.set('state', state);
  }

  return Response.redirect(discordAuthUrl.toString(), 302);
}
