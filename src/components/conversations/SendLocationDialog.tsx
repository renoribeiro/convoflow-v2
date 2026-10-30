/**
 * "Localização", no clipe das Conversas (lote 6f, B5, decisão D4).
 *
 * Dois jeitos de montar o ponto: a posição do aparelho (o navegador pede a
 * permissão) ou o endereço digitado (uma busca no OpenStreetMap por clique).
 * "Continuar" abre a confirmação do sistema com o que vai sair: nome, endereço
 * ou coordenadas, e o link para conferir no mapa. Só a confirmação envia.
 *
 * O envio é do ChatWindow (onSend), pelo servidor, nos três provedores. Esta
 * janela não sabe de provedor nem de conversa.
 */
import { useEffect, useState } from 'react';
import { ExternalLink, Loader2, LocateFixed, MapPin, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfirmationDialog } from '@/components/shared/ConfirmationDialog';
import { cn } from '@/lib/utils';
import {
  buscarEndereco,
  coordenadasEmTexto,
  lerPosicaoAtual,
  linkDoMapa,
  motivoDaBusca,
  motivoDaPosicao,
  type PontoDoMapa,
} from '@/lib/conversations/localizacao';

interface SendLocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Nome do cliente, para a confirmação dizer para quem vai. */
  contactName: string;
  /**
   * Envia de verdade. true: saiu ou ficou gravada com o motivo da falha (a
   * janela fecha); false: uma guarda barrou antes (a janela fica).
   */
  onSend: (ponto: PontoDoMapa) => Promise<boolean>;
}

type Modo = 'atual' | 'endereco';

export function SendLocationDialog({ open, onOpenChange, contactName, onSend }: SendLocationDialogProps) {
  const [modo, setModo] = useState<Modo>('atual');
  const [ponto, setPonto] = useState<PontoDoMapa | null>(null);
  const [nome, setNome] = useState('');
  const [endereco, setEndereco] = useState('');
  const [resultados, setResultados] = useState<PontoDoMapa[]>([]);
  const [ocupado, setOcupado] = useState<'posicao' | 'busca' | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  // Cada abertura começa do zero: nada de localização velha pronta para sair.
  useEffect(() => {
    if (open) return;
    setModo('atual');
    setPonto(null);
    setNome('');
    setEndereco('');
    setResultados([]);
    setOcupado(null);
    setAviso(null);
    setConfirmando(false);
  }, [open]);

  const escolher = (p: PontoDoMapa) => {
    setPonto(p);
    setNome(p.nome ?? '');
    setAviso(null);
  };

  const usarPosicao = async () => {
    setOcupado('posicao');
    setAviso(null);
    const r = await lerPosicaoAtual();
    setOcupado(null);
    if (r.ok) escolher(r.ponto);
    else setAviso(motivoDaPosicao(r.motivo));
  };

  const buscar = async () => {
    setOcupado('busca');
    setAviso(null);
    setPonto(null);
    setResultados([]);
    const r = await buscarEndereco(endereco);
    setOcupado(null);
    if (!r.ok) {
      setAviso(motivoDaBusca(r.motivo));
      return;
    }
    setResultados(r.pontos);
    if (r.pontos.length === 1) escolher(r.pontos[0]!);
  };

  const final: PontoDoMapa | null = ponto
    ? { ...ponto, nome: nome.trim() || undefined }
    : null;

  return (
    <>
      <Dialog open={open && !confirmando} onOpenChange={(v) => !ocupado && onOpenChange(v)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg" data-testid="janela-localizacao">
          <DialogHeader>
            <DialogTitle>Enviar localização</DialogTitle>
            <DialogDescription>
              O cliente recebe no WhatsApp um cartão com o ponto no mapa.
            </DialogDescription>
          </DialogHeader>

          <Tabs
            value={modo}
            onValueChange={(v) => {
              setModo(v as Modo);
              setPonto(null);
              setResultados([]);
              setAviso(null);
            }}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="atual">Minha localização</TabsTrigger>
              <TabsTrigger value="endereco">Digitar endereço</TabsTrigger>
            </TabsList>

            <TabsContent value="atual" className="space-y-2 pt-2">
              <p className="text-sm text-muted-foreground">
                Envia o lugar onde este aparelho está agora. O navegador pede a sua permissão na primeira vez.
              </p>
              <Button type="button" variant="outline" onClick={usarPosicao} disabled={!!ocupado} className="w-full">
                {ocupado === 'posicao' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <LocateFixed className="mr-2 h-4 w-4" aria-hidden="true" />
                )}
                {ocupado === 'posicao' ? 'Buscando sua localização...' : 'Usar minha localização atual'}
              </Button>
            </TabsContent>

            <TabsContent value="endereco" className="space-y-2 pt-2">
              <Label htmlFor="localizacao-endereco">Endereço</Label>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void buscar();
                }}
              >
                <Input
                  id="localizacao-endereco"
                  value={endereco}
                  onChange={(e) => setEndereco(e.target.value)}
                  placeholder="Rua, número, bairro e cidade"
                  autoComplete="street-address"
                  disabled={ocupado === 'busca'}
                />
                <Button type="submit" variant="outline" disabled={!!ocupado || !endereco.trim()}>
                  {ocupado === 'busca' ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Search className="mr-2 h-4 w-4" aria-hidden="true" />
                  )}
                  Buscar
                </Button>
              </form>
              <p className="text-xs text-muted-foreground">A busca usa o mapa do OpenStreetMap, só no Brasil.</p>

              {resultados.length > 1 && (
                <div className="space-y-1" role="group" aria-label="Escolha o lugar">
                  <p className="text-xs font-medium text-muted-foreground">Escolha o lugar certo:</p>
                  {resultados.map((r) => {
                    const escolhido = ponto?.latitude === r.latitude && ponto?.longitude === r.longitude;
                    return (
                      <button
                        key={`${r.latitude},${r.longitude}`}
                        type="button"
                        onClick={() => escolher(r)}
                        aria-pressed={escolhido}
                        className={cn(
                          'flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left text-sm',
                          escolhido ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted',
                        )}
                      >
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="min-w-0">{r.endereco ?? coordenadasEmTexto(r.latitude, r.longitude)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>

          {aviso && (
            <p className="text-sm text-destructive" role="alert">
              {aviso}
            </p>
          )}

          {ponto && (
            <div className="space-y-3 rounded-md border bg-muted/30 p-3" data-testid="localizacao-escolhida">
              <div className="space-y-1">
                <Label htmlFor="localizacao-nome">Nome do lugar (opcional)</Label>
                <Input
                  id="localizacao-nome"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Por exemplo: Loja Centro"
                  maxLength={100}
                />
              </div>
              <div className="text-sm">
                {ponto.endereco && <p className="text-foreground">{ponto.endereco}</p>}
                <p className="text-xs text-muted-foreground">{coordenadasEmTexto(ponto.latitude, ponto.longitude)}</p>
              </div>
              <a
                href={linkDoMapa(ponto.latitude, ponto.longitude)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary underline underline-offset-2"
              >
                Ver no mapa
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={!!ocupado}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => setConfirmando(true)} disabled={!ponto || !!ocupado}>
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {final && (
        <ConfirmationDialog
          isOpen={open && confirmando}
          onClose={() => setConfirmando(false)}
          title="Enviar esta localização?"
          confirmText="Enviar localização"
          cancelText="Voltar"
          icon={<MapPin className="h-5 w-5" />}
          reversivel={false}
          description={
            <div className="space-y-2">
              <p>
                Vai para <span className="font-medium text-foreground">{contactName}</span> pelo WhatsApp:
              </p>
              <div className="rounded-md border bg-muted/30 px-3 py-2" data-testid="confirmacao-localizacao">
                <p className="font-medium text-foreground">{final.nome ?? 'Localização'}</p>
                {final.endereco && <p className="text-xs">{final.endereco}</p>}
                <p className="text-xs">{coordenadasEmTexto(final.latitude, final.longitude)}</p>
              </div>
              <a
                href={linkDoMapa(final.latitude, final.longitude)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2"
              >
                Conferir no mapa
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </div>
          }
          onConfirm={async () => {
            const saiu = await onSend(final);
            if (!saiu) throw new Error('localização barrada antes do envio');
            onOpenChange(false);
          }}
        />
      )}
    </>
  );
}

export default SendLocationDialog;
