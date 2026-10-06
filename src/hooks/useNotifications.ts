/**
 * useNotifications
 * 
 * Global notification hook for incoming WhatsApp messages.
 * Handles:
 * - Browser push notifications (Notification API)
 * - Sound alerts
 * - Visual toast notifications (via sonner)
 * - Title flashing for unread messages
 */

import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';

// Notification sound — short base64-encoded "ding" tone
// This avoids needing an external audio file
const NOTIFICATION_SOUND_URL = 'data:audio/wav;base64,UklGRl9vT19teleVIFNvdW5kIEVmZmVjdA==';

interface NotifyOptions {
  /** Contact name or phone */
  contactName: string;
  /** Message content preview */
  messagePreview: string;
  /** Contact phone number */
  contactPhone?: string;
  /** Conversation ID to navigate to */
  conversationId?: string;
}

// Track if browser notification permission has been requested
let permissionRequested = false;

/**
 * Request browser notification permission.
 * Should be called once on user interaction (e.g., page load within dashboard).
 */
export function requestNotificationPermission(): void {
  if (permissionRequested) return;
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    permissionRequested = true;
    return;
  }

  permissionRequested = true;
  Notification.requestPermission().catch(() => {
    // Silent fail — user denied or browser doesn't support
  });
}

/**
 * Play a short notification sound.
 */
function playNotificationSound(): void {
  try {
    // Use Web Audio API for a simple beep — more reliable than loading audio files
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.frequency.value = 830; // Hz — pleasant notification tone
    oscillator.type = 'sine';
    gainNode.gain.value = 0.3; // Volume (0-1)

    oscillator.start();

    // Fade out for a smooth sound
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
    oscillator.stop(audioCtx.currentTime + 0.3);

    // Clean up after sound finishes
    setTimeout(() => {
      audioCtx.close().catch(() => {});
    }, 500);
  } catch {
    // Audio not supported — silent fallback
  }
}

/**
 * Show a browser push notification.
 */
function showBrowserNotification(options: NotifyOptions): void {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  try {
    const notification = new Notification(`💬 ${options.contactName}`, {
      body: options.messagePreview.length > 100
        ? options.messagePreview.substring(0, 100) + '...'
        : options.messagePreview,
      icon: '/favicon.ico',
      tag: `msg-${options.contactPhone || 'unknown'}`, // Prevents duplicate notifications for same contact
      requireInteraction: false,
      silent: true, // We handle our own sound
    });

    // Auto-close after 5 seconds
    setTimeout(() => notification.close(), 5000);

    // Navigate to conversation on click
    notification.onclick = () => {
      window.focus();
      if (options.conversationId) {
        window.location.hash = '';
        window.location.pathname = `/dashboard/conversations`;
        // The conversation ID will be handled by the app state
      }
      notification.close();
    };
  } catch {
    // Notification API error — silent fallback
  }
}

/**
 * Hook that provides notification capabilities for incoming messages.
 * Should be used at a global level (e.g., DashboardLayout).
 */
export const useNotifications = () => {
  const originalTitle = useRef(document.title);
  const flashIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unreadCountRef = useRef(0);

  // Request permission on mount
  useEffect(() => {
    requestNotificationPermission();
  }, []);

  // Clean up title flashing on unmount
  useEffect(() => {
    return () => {
      if (flashIntervalRef.current) {
        clearInterval(flashIntervalRef.current);
        document.title = originalTitle.current;
      }
    };
  }, []);

  /**
   * Flash the browser tab title to indicate unread messages.
   */
  const startTitleFlash = useCallback((contactName: string) => {
    unreadCountRef.current++;

    // Clear existing flash
    if (flashIntervalRef.current) {
      clearInterval(flashIntervalRef.current);
    }

    const unreadText = `(${unreadCountRef.current}) 💬 Nova mensagem de ${contactName}`;
    let showUnread = true;

    flashIntervalRef.current = setInterval(() => {
      document.title = showUnread ? unreadText : originalTitle.current;
      showUnread = !showUnread;
    }, 1500);

    // Stop flashing when window gets focus
    const handleFocus = () => {
      if (flashIntervalRef.current) {
        clearInterval(flashIntervalRef.current);
        flashIntervalRef.current = null;
      }
      unreadCountRef.current = 0;
      document.title = originalTitle.current;
      window.removeEventListener('focus', handleFocus);
    };

    window.addEventListener('focus', handleFocus);
  }, []);

  /**
   * Main notification function — call this when a new message arrives.
   */
  const notifyNewMessage = useCallback((options: NotifyOptions) => {
    const { contactName, messagePreview } = options;

    // 1. Toast notification (always visible in the app)
    toast.message(`💬 ${contactName}`, {
      description: messagePreview.length > 80
        ? messagePreview.substring(0, 80) + '...'
        : messagePreview,
      duration: 5000,
      action: options.conversationId
        ? {
            label: 'Ver',
            onClick: () => {
              // Navigate to conversation
              window.location.pathname = '/dashboard/conversations';
            },
          }
        : undefined,
    });

    // 2. Sound notification
    playNotificationSound();

    // 3. Browser push notification (if tab is not focused)
    if (!document.hasFocus()) {
      showBrowserNotification(options);
      startTitleFlash(contactName);
    }
  }, [startTitleFlash]);

  /**
   * Reset notifications (e.g., when user reads messages).
   */
  const clearNotifications = useCallback(() => {
    unreadCountRef.current = 0;
    if (flashIntervalRef.current) {
      clearInterval(flashIntervalRef.current);
      flashIntervalRef.current = null;
    }
    document.title = originalTitle.current;
  }, []);

  return {
    notifyNewMessage,
    clearNotifications,
  };
};
