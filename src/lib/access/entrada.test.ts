import { describe, expect, it } from 'vitest';
import { decidirEntrada, type EstadoDaEntrada } from './entrada';

/** Tudo respondido, Conta liberada, manutenção desligada: entra. */
const PRONTO: EstadoDaEntrada = {
  sessaoCarregando: false,
  temSessao: true,
  perfilCarregando: false,
  statusDoPerfil: 'active',
  papel: 'gestor',
  manutencao: { carregando: false, esperaExpirou: false, ligada: false },
  acesso: { carregando: false, bloqueado: false },
  modulosCarregando: false,
};

const com = (patch: Partial<EstadoDaEntrada>): EstadoDaEntrada => ({ ...PRONTO, ...patch });

describe('decidirEntrada: a ordem das regras', () => {
  it('tudo respondido e liberado: entra', () => {
    expect(decidirEntrada(PRONTO)).toBe('liberado');
  });

  it('sessão ainda sendo lida: carregando', () => {
    expect(decidirEntrada(com({ sessaoCarregando: true, temSessao: false }))).toBe('carregando');
  });

  it('sem sessão: login, antes de qualquer outra pergunta', () => {
    expect(
      decidirEntrada(com({ temSessao: false, manutencao: { carregando: false, esperaExpirou: false, ligada: true } })),
    ).toBe('login');
  });

  it('perfil ainda carregando: carregando', () => {
    expect(decidirEntrada(com({ perfilCarregando: true, papel: null }))).toBe('carregando');
  });

  it.each(['suspended', 'deleted'])('perfil %s: sai', (status) => {
    expect(decidirEntrada(com({ statusDoPerfil: status }))).toBe('sair');
  });

  it('perfil pendente: cadastro incompleto, mesmo com manutenção ligada', () => {
    expect(
      decidirEntrada(
        com({ statusDoPerfil: 'pending', manutencao: { carregando: false, esperaExpirou: false, ligada: true } }),
      ),
    ).toBe('pendente');
  });
});

describe('decidirEntrada: superadmin', () => {
  it('entra com manutenção ligada e Conta bloqueada, sem esperar nada', () => {
    expect(
      decidirEntrada(
        com({
          papel: 'superadmin',
          manutencao: { carregando: true, esperaExpirou: false, ligada: true },
          acesso: { carregando: true, bloqueado: true },
          modulosCarregando: true,
        }),
      ),
    ).toBe('liberado');
  });
});

describe('decidirEntrada: manutenção (falha aberta)', () => {
  it.each(['gerente', 'gestor', 'atendente'])('ligada bloqueia o %s', (papel) => {
    expect(decidirEntrada(com({ papel, manutencao: { carregando: false, esperaExpirou: false, ligada: true } }))).toBe(
      'manutencao',
    );
  });

  it('sem resposta ainda: carregando', () => {
    expect(decidirEntrada(com({ manutencao: { carregando: true, esperaExpirou: false, ligada: false } }))).toBe(
      'carregando',
    );
  });

  it('sem resposta depois do limite: abre o sistema', () => {
    expect(decidirEntrada(com({ manutencao: { carregando: true, esperaExpirou: true, ligada: false } }))).toBe(
      'liberado',
    );
  });

  it('vem antes do pagamento', () => {
    expect(
      decidirEntrada(
        com({
          manutencao: { carregando: false, esperaExpirou: false, ligada: true },
          acesso: { carregando: false, bloqueado: true },
        }),
      ),
    ).toBe('manutencao');
  });
});

describe('decidirEntrada: pagamento', () => {
  it.each(['gerente', 'gestor', 'atendente'])('Conta sem acesso bloqueia o %s', (papel) => {
    expect(decidirEntrada(com({ papel, acesso: { carregando: false, bloqueado: true } }))).toBe('bloqueio');
  });

  it('acesso sem resposta: carregando, nunca bloqueio', () => {
    expect(decidirEntrada(com({ acesso: { carregando: true, bloqueado: false } }))).toBe('carregando');
  });

  it('Conta bloqueada não espera os módulos para mostrar o bloqueio', () => {
    expect(decidirEntrada(com({ acesso: { carregando: false, bloqueado: true }, modulosCarregando: true }))).toBe(
      'bloqueio',
    );
  });
});

describe('decidirEntrada: módulos', () => {
  it('liberado mas com módulos no ar: segue no mesmo esqueleto', () => {
    expect(decidirEntrada(com({ modulosCarregando: true }))).toBe('carregando');
  });
});
