export async function onRequestPost() {
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': 'devbot_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax'
    }
  });
}
