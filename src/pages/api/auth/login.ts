import type { APIRoute } from 'astro';
import { checkAdminPassword, buildSessionCookieHeader } from '../../../lib/auth';

export const POST: APIRoute = async ({ request }) => {
  const formData = await request.formData();
  const password = formData.get('password')?.toString() ?? '';

  if (!checkAdminPassword(password)) {
    return new Response(null, {
      status: 303,
      // Use relative redirect — avoids localhost URL from Railway's internal proxy
      headers: { Location: '/login?error=1' },
    });
  }

  return new Response(null, {
    status: 303,
    headers: {
      Location: '/admin/orders',
      'Set-Cookie': buildSessionCookieHeader(),
    },
  });
};
