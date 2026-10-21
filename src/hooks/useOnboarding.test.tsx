/**
 * O hook da lista "Primeiros passos": pede a função com a Conta/Loja em foco,
 * filtra pelo MESMO useHelpVisibility da Ajuda (módulo e cargo) e decide o que
 * mostrar. Superadmin não chama nada.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { ChecklistStatus } from '@/lib/onboarding/checklist';
import type { OnboardingState } from '@/lib/onboarding/state';

let papel: string = 'gestor';
let tenantId: string | null = 'aaaaaaaa-0000-4000-8000-0000000000b1';
let modulos: string[] = ['conversations', 'funnel', 'whatsapp-numbers', 'chatbots'];
let estado: OnboardingState = {};
let resposta: ChecklistStatus | null = null;

const fetchChecklistStatus = vi.fn(async (_t: string) => resposta);
const fetchOnboardingState = vi.fn(async (_u: string) => estado);

vi.mock('@/lib/onboarding/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/onboarding/api')>();
  return {
    ...real,
    fetchChecklistStatus: (t: string) => fetchChecklistStatus(t),
    fetchOnboardingState: (u: string) => fetchOnboardingState(u),
  };
});
vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenantId, profile: { user_id: 'aaaaaaaa-0000-4000-8000-000000000099' } }),
  useRole: () => papel,
}));
vi.mock('@/hooks/useModules', () => ({
  useModules: () => ({ isModuleVisible: (m: string) => modulos.includes(m), isLoading: false }),
}));

import { useOnboardingChecklist } from './useOnboarding';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const st = (p: ChecklistStatus['papel'], passos: Record<string, boolean>): ChecklistStatus => ({
  papel: p,
  tenantId,
  lojas: null,
  passos,
});

beforeEach(() => {
  papel = 'gestor';
  tenantId = 'aaaaaaaa-0000-4000-8000-0000000000b1';
  modulos = ['conversations', 'funnel', 'whatsapp-numbers', 'chatbots'];
  estado = {};
  resposta = null;
  fetchChecklistStatus.mockClear();
  fetchOnboardingState.mockClear();
});

describe('useOnboardingChecklist', () => {
  it('pede a função com a Conta/Loja em foco', async () => {
    resposta = st('gestor', {});
    const { result } = renderHook(() => useOnboardingChecklist(), { wrapper });
    await waitFor(() => expect(result.current.view).toBe('lista'));
    expect(fetchChecklistStatus).toHaveBeenCalledWith('aaaaaaaa-0000-4000-8000-0000000000b1');
  });

  it('módulo desligado some da lista (mesmo filtro da Ajuda)', async () => {
    modulos = ['conversations', 'funnel'];
    resposta = st('gestor', {});
    const { result } = renderHook(() => useOnboardingChecklist(), { wrapper });
    await waitFor(() => expect(result.current.summary).not.toBeNull());
    const ids = result.current.summary!.items.map((i) => i.id);
    expect(ids).not.toContain('whatsapp');
    expect(ids).not.toContain('chatbot');
    expect(ids).toContain('funil');
  });

  it('atendente sem o módulo de Conversas não vê "primeira conversa"', async () => {
    papel = 'atendente';
    modulos = ['funnel'];
    resposta = st('atendente', {});
    const { result } = renderHook(() => useOnboardingChecklist(), { wrapper });
    await waitFor(() => expect(result.current.summary).not.toBeNull());
    expect(result.current.summary!.items.map((i) => i.id)).toEqual(['foto', 'notificacoes']);
  });

  it('veterano: só com obrigatório pendente', async () => {
    papel = 'gerente';
    estado = { veterano: true, boas_vindas_em: '2026-10-21T12:00:00Z' };
    resposta = st('gerente', { assinatura: true, loja: true, whatsapp: false, equipe: true });
    const { result } = renderHook(() => useOnboardingChecklist(), { wrapper });
    await waitFor(() => expect(result.current.view).toBe('lista'));

    resposta = st('gerente', { assinatura: true, loja: true, whatsapp: true, equipe: true });
    const outro = renderHook(() => useOnboardingChecklist(), { wrapper });
    await waitFor(() => expect(outro.result.current.summary).not.toBeNull());
    expect(outro.result.current.view).toBe('oculto');
  });

  it('superadmin: não chama nada, nada aparece', async () => {
    papel = 'superadmin';
    const { result } = renderHook(() => useOnboardingChecklist(), { wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchChecklistStatus).not.toHaveBeenCalled();
    expect(fetchOnboardingState).not.toHaveBeenCalled();
    expect(result.current.view).toBe('oculto');
  });

  it('função com erro: nada aparece (falha calada)', async () => {
    fetchChecklistStatus.mockRejectedValueOnce(new Error('rede'));
    const { result } = renderHook(() => useOnboardingChecklist(), { wrapper });
    await new Promise((r) => setTimeout(r, 30));
    expect(result.current.view).toBe('oculto');
  });
});
