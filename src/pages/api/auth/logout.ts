import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  return new Response(null, {
    status: 303,
    headers: {
      Location: '/login',
      'Set-Cookie': 'gestion_session=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0',
    },
  });
};
