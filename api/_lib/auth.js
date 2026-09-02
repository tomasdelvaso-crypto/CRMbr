// api/_lib/auth.js
// Validação do JWT de Supabase nos endpoints de IA.
//
// FAIL-OPEN por design: se SUPABASE_URL / SUPABASE_ANON_KEY não estiverem
// configuradas como variáveis de ambiente no Vercel (server-side), a validação
// é pulada e tudo funciona como antes. Ao configurá-las, a proteção ativa
// automaticamente — sem deploy adicional.
//
// `signal` (opcional): AbortSignal para a chamada à API de auth; um timeout cai
// no mesmo tratamento de erro de rede abaixo (permite o request, loga o aviso).

export async function verifyRequest(req, { signal } = {}) {
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn('🔓 Auth não configurada (SUPABASE_URL/SUPABASE_ANON_KEY ausentes) — endpoint aberto');
    return { ok: true, enforced: false };
  }

  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return { ok: false, enforced: true, reason: 'missing_token' };
  }

  try {
    const resp = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
      signal,
    });
    if (!resp.ok) {
      return { ok: false, enforced: true, reason: 'invalid_token' };
    }
    const user = await resp.json();
    return { ok: true, enforced: true, user };
  } catch (err) {
    // Erro de rede validando o token: não derrubar o serviço por isso
    console.error('⚠️ Erro validando token Supabase (permitindo request):', err.message);
    return { ok: true, enforced: false };
  }
}

export function unauthorizedResponse(headers) {
  return new Response(
    JSON.stringify({ response: '🔒 Sessão expirada ou inválida. Faça login novamente no CRM.' }),
    { status: 401, headers }
  );
}
