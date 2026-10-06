import { useEffect } from 'react';

interface ConversationShortcutsOptions {
  /** Desktop-only — the parent passes `false` on mobile to disable all shortcuts. */
  enabled: boolean;
  isSearchOpen: boolean;
  isPanelOpen: boolean;
  hasSelection: boolean;
  /** ESC priority chain. */
  closeSearch: () => void;
  closePanel: () => void;
  deselect: () => void;
  /** Ctrl+K — focus the conversation list search input. */
  focusListSearch: () => void;
  /** Ctrl+Shift+F — open the in-conversation search (no-op without a selection). */
  openChatSearch: () => void;
  /** Ctrl+N — open the "new conversation" modal. */
  openNewConversation: () => void;
  /** Arrow Up/Down — move between conversations in the list. */
  navigateList: (direction: 'up' | 'down') => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
}

/** A Radix dialog/sheet/popover is open — most shortcuts should yield to it. */
function isModalOpen(): boolean {
  return !!document.querySelector('[role="dialog"]');
}

/**
 * Centralizes the Conversations page keyboard shortcuts. Desktop-only; the page
 * passes `enabled: !isMobile`. All shortcuts (except those the components own,
 * like the search bar's local ESC) defer to any open modal.
 */
export function useConversationShortcuts(opts: ConversationShortcutsOptions) {
  const {
    enabled,
    isSearchOpen,
    isPanelOpen,
    hasSelection,
    closeSearch,
    closePanel,
    deselect,
    focusListSearch,
    openChatSearch,
    openNewConversation,
    navigateList,
  } = opts;

  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;

      // Ctrl+K — focus list search (works even from inputs).
      if (ctrl && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
        if (isModalOpen()) return;
        e.preventDefault();
        focusListSearch();
        return;
      }

      // Ctrl+Shift+F — open in-conversation search.
      if (ctrl && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        if (isModalOpen() || !hasSelection) return;
        e.preventDefault();
        openChatSearch();
        return;
      }

      // Ctrl+N — new conversation.
      if (ctrl && !e.shiftKey && (e.key === 'n' || e.key === 'N')) {
        if (isModalOpen()) return;
        e.preventDefault();
        openNewConversation();
        return;
      }

      // ESC — priority chain: search → contact panel → deselect.
      if (e.key === 'Escape') {
        if (isModalOpen()) return; // let the dialog handle its own ESC
        if (isSearchOpen) {
          e.preventDefault();
          closeSearch();
        } else if (isPanelOpen) {
          e.preventDefault();
          closePanel();
        } else if (hasSelection) {
          e.preventDefault();
          deselect();
        }
        return;
      }

      // Arrow navigation — only when not typing and no modal.
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !isTypingTarget(e.target) && !isModalOpen()) {
        e.preventDefault();
        navigateList(e.key === 'ArrowUp' ? 'up' : 'down');
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    enabled,
    isSearchOpen,
    isPanelOpen,
    hasSelection,
    closeSearch,
    closePanel,
    deselect,
    focusListSearch,
    openChatSearch,
    openNewConversation,
    navigateList,
  ]);
}
