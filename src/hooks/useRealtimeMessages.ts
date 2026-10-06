/**
 * useRealtimeMessages
 * 
 * Uses Supabase Realtime to listen for new messages and conversation updates.
 * When a new message is inserted or a conversation is updated, it automatically
 * updates the React Query cache so the UI refreshes instantly.
 * 
 * Also triggers visual/sound/push notifications for incoming messages.
 */

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';

interface UseRealtimeMessagesOptions {
  /** Only listen for messages of a specific contact */
  contactId?: string;
  /** Enable/disable the subscription */
  enabled?: boolean;
}

export const useRealtimeMessages = (options: UseRealtimeMessagesOptions = {}) => {
  const { contactId, enabled = true } = options;
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!enabled || !tenant?.id) return;

    // Build a unique channel name
    const channelName = contactId
      ? `messages-realtime-${tenant.id}-${contactId}`
      : `messages-realtime-${tenant.id}`;

    // Clean up existing channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(channelName)
      // Listen for new messages
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: contactId
            ? `contact_id=eq.${contactId}`
            : `tenant_id=eq.${tenant.id}`,
        },
        (payload) => {
          console.log('[Realtime] New message:', payload.new);
          const newMessage = payload.new as any;

          // Invalidate messages queries
          queryClient.invalidateQueries({
            queryKey: ['messages', newMessage.contact_id, tenant.id],
          });
          queryClient.invalidateQueries({
            queryKey: ['recent-messages', newMessage.contact_id, tenant.id],
          });

          // Invalidate conversations to update last_message + unread count
          queryClient.invalidateQueries({
            queryKey: ['conversations'],
          });
          queryClient.invalidateQueries({
            queryKey: ['recent-conversations'],
          });
          queryClient.invalidateQueries({
            queryKey: ['conversation-stats'],
          });
        }
      )
      // Listen for message status updates 
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: contactId
            ? `contact_id=eq.${contactId}`
            : `tenant_id=eq.${tenant.id}`,
        },
        (payload) => {
          const updated = payload.new as any;

          // Invalidate the specific contact's messages
          queryClient.invalidateQueries({
            queryKey: ['messages', updated.contact_id, tenant.id],
          });
        }
      )
      // Listen for conversation updates (unread_count, last_message_at)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
          filter: `tenant_id=eq.${tenant.id}`,
        },
        (_payload) => {
          queryClient.invalidateQueries({
            queryKey: ['conversations'],
          });
          queryClient.invalidateQueries({
            queryKey: ['recent-conversations'],
          });
          queryClient.invalidateQueries({
            queryKey: ['conversation-stats'],
          });
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[Realtime] Subscribed to ${channelName}`);
        } else if (status === 'CHANNEL_ERROR') {
          console.warn(`[Realtime] Channel error on ${channelName}`);
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [enabled, tenant?.id, contactId, queryClient]);
};

/**
 * Hook specifically for real-time updates on the conversation list.
 * Lighter version that only listens to conversations table changes.
 */
export const useRealtimeConversations = () => {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!tenant?.id) return;

    const channelName = `conversations-realtime-${tenant.id}`;

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `tenant_id=eq.${tenant.id}`,
        },
        (_payload) => {
          // Any message change should refresh conversation list
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
          queryClient.invalidateQueries({ queryKey: ['recent-conversations'] });
          queryClient.invalidateQueries({ queryKey: ['conversation-stats'] });
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [tenant?.id, queryClient]);
};

/**
 * Global realtime listener for notifications.
 * This listens for ALL inbound messages (not filtered by contact)
 * and triggers notifications via the callback.
 * 
 * Should be mounted ONCE at the app level (e.g., DashboardLayout).
 */
export const useGlobalMessageListener = (
  onNewInboundMessage?: (message: {
    contactId: string;
    content: string;
    direction: string;
    messageType: string;
  }) => void
) => {
  const { tenant } = useTenant();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!tenant?.id || !onNewInboundMessage) return;

    const channelName = `global-notifications-${tenant.id}`;

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `tenant_id=eq.${tenant.id}`,
        },
        (payload) => {
          const msg = payload.new as any;
          // Only notify for inbound messages (from contacts, not from us)
          if (msg.direction === 'inbound') {
            onNewInboundMessage({
              contactId: msg.contact_id,
              content: msg.content || '',
              direction: msg.direction,
              messageType: msg.message_type || 'text',
            });
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Realtime] Global notification listener active');
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [tenant?.id, onNewInboundMessage]);
};
