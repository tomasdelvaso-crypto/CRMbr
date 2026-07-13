// src/lib/apiHeaders.js
// Headers para os endpoints /api/*: inclui o JWT da sessão Supabase.
// O backend valida o token quando SUPABASE_URL/SUPABASE_ANON_KEY estiverem
// configuradas no Vercel (fail-open até lá).
export async function apiHeaders(supabase) {
  const headers = { 'Content-Type': 'application/json' };
  if (!supabase) return headers;
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.access_token) {
      headers['Authorization'] = `Bearer ${data.session.access_token}`;
    }
  } catch (e) {
    // segue sem token; o backend fail-open decide
  }
  return headers;
}
