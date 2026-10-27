import { describe, it, expect } from 'vitest';
import { MOTIVOS_AUDIO_BLOQUEADO, motivoAudioBloqueado, type EstadoEnvioAudio } from './audioBlock';

const liberado: EstadoEnvioAudio = {
  temInstancia: true,
  nomeInstancia: 'Principal',
  conectada: true,
  foraDaJanela24h: false,
  temTelefone: true,
};

describe('motivoAudioBloqueado: o microfone avisa antes de gravar', () => {
  it('tudo certo: microfone liberado', () => {
    expect(motivoAudioBloqueado(liberado)).toBeNull();
  });

  it('janela de 24h fechada (número oficial): trava com o caminho do template', () => {
    expect(motivoAudioBloqueado({ ...liberado, foraDaJanela24h: true })).toBe(
      'O cliente não escreve há mais de 24 horas. Envie um template aprovado (mensagem pronta que a Meta aprovou) para reabrir a conversa.',
    );
  });

  it('número desconectado: trava dizendo qual instância', () => {
    expect(motivoAudioBloqueado({ ...liberado, conectada: false })).toBe(
      'O número "Principal" está desconectado. Peça ao Gestor da Loja para reconectar antes de enviar áudio.',
    );
  });

  it('sem instância nenhuma', () => {
    expect(motivoAudioBloqueado({ ...liberado, temInstancia: false, conectada: false })).toBe(
      MOTIVOS_AUDIO_BLOQUEADO.semInstancia,
    );
  });

  it('contato sem telefone', () => {
    expect(motivoAudioBloqueado({ ...liberado, temTelefone: false })).toBe(MOTIVOS_AUDIO_BLOQUEADO.semTelefone);
  });

  it('desconectado vence a janela: reconectar vem antes de qualquer template', () => {
    expect(motivoAudioBloqueado({ ...liberado, conectada: false, foraDaJanela24h: true })).toBe(
      MOTIVOS_AUDIO_BLOQUEADO.desconectada('Principal'),
    );
  });
});
