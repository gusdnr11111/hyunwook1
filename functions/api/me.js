export async function onRequest(context) {
  const { request } = context;
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/session=([^;]+)/);
  if (!match) return Response.json({ user: null });

  try {
    const user = JSON.parse(atob(match[1]));
    return Response.json({ user });
  } catch {
    return Response.json({ user: null });
  }
}
