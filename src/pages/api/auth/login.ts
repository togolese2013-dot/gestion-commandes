import type { APIRoute } from 'astro';
import { checkUserCredentials, buildSessionCookieHeader } from '../../../lib/auth';

export const POST: APIRoute = async ({ request }) => {
  const formData = await request.formData();
  const username = formData.get('username')?.toString().trim() ?? '';
  const password = formData.get('password')?.toString() ?? '';

  const user = checkUserCredentials(username, password);

  if (!user) {
    return new Response(null, {
      status: 303,
      headers: { Location: '/login?error=1' },
    });
  }

  return new Response(null, {
    status: 303,
    headers: {
      Location: '/admin/orders',
      'Set-Cookie': buildSessionCookieHeader(user.id),
    },
  });
};
