import { Fragment, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Bot,
  Download,
  ExternalLink,
  FileText,
  MapPin,
  Megaphone,
  Mic,
  Trash2,
  Zap,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MessageStatusIcon } from './MessageStatusIcon';

/** Click-to-WhatsApp ad referral (Meta `messages[].referral`). All fields optional. */
export type AdReferral = {
  source_url?: string | null;
  source_id?: string | null;
  source_type?: string | null;
  headline?: string | null;
  body?: string | null;
  media_type?: string | null;
  image_url?: string | null;
  video_url?: string | null;
  thumbnail_url?: string | null;
  ctwa_clid?: string | null;
};

export type RenderableMessage = {
  id: string;
  content: string | null;
  created_at: string;
  direction: 'inbound' | 'outbound';
  // 'deleted' é gravado pelos webhooks quando o cliente apaga a mensagem
  // (evolution-webhook: processMessageDelete), junto com content='[Mensagem apagada]'.
  status: 'sent' | 'delivered' | 'read' | 'failed' | 'pending' | 'deleted';
  message_type: string; // 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'location' | 'reaction' | 'contact' | 'deleted' | ...
  media_url?: string | null;
  // Optional metadata fields some webhooks store inside content as JSON.
  metadata?: Record<string, unknown> | null;
  quoted?: {
    id: string;
    content?: string | null;
    sender?: string | null;
  } | null;
  /** Identifies the send origin: 'campaign', 'chatbot', or null for manual. */
  source?: string | null;
  /** When source === 'campaign', this links to mass_message_campaigns.id. */
  campaign_id?: string | null;
  /** Resolved campaign name — optionally injected by the parent. */
  campaign_name?: string | null;
  is_from_bot?: boolean | null;
  /** CTWA ad referral on the first inbound message from a Click-to-WhatsApp ad. */
  ad_referral?: AdReferral | null;
};

/** Characters after which a text message gets a "Ver mais"/"Ver menos" toggle. */
const LONG_MESSAGE_THRESHOLD = 500;

/** Wraps occurrences of `term` (case-insensitive) in <mark> for in-conversation search. */
function highlightText(text: string, term?: string): React.ReactNode {
  if (!term || !term.trim()) return text;
  const needle = term.trim();
  const safe = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${safe})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === needle.toLowerCase() ? (
      <mark key={i} className="bg-primary/30 text-foreground rounded-sm">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

/** Detecta URLs http(s) para transformar em links clicáveis. */
const URL_SPLIT_REGEX = /(https?:\/\/[^\s]+)/g;

/**
 * Renderiza o texto tornando URLs clicáveis e ainda destacando o termo de busca
 * nos trechos que não são link.
 */
function renderTextWithLinks(text: string, term?: string): React.ReactNode {
  const segments = text.split(URL_SPLIT_REGEX);
  return segments.map((seg, i) => {
    if (/^https?:\/\//.test(seg)) {
      return (
        <a
          key={i}
          href={seg}
          target="_blank"
          rel="noopener noreferrer"
          className="underline break-all hover:opacity-80"
        >
          {seg}
        </a>
      );
    }
    return <Fragment key={i}>{highlightText(seg, term)}</Fragment>;
  });
}

function tryParseMetadata(message: RenderableMessage): Record<string, any> {
  if (message.metadata) return message.metadata as Record<string, any>;
  if (typeof message.content === 'string' && message.content.startsWith('{')) {
    try {
      return JSON.parse(message.content);
    } catch {
      return {};
    }
  }
  return {};
}

function MediaImage({ url, caption, onOpen }: { url: string; caption?: string | null; onOpen: () => void }) {
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onOpen}
        className="block max-w-[280px] rounded-lg overflow-hidden border border-border/40"
      >
        <img src={url} alt={caption ?? 'Imagem enviada'} className="max-h-[260px] w-auto object-cover" loading="lazy" />
      </button>
      {caption && <p className="text-sm whitespace-pre-wrap">{caption}</p>}
    </div>
  );
}

function MediaVideo({ url, caption }: { url: string; caption?: string | null }) {
  return (
    <div className="space-y-2">
      <video controls className="max-w-[280px] rounded-lg overflow-hidden border border-border/40" preload="metadata">
        <source src={url} />
        Seu navegador não suporta vídeo.
      </video>
      {caption && <p className="text-sm whitespace-pre-wrap">{caption}</p>}
    </div>
  );
}

function MediaAudio({ url, isPtt }: { url: string; isPtt: boolean }) {
  return (
    <div className="flex items-center gap-2 min-w-[200px]">
      {isPtt && <Mic className="w-4 h-4 opacity-70" aria-label="Mensagem de voz" />}
      <audio controls preload="metadata" src={url} className="w-full max-w-[260px]">
        Seu navegador não suporta áudio.
      </audio>
    </div>
  );
}

function MediaDocument({ url, fileName, caption }: { url: string; fileName?: string | null; caption?: string | null }) {
  return (
    <div className="space-y-2">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 px-3 py-2 rounded-md border border-border/40 bg-background/40 hover:bg-background/70"
      >
        <FileText className="w-5 h-5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{fileName || 'Documento'}</p>
          <p className="text-xs opacity-70">Toque para abrir / baixar</p>
        </div>
        <Download className="w-4 h-4 opacity-70" />
      </a>
      {caption && <p className="text-sm whitespace-pre-wrap">{caption}</p>}
    </div>
  );
}

function MediaLocation({ latitude, longitude, name, address }: {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}) {
  const href = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 px-3 py-2 rounded-md border border-border/40 bg-background/40 hover:bg-background/70"
    >
      <MapPin className="w-5 h-5 text-accent" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{name || 'Localização compartilhada'}</p>
        <p className="text-xs opacity-70 truncate">{address || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`}</p>
      </div>
      <ExternalLink className="w-4 h-4 opacity-70" />
    </a>
  );
}

function MediaContact({ name, phone }: { name?: string; phone?: string }) {
  return (
    <div className="px-3 py-2 rounded-md border border-border/40 bg-background/40 min-w-[180px]">
      <p className="text-sm font-medium">{name || 'Contato'}</p>
      {phone && <p className="text-xs opacity-70">{phone}</p>}
    </div>
  );
}

function MediaSticker({ url }: { url: string }) {
  return <img src={url} alt="Sticker" className="w-32 h-32 object-contain" />;
}

function ReactionPlaceholder({ emoji }: { emoji?: string }) {
  return (
    <p className="text-sm italic opacity-80">
      Reagiu com {emoji || '👍'}
    </p>
  );
}

function DeletedPlaceholder() {
  return (
    <p className="text-sm italic opacity-60 flex items-center gap-2">
      <Trash2 className="w-3 h-3" />
      Esta mensagem foi apagada.
    </p>
  );
}

/**
 * Card de origem de anúncio (Click-to-WhatsApp). Aparece na primeira mensagem do
 * lead que chegou clicando num anúncio do Face/Insta — mostra ao operador de qual
 * anúncio/produto ele veio (headline, miniatura e link), já que o "link" bruto do
 * referral costuma ser uma URL de tracking difícil de acessar.
 */
function AdReferralCard({ referral }: { referral: AdReferral }) {
  const thumb = referral.image_url || referral.thumbnail_url || null;
  const url = referral.source_url || null;
  const hasBody = Boolean(referral.headline || referral.body);

  return (
    <div className="mb-2 rounded-md border border-accent/30 bg-accent/10 p-2">
      <div className="flex items-center gap-1.5 text-[10px] font-medium text-accent mb-1.5">
        <Megaphone className="w-3 h-3" />
        Veio de um anúncio
      </div>
      <div className="flex gap-2">
        {thumb && (
          <img
            src={thumb}
            alt="Anúncio"
            loading="lazy"
            className="w-12 h-12 rounded object-cover border border-border/40 flex-shrink-0"
          />
        )}
        <div className="min-w-0 flex-1">
          {referral.headline && (
            <p className="text-xs font-medium truncate">{referral.headline}</p>
          )}
          {referral.body && (
            <p className="text-[11px] opacity-70 line-clamp-2">{referral.body}</p>
          )}
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-0.5 text-[11px] font-medium text-accent hover:underline break-all"
            >
              <ExternalLink className="w-3 h-3 flex-shrink-0" />
              Ver anúncio
            </a>
          )}
          {!hasBody && !url && (
            <p className="text-[11px] opacity-70">Anúncio sem detalhes disponíveis.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function OriginBadge({ message }: { message: RenderableMessage }) {
  if (message.direction !== 'outbound') return null;

  const source = message.source;

  if (source === 'campaign') {
    const label = message.campaign_name ? `Campanha: ${message.campaign_name}` : 'Campanha';
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-sm font-medium bg-accent/15 text-accent">
        <Megaphone className="w-3 h-3" />
        {label}
      </span>
    );
  }

  if (source === 'chatbot' || message.is_from_bot) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-sm font-medium bg-primary/20 text-primary-foreground">
        <Bot className="w-3 h-3" />
        Chatbot
      </span>
    );
  }

  return null;
}

interface MessageBubbleProps {
  message: RenderableMessage;
  /**
   * Quando definido, mostra o conteúdo da mensagem citada acima da bolha.
   */
  showQuoted?: boolean;
  onReply?: (message: RenderableMessage) => void;
  /** Termo de busca em destaque (in-conversation search). */
  searchTerm?: string;
  /** True quando esta bolha é o resultado de busca ativo. */
  isActiveMatch?: boolean;
  /**
   * Salvar o texto desta mensagem como resposta rápida. Quando ausente, o botão
   * não aparece — a bolha continua servindo para qualquer tela que só exiba
   * histórico.
   */
  onSaveAsQuickReply?: (content: string) => void;
}

/** Tipos cujo corpo NÃO é texto reaproveitável como resposta rápida. */
const NAO_SALVAVEIS = new Set([
  'image',
  'video',
  'audio',
  'document',
  'sticker',
  'location',
  'contact',
  'reaction',
  'deleted',
]);

export function MessageBubble({
  message,
  showQuoted = true,
  onReply,
  searchTerm,
  isActiveMatch,
  onSaveAsQuickReply,
}: MessageBubbleProps) {
  const isOutbound = message.direction === 'outbound';
  const meta = useMemo(() => tryParseMetadata(message), [message]);
  const [imageOpen, setImageOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const type = (message.message_type || 'text').toLowerCase();
  const url = message.media_url ?? (typeof meta.media_url === 'string' ? meta.media_url : undefined);
  const caption = (typeof meta.caption === 'string' ? meta.caption : undefined) ?? message.content ?? undefined;
  const fileName = (typeof meta.file_name === 'string' ? meta.file_name : undefined) ?? (typeof meta.fileName === 'string' ? meta.fileName : undefined);

  // Só mensagem NOSSA e só texto: guardar a fala do cliente como "resposta
  // rápida" não faz sentido, e o corpo de uma mídia é legenda, não trecho.
  const podeSalvarComoResposta =
    Boolean(onSaveAsQuickReply) &&
    isOutbound &&
    !NAO_SALVAVEIS.has(type) &&
    meta.deleted !== true &&
    Boolean(message.content?.trim());

  const renderBody = () => {
    if (type === 'deleted' || meta.deleted === true) return <DeletedPlaceholder />;
    if (type === 'reaction') return <ReactionPlaceholder emoji={typeof meta.emoji === 'string' ? meta.emoji : message.content ?? undefined} />;

    if (type === 'image' && url) {
      return <MediaImage url={url} caption={caption ?? null} onOpen={() => setImageOpen(true)} />;
    }
    if (type === 'video' && url) {
      return <MediaVideo url={url} caption={caption ?? null} />;
    }
    if (type === 'audio' && url) {
      const isPtt = Boolean(meta.ptt) || Boolean(meta.is_ptt);
      return <MediaAudio url={url} isPtt={isPtt} />;
    }
    if (type === 'document' && url) {
      return <MediaDocument url={url} fileName={fileName} caption={caption ?? null} />;
    }
    if (type === 'sticker' && url) {
      return <MediaSticker url={url} />;
    }
    if (type === 'location') {
      const lat = Number(meta.latitude);
      const lng = Number(meta.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return (
          <MediaLocation
            latitude={lat}
            longitude={lng}
            name={typeof meta.name === 'string' ? meta.name : undefined}
            address={typeof meta.address === 'string' ? meta.address : undefined}
          />
        );
      }
    }
    if (type === 'contact') {
      return (
        <MediaContact
          name={typeof meta.name === 'string' ? meta.name : undefined}
          phone={typeof meta.phone === 'string' ? meta.phone : undefined}
        />
      );
    }

    // Default: text — with optional "Ver mais" toggle for long messages.
    const text = message.content || '';
    const isLong = text.length > LONG_MESSAGE_THRESHOLD;
    return (
      <div>
        <p className={`text-sm whitespace-pre-wrap break-words ${isLong && !expanded ? 'line-clamp-[12]' : ''}`}>
          {renderTextWithLinks(text, searchTerm)}
        </p>
        {isLong && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-1 text-xs font-medium text-accent hover:underline"
          >
            {expanded ? 'Ver menos' : 'Ver mais'}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`group max-w-[78%] p-3 transition-shadow ${
          isOutbound
            ? 'bg-primary text-foreground rounded-lg rounded-tr-sm'
            : 'bg-muted text-foreground rounded-lg rounded-tl-sm'
        } ${isActiveMatch ? 'ring-2 ring-primary/50' : ''}`}
        onDoubleClick={() => onReply?.(message)}
      >
        {!isOutbound && message.ad_referral && (
          <AdReferralCard referral={message.ad_referral} />
        )}

        {showQuoted && message.quoted && (
          <div className="mb-2 px-2 py-1 border-l-2 border-current/40 bg-background/20 rounded-sm">
            <p className="text-xs opacity-70">{message.quoted.sender || 'Em resposta a'}</p>
            <p className="text-xs opacity-90 line-clamp-2">{message.quoted.content || '...'}</p>
          </div>
        )}

        {renderBody()}

        <div className="flex items-center justify-between gap-3 mt-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground/70">
              {format(new Date(message.created_at), 'dd/MM HH:mm', { locale: ptBR })}
            </span>
            <OriginBadge message={message} />
          </div>
          <span className="flex items-center gap-1">
            {podeSalvarComoResposta && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    // A bolha já tinha a classe `group`; aqui ela finalmente
                    // serve para alguma coisa. `focus-visible` mantém o botão
                    // alcançável por teclado, onde não existe hover.
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity rounded-sm p-0.5 hover:bg-background/30"
                    aria-label="Salvar como resposta rápida"
                    onClick={() => onSaveAsQuickReply?.(message.content ?? '')}
                  >
                    <Zap className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  Salvar como resposta rápida
                </TooltipContent>
              </Tooltip>
            )}
            {isOutbound && <MessageStatusIcon status={message.status} />}
          </span>
        </div>
      </div>

      {type === 'image' && url && (
        <Dialog open={imageOpen} onOpenChange={setImageOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="sr-only">Imagem ampliada</DialogTitle>
            </DialogHeader>
            <img src={url} alt={caption ?? 'Imagem'} className="w-full h-auto rounded-lg" />
            {caption && <p className="text-sm whitespace-pre-wrap mt-2">{caption}</p>}
            <Button asChild variant="outline" size="sm" className="mt-2 w-fit">
              <a href={url} target="_blank" rel="noopener noreferrer" download>
                <Download className="w-4 h-4 mr-2" /> Baixar
              </a>
            </Button>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export function pickMessagePreview(message: RenderableMessage): string {
  const t = (message.message_type || 'text').toLowerCase();
  if (t === 'image') return '📷 Imagem';
  if (t === 'video') return '📹 Vídeo';
  if (t === 'audio') return '🎤 Áudio';
  if (t === 'document') return '📄 Documento';
  if (t === 'sticker') return '🖼️ Figurinha';
  if (t === 'location') return '📍 Localização';
  if (t === 'contact') return '👤 Contato';
  if (t === 'reaction') return '❤️ Reação';
  if (t === 'deleted') return '🚫 Mensagem apagada';
  return message.content || '';
}
