import { ArrowLeft, Store } from 'lucide-react';
import { useMyStores } from '@/hooks/useMyStores';
import { useTenant, useIsGerente } from '@/contexts/TenantContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** Valor do item "Voltar para a Conta". Não colide com id de Loja (uuid). */
const BACK_TO_ACCOUNT_VALUE = '__voltar_para_conta__';

/**
 * Seletor de Loja do Gerente. Troca a Loja ativa — dashboard, conversas,
 * campanhas etc. passam a refletir a loja escolhida (reaproveita o mecanismo de
 * tenant ativo do TenantContext). Só renderiza para um gerente que tenha ao
 * menos uma loja; para gestor/atendente não aparece.
 *
 * Com uma Loja aberta, o primeiro item é "Voltar para a Conta": limpa a escolha
 * (`setActiveTenant(null)`, o mesmo que o "Sair" do seletor do superadmin) e a
 * tela volta à Conta do próprio gerente. Antes dele, o único caminho de volta
 * era sair e entrar de novo — e a Conta tem dados próprios (ex.: as conversas
 * dela). A conexão do Instagram NÃO é um deles: ela fica sempre numa Loja
 * (decisão de 2026-09-25; create_instagram_instance recusa Conta).
 */
export const StoreSwitcher = () => {
  const isGerente = useIsGerente();
  const { tenantId, setActiveTenant } = useTenant();
  const { stores, isLoading } = useMyStores();

  if (!isGerente || isLoading || stores.length === 0) return null;

  const current = stores.find((s) => s.id === tenantId)?.id;

  const handleChange = (value: string) => {
    if (value === BACK_TO_ACCOUNT_VALUE) {
      setActiveTenant(null);
      return;
    }
    setActiveTenant(value);
  };

  return (
    <Select value={current} onValueChange={handleChange}>
      {/* Encolhe até caber (o nome trunca) em vez de ter largura fixa: é o
          item que cede quando a Navbar fica apertada. */}
      <SelectTrigger className="min-w-0 flex-1 max-w-[220px] gap-1.5 px-2 sm:gap-2 sm:px-3" aria-label="Selecionar loja">
        <Store className="h-4 w-4 shrink-0 text-muted-foreground" />
        <SelectValue placeholder="Selecionar loja" />
      </SelectTrigger>
      <SelectContent>
        {current && (
          <>
            <SelectItem value={BACK_TO_ACCOUNT_VALUE} className="text-muted-foreground">
              <span className="flex items-center gap-2">
                <ArrowLeft className="h-4 w-4 shrink-0" />
                Voltar para a Conta
              </span>
            </SelectItem>
            <SelectSeparator />
          </>
        )}
        {stores.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default StoreSwitcher;
