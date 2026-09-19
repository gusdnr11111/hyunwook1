export async function onRequestGet({ request }) {
  try {
    const cookieHeader = request.headers.get('Cookie') || '';
    const match = cookieHeader.match(/devbot_session=([^;]+)/);

    if (!match || !match[1]) {
      return new Response(JSON.stringify({ user: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const rawData = decodeURIComponent(escape(atob(match[1])));
    const user = JSON.parse(rawData);

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
