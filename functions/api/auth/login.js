export async function onRequest(context) {
  // context.env를 통해 환경 변수에 접근
  const clientId = context.env.DISCORD_CLIENT_ID;
  const redirectUri = context.env.DISCORD_REDIRECT_URI;

  // 디버깅용 로그 (배포 로그에서 확인 가능)
  console.log("Client ID:", clientId);
  console.log("Redirect URI:", redirectUri);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'identify'
  });

  return Response.redirect(`https://discord.com/api/oauth2/authorize?${params}`, 302);
}
