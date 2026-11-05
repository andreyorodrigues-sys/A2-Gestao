/* A2 Gestão — configuração exclusiva do ambiente de testes.
   Use somente dados do projeto Supabase A2-Gestao-Testes.
   A chave publishable é própria para uso no navegador.
   Nunca coloque service_role, secret key, senha ou tokens aqui.
*/
window.A2_SUPABASE_CONFIG = {
  url: 'https://zqkigankrntloqlccoqf.supabase.co',
  anonKey: 'sb_publishable_8sT4rA1s7SOfibbubaByJQ_hW7E1dCu',
  ownerId: '7fb3c703-6c22-4390-97cc-1d449a132e61'
};

// Correção isolada: disponibiliza dateOf globalmente antes dos scripts da aplicação.
window.dateOf = window.dateOf || function (o) {
  if (!o || typeof o !== 'object') return null;
  if (o.completedAt) { const d = new Date(o.completedAt); return Number.isNaN(d.getTime()) ? null : d; }
  if (o.created) {
    const s = String(o.created).trim();
    const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
    const d = new Date(s); return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
};
