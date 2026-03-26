import type { APIRoute } from 'astro';
import { checkAdminPassword, buildSessionCookieHeader } from '../../../lib/auth';

export const POST: APIRoute = async ({ request }) => {
  const formData = await request.formData();
  const password = formData.get('password')?.toString() ?? '';

  if (!checkAdminPassword(password)) {
    return new Response(null, {
      status: 303,
      headers: { Location: new URL('/login?error=1', request.url).toString() },
    });
  }

  return new Response(null, {
    status: 303,
    headers: {
      Location: new URL('/admin/orders', request.url).toString(),
      'Set-Cookie': buildSessionCookieHeader(),
    },
  });
};
