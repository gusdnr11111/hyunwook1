export async function onRequestGet({ request }) {
  try {
    const cookieHeader = request.headers.get('Cookie') || '';
    
    // devbot_session 쿠키 추출
    const match = cookieHeader.match(/(?:^|;\s*)devbot_session=([^;]+)/);

    if (!match || !match[1]) {
      return new Response(JSON.stringify({ user: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const user = JSON.parse(decodeURIComponent(match[1]));

    return new Response(JSON.stringify({ user }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ user: null, error: err.message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
