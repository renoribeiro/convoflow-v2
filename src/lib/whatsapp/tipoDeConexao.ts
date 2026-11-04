/**
 * Como a tela de Números de WhatsApp chama o tipo de conexão de cada número
 * (decisão do dono, 2026-11-04): o cartão do número, a janela de Detalhes e a
 * de Excluir dizem o provedor, porque a agência precisa saber qual painel
 * abrir. Fora dessa tela (Conversas, Nova conversa) continua valendo o
 * `providerLabel` de src/services/whatsapp/factory.ts, que o Atendente também
 * vê e que não mudou.
 */
export function tipoDeConexao(provider?: string | null): string {
  switch (provider) {
    case 'official':
      return 'API oficial da Meta';
    case 'waha':
      return 'Seu servidor (WAHA)';
    case 'instagram':
      return 'Instagram';
    case 'evolution':
    default:
      return 'QR Code (Evolution)';
  }
}
