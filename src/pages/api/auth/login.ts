import type { APIRoute } from 'astro';
import { checkUserCredentials, buildSessionCookieHeader } from '../../../lib/auth';
import { logActivity } from '../../../lib/audit';

export const POST: APIRoute = async ({ request }) => {
  const formData = await request.formData();
  const username = formData.get('username')?.toString().trim() ?? '';
  const password = formData.get('password')?.toString() ?? '';

  const user = checkUserCredentials(username, password);

  if (!user) {
    logActivity({ action: 'auth.login_failed', entity_type: 'auth', performed_by: username });
    return new Response(null, {
      status: 303,
      headers: { Location: '/login?error=1' },
    });
  }

  logActivity({ action: 'auth.login', entity_type: 'auth', performed_by: user.full_name ?? username });
  return new Response(null, {
    status: 303,
    headers: {
      Location: '/admin/orders',
      'Set-Cookie': buildSessionCookieHeader(user.id),
    },
  });
};
