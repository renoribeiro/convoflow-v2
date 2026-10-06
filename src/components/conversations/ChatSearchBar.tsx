import { useEffect, useRef } from 'react';
import { ChevronUp, ChevronDown, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ChatSearchBarProps {
  term: string;
  onTermChange: (term: string) => void;
  matchCount: number;
  /** 0-based index of the active match, or -1 when there are none. */
  activeIndex: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  isSearching?: boolean;
}

/**
 * Inline search bar that slides down below the conversation header.
 * ESC closes (handled here with stopPropagation so it doesn't bubble up and
 * deselect the conversation). Enter jumps to next match, Shift+Enter to previous.
 */
export function ChatSearchBar({
  term,
  onTermChange,
  matchCount,
  activeIndex,
  onPrev,
  onNext,
  onClose,
  isSearching,
}: ChatSearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) onPrev();
      else onNext();
    }
  };

  const counterLabel = term.trim()
    ? matchCount > 0
      ? `${activeIndex + 1} de ${matchCount}`
      : isSearching
      ? 'Buscando...'
      : 'Nenhum resultado'
    : '';

  return (
    <div className="flex items-center gap-2 border-b border-border bg-card px-4 py-2 animate-slide-down">
      <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      <Input
        ref={inputRef}
        value={term}
        onChange={(e) => onTermChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Buscar nesta conversa..."
        className="h-8 flex-1 border-0 bg-transparent px-0 focus-visible:ring-0"
      />
      {counterLabel && (
        <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
          {counterLabel}
        </span>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={onPrev}
        disabled={matchCount === 0}
        aria-label="Resultado anterior"
      >
        <ChevronUp className="w-4 h-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={onNext}
        disabled={matchCount === 0}
        aria-label="Próximo resultado"
      >
        <ChevronDown className="w-4 h-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={onClose}
        aria-label="Fechar busca"
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}
