/**
 * Lista do painel "Conectar Instagram por Loja" (Administração ›
 * Configurações). Puro: só Lojas (a conta do Instagram nunca fica na Conta),
 * liberadas primeiro, depois por nome; a busca pega o nome da Loja ou da Conta
 * e ignora acento.
 */
export interface TenantRowForInstagram {
  id: string;
  name: string | null;
  kind: string | null;
  parent_tenant_id: string | null;
}

export interface InstagramConnectRow {
  id: string;
  name: string;
  parentName: string | null;
  enabled: boolean;
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function instagramConnectRows(
  tenants: readonly TenantRowForInstagram[],
  enabled: ReadonlySet<string>,
  busca = '',
): InstagramConnectRow[] {
  const nomes = new Map(tenants.map((t) => [t.id, t.name ?? '']));
  const termo = semAcento(busca.trim());
  return tenants
    .filter((t) => t.kind === 'store')
    .map((t) => ({
      id: t.id,
      name: t.name || 'Loja sem nome',
      parentName: t.parent_tenant_id ? nomes.get(t.parent_tenant_id) || null : null,
      enabled: enabled.has(t.id),
    }))
    .filter((r) => !termo || semAcento(`${r.name} ${r.parentName ?? ''}`).includes(termo))
    .sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name, 'pt-BR'));
}
