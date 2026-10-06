export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  public: {
    Tables: {
      affiliate_referrals: {
        Row: {
          affiliate_id: string
          created_at: string
          first_payment_date: string | null
          id: string
          referral_date: string
          status: string | null
          tenant_id: string
          total_commission_paid: number | null
        }
        Insert: {
          affiliate_id: string
          created_at?: string
          first_payment_date?: string | null
          id?: string
          referral_date?: string
          status?: string | null
          tenant_id: string
          total_commission_paid?: number | null
        }
        Update: {
          affiliate_id?: string
          created_at?: string
          first_payment_date?: string | null
          id?: string
          referral_date?: string
          status?: string | null
          tenant_id?: string
          total_commission_paid?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_referrals_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_referrals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_stripe_accounts: {
        Row: {
          account_status: string
          affiliate_id: string
          charges_enabled: boolean
          created_at: string
          details_submitted: boolean
          id: string
          payouts_enabled: boolean
          requirements: Json | null
          stripe_account_id: string
          updated_at: string
        }
        Insert: {
          account_status?: string
          affiliate_id: string
          charges_enabled?: boolean
          created_at?: string
          details_submitted?: boolean
          id?: string
          payouts_enabled?: boolean
          requirements?: Json | null
          stripe_account_id: string
          updated_at?: string
        }
        Update: {
          account_status?: string
          affiliate_id?: string
          charges_enabled?: boolean
          created_at?: string
          details_submitted?: boolean
          id?: string
          payouts_enabled?: boolean
          requirements?: Json | null
          stripe_account_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_stripe_accounts_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliates: {
        Row: {
          affiliate_code: string
          commission_rate_first_month: number | null
          commission_rate_recurring: number | null
          created_at: string
          email: string
          id: string
          is_active: boolean | null
          name: string
          stripe_account_id: string | null
          total_commission: number | null
          total_referrals: number | null
          updated_at: string
        }
        Insert: {
          affiliate_code: string
          commission_rate_first_month?: number | null
          commission_rate_recurring?: number | null
          created_at?: string
          email: string
          id?: string
          is_active?: boolean | null
          name: string
          stripe_account_id?: string | null
          total_commission?: number | null
          total_referrals?: number | null
          updated_at?: string
        }
        Update: {
          affiliate_code?: string
          commission_rate_first_month?: number | null
          commission_rate_recurring?: number | null
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean | null
          name?: string
          stripe_account_id?: string | null
          total_commission?: number | null
          total_referrals?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      alert_rules: {
        Row: {
          condition_operator: string | null
          cooldown_period: number | null
          created_at: string | null
          created_by: string | null
          description: string | null
          evaluation_window: number | null
          id: string
          is_active: boolean | null
          metric_name: string
          name: string
          notification_channels: Json | null
          severity: string
          threshold_value: number
          updated_at: string | null
        }
        Insert: {
          condition_operator?: string | null
          cooldown_period?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          evaluation_window?: number | null
          id?: string
          is_active?: boolean | null
          metric_name: string
          name: string
          notification_channels?: Json | null
          severity: string
          threshold_value: number
          updated_at?: string | null
        }
        Update: {
          condition_operator?: string | null
          cooldown_period?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          evaluation_window?: number | null
          id?: string
          is_active?: boolean | null
          metric_name?: string
          name?: string
          notification_channels?: Json | null
          severity?: string
          threshold_value?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alert_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_users_view"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_executions: {
        Row: {
          completed_at: string | null
          contact_id: string | null
          current_step: number | null
          error_message: string | null
          execution_data: Json | null
          flow_id: string | null
          id: string
          started_at: string | null
          status: string | null
          tenant_id: string | null
          trigger_data: Json | null
        }
        Insert: {
          completed_at?: string | null
          contact_id?: string | null
          current_step?: number | null
          error_message?: string | null
          execution_data?: Json | null
          flow_id?: string | null
          id?: string
          started_at?: string | null
          status?: string | null
          tenant_id?: string | null
          trigger_data?: Json | null
        }
        Update: {
          completed_at?: string | null
          contact_id?: string | null
          current_step?: number | null
          error_message?: string | null
          execution_data?: Json | null
          flow_id?: string | null
          id?: string
          started_at?: string | null
          status?: string | null
          tenant_id?: string | null
          trigger_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_executions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_executions_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "automation_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_executions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_flows: {
        Row: {
          active: boolean | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          name: string
          steps: Json | null
          tenant_id: string | null
          trigger_config: Json | null
          trigger_type: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          steps?: Json | null
          tenant_id?: string | null
          trigger_config?: Json | null
          trigger_type: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          steps?: Json | null
          tenant_id?: string | null
          trigger_config?: Json | null
          trigger_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_flows_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_users_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_flows_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_step_logs: {
        Row: {
          completed_at: string | null
          error_message: string | null
          execution_id: string | null
          id: string
          input_data: Json | null
          output_data: Json | null
          started_at: string | null
          status: string | null
          step_config: Json | null
          step_id: string
          step_type: string
          tenant_id: string | null
        }
        Insert: {
          completed_at?: string | null
          error_message?: string | null
          execution_id?: string | null
          id?: string
          input_data?: Json | null
          output_data?: Json | null
          started_at?: string | null
          status?: string | null
          step_config?: Json | null
          step_id: string
          step_type: string
          tenant_id?: string | null
        }
        Update: {
          completed_at?: string | null
          error_message?: string | null
          execution_id?: string | null
          id?: string
          input_data?: Json | null
          output_data?: Json | null
          started_at?: string | null
          status?: string | null
          step_config?: Json | null
          step_id?: string
          step_type?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_step_logs_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "automation_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_step_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bug_reports: {
        Row: {
          attachment_type: string | null
          attachment_url: string | null
          created_at: string
          description: string
          id: string
          page_url: string
          store_id: string | null
          tenant_id: string
          user_email: string
          user_id: string
          user_role: string
        }
        Insert: {
          attachment_type?: string | null
          attachment_url?: string | null
          created_at?: string
          description: string
          id?: string
          page_url: string
          store_id?: string | null
          tenant_id: string
          user_email: string
          user_id: string
          user_role: string
        }
        Update: {
          attachment_type?: string | null
          attachment_url?: string | null
          created_at?: string
          description?: string
          id?: string
          page_url?: string
          store_id?: string | null
          tenant_id?: string
          user_email?: string
          user_id?: string
          user_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "bug_reports_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bug_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bug_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_users_view"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_dispatch_queue: {
        Row: {
          campaign_id: string
          contact_id: string
          created_at: string
          error_message: string | null
          id: string
          message_text: string
          scheduled_at: string
          sent_at: string | null
          status: string | null
        }
        Insert: {
          campaign_id: string
          contact_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          message_text: string
          scheduled_at: string
          sent_at?: string | null
          status?: string | null
        }
        Update: {
          campaign_id?: string
          contact_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          message_text?: string
          scheduled_at?: string
          sent_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_dispatch_queue_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "mass_message_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_dispatch_queue_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_executions: {
        Row: {
          attempts: number
          campaign_id: string
          contact_id: string | null
          contact_identifier: string | null
          contact_name: string | null
          created_at: string
          delivered_at: string | null
          error_message: string | null
          failed_at: string | null
          id: string
          job_id: string | null
          message_text: string
          provider_message_id: string | null
          read_at: string | null
          replied_at: string | null
          scheduled_at: string
          sent_at: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          campaign_id: string
          contact_id?: string | null
          contact_identifier?: string | null
          contact_name?: string | null
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          job_id?: string | null
          message_text: string
          provider_message_id?: string | null
          read_at?: string | null
          replied_at?: string | null
          scheduled_at: string
          sent_at?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          campaign_id?: string
          contact_id?: string | null
          contact_identifier?: string | null
          contact_name?: string | null
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          job_id?: string | null
          message_text?: string
          provider_message_id?: string | null
          read_at?: string | null
          replied_at?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_executions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "mass_message_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_executions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_executions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_executions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_imports: {
        Row: {
          campaign_id: string | null
          contacts: Json
          created_at: string
          created_by: string | null
          errors: Json
          file_name: string
          file_url: string | null
          id: string
          invalid_rows: number
          status: string
          tenant_id: string
          total_rows: number
          valid_rows: number
        }
        Insert: {
          campaign_id?: string | null
          contacts?: Json
          created_at?: string
          created_by?: string | null
          errors?: Json
          file_name: string
          file_url?: string | null
          id?: string
          invalid_rows?: number
          status?: string
          tenant_id: string
          total_rows?: number
          valid_rows?: number
        }
        Update: {
          campaign_id?: string | null
          contacts?: Json
          created_at?: string
          created_by?: string | null
          errors?: Json
          file_name?: string
          file_url?: string | null
          id?: string
          invalid_rows?: number
          status?: string
          tenant_id?: string
          total_rows?: number
          valid_rows?: number
        }
        Relationships: [
          {
            foreignKeyName: "campaign_imports_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "mass_message_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_imports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_messages: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          message_text: string
          weight: number | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          message_text: string
          weight?: number | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          message_text?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "mass_message_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_metrics: {
        Row: {
          campaign_id: string
          conversion_rate: number
          delivery_rate: number
          id: string
          read_rate: number
          reply_rate: number
          tenant_id: string
          total_contacts: number
          total_delivered: number
          total_failed: number
          total_pending: number
          total_read: number
          total_replied: number
          total_sent: number
          updated_at: string
        }
        Insert: {
          campaign_id: string
          conversion_rate?: number
          delivery_rate?: number
          id?: string
          read_rate?: number
          reply_rate?: number
          tenant_id: string
          total_contacts?: number
          total_delivered?: number
          total_failed?: number
          total_pending?: number
          total_read?: number
          total_replied?: number
          total_sent?: number
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          conversion_rate?: number
          delivery_rate?: number
          id?: string
          read_rate?: number
          reply_rate?: number
          tenant_id?: string
          total_contacts?: number
          total_delivered?: number
          total_failed?: number
          total_pending?: number
          total_read?: number
          total_replied?: number
          total_sent?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_metrics_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "mass_message_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_metrics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          message_template: string
          name: string
          status: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          message_template: string
          name: string
          status?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          message_template?: string
          name?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_edges: {
        Row: {
          chatbot_id: string
          created_at: string
          id: string
          label: string | null
          source_handle: string | null
          source_node_id: string
          target_node_id: string
          tenant_id: string
        }
        Insert: {
          chatbot_id: string
          created_at?: string
          id?: string
          label?: string | null
          source_handle?: string | null
          source_node_id: string
          target_node_id: string
          tenant_id: string
        }
        Update: {
          chatbot_id?: string
          created_at?: string
          id?: string
          label?: string | null
          source_handle?: string | null
          source_node_id?: string
          target_node_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_edges_chatbot_id_fkey"
            columns: ["chatbot_id"]
            isOneToOne: false
            referencedRelation: "chatbots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_edges_source_node_id_fkey"
            columns: ["source_node_id"]
            isOneToOne: false
            referencedRelation: "chatbot_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_edges_target_node_id_fkey"
            columns: ["target_node_id"]
            isOneToOne: false
            referencedRelation: "chatbot_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_edges_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_nodes: {
        Row: {
          chatbot_id: string
          created_at: string
          data: Json
          id: string
          node_type: Database["public"]["Enums"]["chatbot_node_type"]
          position_x: number
          position_y: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          chatbot_id: string
          created_at?: string
          data?: Json
          id?: string
          node_type: Database["public"]["Enums"]["chatbot_node_type"]
          position_x?: number
          position_y?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          chatbot_id?: string
          created_at?: string
          data?: Json
          id?: string
          node_type?: Database["public"]["Enums"]["chatbot_node_type"]
          position_x?: number
          position_y?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_nodes_chatbot_id_fkey"
            columns: ["chatbot_id"]
            isOneToOne: false
            referencedRelation: "chatbots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_nodes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_sessions: {
        Row: {
          awaiting_input: boolean
          chatbot_id: string
          contact_id: string
          current_node_id: string | null
          ended_at: string | null
          id: string
          last_activity_at: string
          started_at: string
          status: Database["public"]["Enums"]["chatbot_session_status"]
          tenant_id: string
          updated_at: string
          variables: Json
          whatsapp_instance_id: string | null
        }
        Insert: {
          awaiting_input?: boolean
          chatbot_id: string
          contact_id: string
          current_node_id?: string | null
          ended_at?: string | null
          id?: string
          last_activity_at?: string
          started_at?: string
          status?: Database["public"]["Enums"]["chatbot_session_status"]
          tenant_id: string
          updated_at?: string
          variables?: Json
          whatsapp_instance_id?: string | null
        }
        Update: {
          awaiting_input?: boolean
          chatbot_id?: string
          contact_id?: string
          current_node_id?: string | null
          ended_at?: string | null
          id?: string
          last_activity_at?: string
          started_at?: string
          status?: Database["public"]["Enums"]["chatbot_session_status"]
          tenant_id?: string
          updated_at?: string
          variables?: Json
          whatsapp_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_sessions_chatbot_id_fkey"
            columns: ["chatbot_id"]
            isOneToOne: false
            referencedRelation: "chatbots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_sessions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_sessions_current_node_id_fkey"
            columns: ["current_node_id"]
            isOneToOne: false
            referencedRelation: "chatbot_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_sessions_whatsapp_instance_id_fkey"
            columns: ["whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_triggers: {
        Row: {
          chatbot_id: string
          created_at: string
          id: string
          is_active: boolean
          tenant_id: string
          trigger_type: Database["public"]["Enums"]["chatbot_trigger_type"]
          trigger_value: Json
        }
        Insert: {
          chatbot_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          tenant_id: string
          trigger_type: Database["public"]["Enums"]["chatbot_trigger_type"]
          trigger_value?: Json
        }
        Update: {
          chatbot_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          tenant_id?: string
          trigger_type?: Database["public"]["Enums"]["chatbot_trigger_type"]
          trigger_value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_triggers_chatbot_id_fkey"
            columns: ["chatbot_id"]
            isOneToOne: false
            referencedRelation: "chatbots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_triggers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_variables: {
        Row: {
          chatbot_id: string
          created_at: string
          default_value: string | null
          id: string
          name: string
          tenant_id: string
        }
        Insert: {
          chatbot_id: string
          created_at?: string
          default_value?: string | null
          id?: string
          name: string
          tenant_id: string
        }
        Update: {
          chatbot_id?: string
          created_at?: string
          default_value?: string | null
          id?: string
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_variables_chatbot_id_fkey"
            columns: ["chatbot_id"]
            isOneToOne: false
            referencedRelation: "chatbots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_variables_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbots: {
        Row: {
          builder_version: number
          conditions: Json | null
          created_at: string
          delay_seconds: number | null
          description: string | null
          id: string
          is_active: boolean | null
          is_published: boolean
          media_url: string | null
          name: string
          priority: number | null
          response_message: string | null
          response_type: string | null
          tenant_id: string
          trigger_phrases: string[] | null
          trigger_type: string
          updated_at: string
          variables: Json | null
          whatsapp_instance_id: string | null
        }
        Insert: {
          builder_version?: number
          conditions?: Json | null
          created_at?: string
          delay_seconds?: number | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_published?: boolean
          media_url?: string | null
          name: string
          priority?: number | null
          response_message?: string | null
          response_type?: string | null
          tenant_id: string
          trigger_phrases?: string[] | null
          trigger_type?: string
          updated_at?: string
          variables?: Json | null
          whatsapp_instance_id?: string | null
        }
        Update: {
          builder_version?: number
          conditions?: Json | null
          created_at?: string
          delay_seconds?: number | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_published?: boolean
          media_url?: string | null
          name?: string
          priority?: number | null
          response_message?: string | null
          response_type?: string | null
          tenant_id?: string
          trigger_phrases?: string[] | null
          trigger_type?: string
          updated_at?: string
          variables?: Json | null
          whatsapp_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chatbots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbots_whatsapp_instance_id_fkey"
            columns: ["whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_calculations: {
        Row: {
          affiliate_id: string
          base_amount: number
          billing_period_end: string | null
          billing_period_start: string | null
          calculation_type: string
          commission_amount: number
          commission_rate: number
          created_at: string
          id: string
          payment_id: string | null
          referral_id: string | null
        }
        Insert: {
          affiliate_id: string
          base_amount: number
          billing_period_end?: string | null
          billing_period_start?: string | null
          calculation_type: string
          commission_amount: number
          commission_rate: number
          created_at?: string
          id?: string
          payment_id?: string | null
          referral_id?: string | null
        }
        Update: {
          affiliate_id?: string
          base_amount?: number
          billing_period_end?: string | null
          billing_period_start?: string | null
          calculation_type?: string
          commission_amount?: number
          commission_rate?: number
          created_at?: string
          id?: string
          payment_id?: string | null
          referral_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_calculations_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_calculations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "commission_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_calculations_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "affiliate_referrals"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_payments: {
        Row: {
          affiliate_id: string
          amount: number
          created_at: string
          currency: string
          description: string | null
          id: string
          metadata: Json | null
          paid_at: string | null
          status: string
          stripe_payout_id: string | null
          stripe_transfer_id: string | null
          updated_at: string
        }
        Insert: {
          affiliate_id: string
          amount: number
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          paid_at?: string | null
          status?: string
          stripe_payout_id?: string | null
          stripe_transfer_id?: string | null
          updated_at?: string
        }
        Update: {
          affiliate_id?: string
          amount?: number
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          paid_at?: string | null
          status?: string
          stripe_payout_id?: string | null
          stripe_transfer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_payments_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      company_users: {
        Row: {
          company_id: string
          role: string | null
          user_id: string
        }
        Insert: {
          company_id: string
          role?: string | null
          user_id: string
        }
        Update: {
          company_id?: string
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_tags: {
        Row: {
          contact_id: string
          created_at: string
          tag_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          tag_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_tags_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          avatar_url: string | null
          channel: string
          created_at: string
          current_flow_step_id_temp: string | null
          current_stage_id: string | null
          custom_fields: Json
          email: string | null
          external_id: string
          first_message: string | null
          id: string
          is_blocked: boolean | null
          last_interaction_at: string | null
          lead_source_id: string | null
          name: string | null
          notes: string | null
          opt_in_at: string | null
          opt_in_mass_message: boolean
          opt_in_source: string | null
          opt_out_at: string | null
          opt_out_mass_message: boolean | null
          opt_out_source: string | null
          phone: string | null
          profile_checked_at: string | null
          profile_status: string | null
          source_details: Json | null
          stage_entered_at: string | null
          tenant_id: string
          updated_at: string
          username: string | null
          whatsapp_instance_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          channel?: string
          created_at?: string
          current_flow_step_id_temp?: string | null
          current_stage_id?: string | null
          custom_fields?: Json
          email?: string | null
          external_id?: string
          first_message?: string | null
          id?: string
          is_blocked?: boolean | null
          last_interaction_at?: string | null
          lead_source_id?: string | null
          name?: string | null
          notes?: string | null
          opt_in_at?: string | null
          opt_in_mass_message?: boolean
          opt_in_source?: string | null
          opt_out_at?: string | null
          opt_out_mass_message?: boolean | null
          opt_out_source?: string | null
          phone?: string | null
          profile_checked_at?: string | null
          profile_status?: string | null
          source_details?: Json | null
          stage_entered_at?: string | null
          tenant_id: string
          updated_at?: string
          username?: string | null
          whatsapp_instance_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          channel?: string
          created_at?: string
          current_flow_step_id_temp?: string | null
          current_stage_id?: string | null
          custom_fields?: Json
          email?: string | null
          external_id?: string
          first_message?: string | null
          id?: string
          is_blocked?: boolean | null
          last_interaction_at?: string | null
          lead_source_id?: string | null
          name?: string | null
          notes?: string | null
          opt_in_at?: string | null
          opt_in_mass_message?: boolean
          opt_in_source?: string | null
          opt_out_at?: string | null
          opt_out_mass_message?: boolean | null
          opt_out_source?: string | null
          phone?: string | null
          profile_checked_at?: string | null
          profile_status?: string | null
          source_details?: Json | null
          stage_entered_at?: string | null
          tenant_id?: string
          updated_at?: string
          username?: string | null
          whatsapp_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_current_stage_id_fkey"
            columns: ["current_stage_id"]
            isOneToOne: false
            referencedRelation: "funnel_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_lead_source_id_fkey"
            columns: ["lead_source_id"]
            isOneToOne: false
            referencedRelation: "lead_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_whatsapp_instance_id_fkey"
            columns: ["whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          assigned_profile_id: string | null
          channel: string
          contact_id: string
          created_at: string | null
          id: string
          is_archived: boolean | null
          last_message_at: string | null
          last_message_content: string | null
          last_message_direction: string | null
          last_message_status: string | null
          last_message_type: string | null
          sla_muted_at: string | null
          sla_muted_by: string | null
          tenant_id: string
          unread_count: number | null
          updated_at: string | null
          whatsapp_instance_id: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_profile_id?: string | null
          channel?: string
          contact_id: string
          created_at?: string | null
          id?: string
          is_archived?: boolean | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_direction?: string | null
          last_message_status?: string | null
          last_message_type?: string | null
          sla_muted_at?: string | null
          sla_muted_by?: string | null
          tenant_id: string
          unread_count?: number | null
          updated_at?: string | null
          whatsapp_instance_id?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_profile_id?: string | null
          channel?: string
          contact_id?: string
          created_at?: string | null
          id?: string
          is_archived?: boolean | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_direction?: string | null
          last_message_status?: string | null
          last_message_type?: string | null
          sla_muted_at?: string | null
          sla_muted_by?: string | null
          tenant_id?: string
          unread_count?: number | null
          updated_at?: string | null
          whatsapp_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_assigned_profile_id_fkey"
            columns: ["assigned_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_sla_muted_by_fkey"
            columns: ["sla_muted_by"]
            isOneToOne: false
            referencedRelation: "admin_users_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_whatsapp_instance_id_fkey"
            columns: ["whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
          created_at: string
          current_uses: number | null
          discount_type: string
          discount_value: number
          duration: string
          duration_in_months: number | null
          id: string
          is_active: boolean | null
          max_uses: number | null
          stripe_coupon_id: string | null
          stripe_promotion_code_id: string | null
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          code: string
          created_at?: string
          current_uses?: number | null
          discount_type: string
          discount_value: number
          duration?: string
          duration_in_months?: number | null
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          stripe_coupon_id?: string | null
          stripe_promotion_code_id?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          current_uses?: number | null
          discount_type?: string
          discount_value?: number
          duration?: string
          duration_in_months?: number | null
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          stripe_coupon_id?: string | null
          stripe_promotion_code_id?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: []
      }
      evolution_api_instances: {
        Row: {
          api_key: string
          company_id: string
          connection_status: string | null
          created_at: string | null
          id: string
          instance_name: string
          last_connected_at: string | null
          qr_code: string | null
          server_url: string
        }
        Insert: {
          api_key: string
          company_id: string
          connection_status?: string | null
          created_at?: string | null
          id?: string
          instance_name: string
          last_connected_at?: string | null
          qr_code?: string | null
          server_url: string
        }
        Update: {
          api_key?: string
          company_id?: string
          connection_status?: string | null
          created_at?: string | null
          id?: string
          instance_name?: string
          last_connected_at?: string | null
          qr_code?: string | null
          server_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "evolution_api_instances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_up_sequences: {
        Row: {
          created_at: string
          description: string | null
          funnel_stage_id: string
          id: string
          is_active: boolean | null
          name: string
          tenant_id: string
          updated_at: string
          whatsapp_instance_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          funnel_stage_id: string
          id?: string
          is_active?: boolean | null
          name: string
          tenant_id: string
          updated_at?: string
          whatsapp_instance_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          funnel_stage_id?: string
          id?: string
          is_active?: boolean | null
          name?: string
          tenant_id?: string
          updated_at?: string
          whatsapp_instance_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_up_sequences_funnel_stage_id_fkey"
            columns: ["funnel_stage_id"]
            isOneToOne: false
            referencedRelation: "funnel_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_up_sequences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_up_sequences_whatsapp_instance_id_fkey"
            columns: ["whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_up_steps: {
        Row: {
          conditions: Json | null
          created_at: string
          delay_hours: number
          id: string
          is_active: boolean | null
          media_url: string | null
          message_text: string
          message_type: string | null
          order: number
          sequence_id: string
        }
        Insert: {
          conditions?: Json | null
          created_at?: string
          delay_hours: number
          id?: string
          is_active?: boolean | null
          media_url?: string | null
          message_text: string
          message_type?: string | null
          order: number
          sequence_id: string
        }
        Update: {
          conditions?: Json | null
          created_at?: string
          delay_hours?: number
          id?: string
          is_active?: boolean | null
          media_url?: string | null
          message_text?: string
          message_type?: string | null
          order?: number
          sequence_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_up_steps_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "follow_up_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      followup_sequence_enrollments: {
        Row: {
          assigned_to: string | null
          contact_id: string
          created_at: string
          current_step: number
          enrolled_at: string
          id: string
          next_run_at: string | null
          sequence_id: string
          status: string
          stopped_at: string | null
          stopped_reason: string | null
          tenant_id: string
          updated_at: string
          waiting_on_followup_id: string | null
          whatsapp_instance_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          contact_id: string
          created_at?: string
          current_step?: number
          enrolled_at?: string
          id?: string
          next_run_at?: string | null
          sequence_id: string
          status?: string
          stopped_at?: string | null
          stopped_reason?: string | null
          tenant_id: string
          updated_at?: string
          waiting_on_followup_id?: string | null
          whatsapp_instance_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          contact_id?: string
          created_at?: string
          current_step?: number
          enrolled_at?: string
          id?: string
          next_run_at?: string | null
          sequence_id?: string
          status?: string
          stopped_at?: string | null
          stopped_reason?: string | null
          tenant_id?: string
          updated_at?: string
          waiting_on_followup_id?: string | null
          whatsapp_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "followup_sequence_enrollments_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followup_sequence_enrollments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followup_sequence_enrollments_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "followup_sequences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followup_sequence_enrollments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followup_sequence_enrollments_waiting_on_followup_id_fkey"
            columns: ["waiting_on_followup_id"]
            isOneToOne: false
            referencedRelation: "individual_followups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followup_sequence_enrollments_waiting_on_followup_id_fkey"
            columns: ["waiting_on_followup_id"]
            isOneToOne: false
            referencedRelation: "v_followups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followup_sequence_enrollments_whatsapp_instance_id_fkey"
            columns: ["whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      followup_sequence_steps: {
        Row: {
          action_type: string
          created_at: string
          delay_amount: number
          delay_unit: string
          id: string
          message_body: string | null
          sequence_id: string
          step_order: number
          task_priority: string | null
          task_title: string | null
          template_language: string | null
          template_name: string | null
          template_params: Json | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          action_type: string
          created_at?: string
          delay_amount?: number
          delay_unit?: string
          id?: string
          message_body?: string | null
          sequence_id: string
          step_order: number
          task_priority?: string | null
          task_title?: string | null
          template_language?: string | null
          template_name?: string | null
          template_params?: Json | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          action_type?: string
          created_at?: string
          delay_amount?: number
          delay_unit?: string
          id?: string
          message_body?: string | null
          sequence_id?: string
          step_order?: number
          task_priority?: string | null
          task_title?: string | null
          template_language?: string | null
          template_name?: string | null
          template_params?: Json | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "followup_sequence_steps_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "followup_sequences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followup_sequence_steps_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      followup_sequences: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          stop_on_reply: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          stop_on_reply?: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          stop_on_reply?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "followup_sequences_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followup_sequences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      funnel_stages: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          is_final: boolean | null
          name: string
          order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_final?: boolean | null
          name: string
          order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_final?: boolean | null
          name?: string
          order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "funnel_stages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      individual_followups: {
        Row: {
          assigned_to: string | null
          attempts: number
          cancelled_at: string | null
          completed_at: string | null
          contact_id: string
          created_at: string
          created_by_automation: boolean
          due_date: string
          error_message: string | null
          id: string
          last_sent_at: string | null
          message_body: string | null
          mode: string
          notes: string | null
          parent_followup_id: string | null
          priority: string
          provider_message_id: string | null
          recurring: boolean | null
          recurring_count: number | null
          recurring_end_date: string | null
          recurring_interval: number | null
          recurring_type: string | null
          scheduled_at: string | null
          sequence_enrollment_id: string | null
          sequence_step_order: number | null
          source: string | null
          status: string | null
          tags: string[]
          task: string
          template_language: string | null
          template_name: string | null
          template_params: Json | null
          tenant_id: string
          type: string
          updated_at: string
          whatsapp_instance_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          attempts?: number
          cancelled_at?: string | null
          completed_at?: string | null
          contact_id: string
          created_at?: string
          created_by_automation?: boolean
          due_date: string
          error_message?: string | null
          id?: string
          last_sent_at?: string | null
          message_body?: string | null
          mode?: string
          notes?: string | null
          parent_followup_id?: string | null
          priority: string
          provider_message_id?: string | null
          recurring?: boolean | null
          recurring_count?: number | null
          recurring_end_date?: string | null
          recurring_interval?: number | null
          recurring_type?: string | null
          scheduled_at?: string | null
          sequence_enrollment_id?: string | null
          sequence_step_order?: number | null
          source?: string | null
          status?: string | null
          tags?: string[]
          task: string
          template_language?: string | null
          template_name?: string | null
          template_params?: Json | null
          tenant_id: string
          type: string
          updated_at?: string
          whatsapp_instance_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          attempts?: number
          cancelled_at?: string | null
          completed_at?: string | null
          contact_id?: string
          created_at?: string
          created_by_automation?: boolean
          due_date?: string
          error_message?: string | null
          id?: string
          last_sent_at?: string | null
          message_body?: string | null
          mode?: string
          notes?: string | null
          parent_followup_id?: string | null
          priority?: string
          provider_message_id?: string | null
          recurring?: boolean | null
          recurring_count?: number | null
          recurring_end_date?: string | null
          recurring_interval?: number | null
          recurring_type?: string | null
          scheduled_at?: string | null
          sequence_enrollment_id?: string | null
          sequence_step_order?: number | null
          source?: string | null
          status?: string | null
          tags?: string[]
          task?: string
          template_language?: string | null
          template_name?: string | null
          template_params?: Json | null
          tenant_id?: string
          type?: string
          updated_at?: string
          whatsapp_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "individual_followups_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "individual_followups_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "individual_followups_parent_followup_id_fkey"
            columns: ["parent_followup_id"]
            isOneToOne: false
            referencedRelation: "individual_followups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "individual_followups_parent_followup_id_fkey"
            columns: ["parent_followup_id"]
            isOneToOne: false
            referencedRelation: "v_followups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "individual_followups_sequence_enrollment_fk"
            columns: ["sequence_enrollment_id"]
            isOneToOne: false
            referencedRelation: "followup_sequence_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "individual_followups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "individual_followups_whatsapp_instance_id_fkey"
            columns: ["whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      instance_secrets: {
        Row: {
          created_at: string
          instance_id: string
          tenant_id: string
          updated_at: string
          vault_secret_id: string
        }
        Insert: {
          created_at?: string
          instance_id: string
          tenant_id: string
          updated_at?: string
          vault_secret_id: string
        }
        Update: {
          created_at?: string
          instance_id?: string
          tenant_id?: string
          updated_at?: string
          vault_secret_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instance_secrets_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: true
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instance_secrets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      job_queue: {
        Row: {
          completed_at: string | null
          created_at: string
          current_attempts: number
          error_message: string | null
          failed_at: string | null
          id: string
          job_data: Json
          job_type: string
          max_attempts: number
          priority: number
          scheduled_at: string
          started_at: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_attempts?: number
          error_message?: string | null
          failed_at?: string | null
          id?: string
          job_data?: Json
          job_type: string
          max_attempts?: number
          priority?: number
          scheduled_at?: string
          started_at?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_attempts?: number
          error_message?: string | null
          failed_at?: string | null
          id?: string
          job_data?: Json
          job_type?: string
          max_attempts?: number
          priority?: number
          scheduled_at?: string
          started_at?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_queue_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_sources: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          name: string
          parameters: Json | null
          tenant_id: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          name: string
          parameters?: Json | null
          tenant_id: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          name?: string
          parameters?: Json | null
          tenant_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_sources_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_tracking: {
        Row: {
          browser: string | null
          city: string | null
          contact_id: string | null
          conversion_date: string | null
          conversion_value: number | null
          converted: boolean | null
          country: string | null
          created_at: string | null
          device_type: string | null
          id: string
          ip_address: unknown
          landing_page: string | null
          os: string | null
          referrer_url: string | null
          session_id: string | null
          tenant_id: string
          traffic_source_id: string | null
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          browser?: string | null
          city?: string | null
          contact_id?: string | null
          conversion_date?: string | null
          conversion_value?: number | null
          converted?: boolean | null
          country?: string | null
          created_at?: string | null
          device_type?: string | null
          id?: string
          ip_address?: unknown
          landing_page?: string | null
          os?: string | null
          referrer_url?: string | null
          session_id?: string | null
          tenant_id: string
          traffic_source_id?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          browser?: string | null
          city?: string | null
          contact_id?: string | null
          conversion_date?: string | null
          conversion_value?: number | null
          converted?: boolean | null
          country?: string | null
          created_at?: string | null
          device_type?: string | null
          id?: string
          ip_address?: unknown
          landing_page?: string | null
          os?: string | null
          referrer_url?: string | null
          session_id?: string | null
          tenant_id?: string
          traffic_source_id?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_tracking_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_tracking_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_tracking_traffic_source_id_fkey"
            columns: ["traffic_source_id"]
            isOneToOne: false
            referencedRelation: "traffic_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      mass_message_campaigns: {
        Row: {
          audience_config: Json | null
          audience_type: string | null
          business_hours_end: string | null
          business_hours_start: string | null
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          daily_send_limit: number | null
          delay_between_messages: number | null
          delivered_count: number
          description: string | null
          enable_message_randomization: boolean | null
          failed_count: number | null
          id: string
          is_template: boolean
          max_delay_seconds: number | null
          media_caption: string | null
          media_url: string | null
          message_template: string
          message_templates: Json | null
          message_type: string | null
          min_delay_seconds: number | null
          name: string
          paused_at: string | null
          read_count: number
          replied_count: number
          require_opt_in: boolean
          respect_business_hours: boolean | null
          scheduled_at: string | null
          sent_count: number | null
          started_at: string | null
          status: string | null
          target_stages: string[] | null
          target_tags: string[] | null
          template_language: string | null
          template_name: string | null
          template_params: Json | null
          tenant_id: string
          timezone: string | null
          total_recipients: number | null
          updated_at: string
          whatsapp_instance_id: string
        }
        Insert: {
          audience_config?: Json | null
          audience_type?: string | null
          business_hours_end?: string | null
          business_hours_start?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          daily_send_limit?: number | null
          delay_between_messages?: number | null
          delivered_count?: number
          description?: string | null
          enable_message_randomization?: boolean | null
          failed_count?: number | null
          id?: string
          is_template?: boolean
          max_delay_seconds?: number | null
          media_caption?: string | null
          media_url?: string | null
          message_template: string
          message_templates?: Json | null
          message_type?: string | null
          min_delay_seconds?: number | null
          name: string
          paused_at?: string | null
          read_count?: number
          replied_count?: number
          require_opt_in?: boolean
          respect_business_hours?: boolean | null
          scheduled_at?: string | null
          sent_count?: number | null
          started_at?: string | null
          status?: string | null
          target_stages?: string[] | null
          target_tags?: string[] | null
          template_language?: string | null
          template_name?: string | null
          template_params?: Json | null
          tenant_id: string
          timezone?: string | null
          total_recipients?: number | null
          updated_at?: string
          whatsapp_instance_id: string
        }
        Update: {
          audience_config?: Json | null
          audience_type?: string | null
          business_hours_end?: string | null
          business_hours_start?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          daily_send_limit?: number | null
          delay_between_messages?: number | null
          delivered_count?: number
          description?: string | null
          enable_message_randomization?: boolean | null
          failed_count?: number | null
          id?: string
          is_template?: boolean
          max_delay_seconds?: number | null
          media_caption?: string | null
          media_url?: string | null
          message_template?: string
          message_templates?: Json | null
          message_type?: string | null
          min_delay_seconds?: number | null
          name?: string
          paused_at?: string | null
          read_count?: number
          replied_count?: number
          require_opt_in?: boolean
          respect_business_hours?: boolean | null
          scheduled_at?: string | null
          sent_count?: number | null
          started_at?: string | null
          status?: string | null
          target_stages?: string[] | null
          target_tags?: string[] | null
          template_language?: string | null
          template_name?: string | null
          template_params?: Json | null
          tenant_id?: string
          timezone?: string | null
          total_recipients?: number | null
          updated_at?: string
          whatsapp_instance_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mass_message_campaigns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mass_message_campaigns_whatsapp_instance_id_fkey"
            columns: ["whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mmc_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_users_view"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          ad_referral: Json | null
          campaign_id: string | null
          contact_id: string
          content: string | null
          conversation_id: string | null
          created_at: string
          direction: string
          evolution_message_id: string | null
          id: string
          is_from_bot: boolean | null
          media_url: string | null
          message_type: string
          sender_profile_id: string | null
          source: string | null
          status: string | null
          tenant_id: string
          whatsapp_instance_id: string
        }
        Insert: {
          ad_referral?: Json | null
          campaign_id?: string | null
          contact_id: string
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          direction: string
          evolution_message_id?: string | null
          id?: string
          is_from_bot?: boolean | null
          media_url?: string | null
          message_type: string
          sender_profile_id?: string | null
          source?: string | null
          status?: string | null
          tenant_id: string
          whatsapp_instance_id: string
        }
        Update: {
          ad_referral?: Json | null
          campaign_id?: string | null
          contact_id?: string
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          direction?: string
          evolution_message_id?: string | null
          id?: string
          is_from_bot?: boolean | null
          media_url?: string | null
          message_type?: string
          sender_profile_id?: string | null
          source?: string | null
          status?: string | null
          tenant_id?: string
          whatsapp_instance_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_campaign_id_fk"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "mass_message_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_whatsapp_instance_id_fkey"
            columns: ["whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_profile_id_fkey"
            columns: ["sender_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      metrics_cache: {
        Row: {
          created_at: string | null
          expires_at: string
          filters: Json | null
          id: string
          metric_key: string
          metric_value: Json
          tenant_id: string
          time_range: string | null
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          filters?: Json | null
          id?: string
          metric_key: string
          metric_value?: Json
          tenant_id: string
          time_range?: string | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          filters?: Json | null
          id?: string
          metric_key?: string
          metric_value?: Json
          tenant_id?: string
          time_range?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "metrics_cache_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      module_settings: {
        Row: {
          created_at: string
          description: string | null
          display_name: string
          icon: string | null
          id: string
          is_enabled: boolean
          module_name: string
          route_path: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_name: string
          icon?: string | null
          id?: string
          is_enabled?: boolean
          module_name: string
          route_path: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_name?: string
          icon?: string | null
          id?: string
          is_enabled?: boolean
          module_name?: string
          route_path?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          action_label: string | null
          action_url: string | null
          created_at: string
          id: string
          is_read: boolean
          message: string
          metadata: Json | null
          tenant_id: string | null
          title: string
          type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          action_label?: string | null
          action_url?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          metadata?: Json | null
          tenant_id?: string | null
          title: string
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          action_label?: string | null
          action_url?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          metadata?: Json | null
          tenant_id?: string | null
          title?: string
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_users_view"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_history: {
        Row: {
          additional_data: Json | null
          id: string
          metric_type: string
          service_name: string
          timestamp: string | null
          unit: string | null
          value: number
        }
        Insert: {
          additional_data?: Json | null
          id?: string
          metric_type: string
          service_name: string
          timestamp?: string | null
          unit?: string | null
          value: number
        }
        Update: {
          additional_data?: Json | null
          id?: string
          metric_type?: string
          service_name?: string
          timestamp?: string | null
          unit?: string | null
          value?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          affiliate_id: string | null
          avatar_url: string | null
          bio: string | null
          capabilities: Json | null
          created_at: string
          first_name: string | null
          id: string
          invite_intent_active: boolean | null
          is_active: boolean | null
          last_ip: unknown
          last_login_at: string | null
          last_name: string | null
          login_count: number
          notification_prefs: Json | null
          parent_id: string | null
          permissions: Json | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"] | null
          status: string
          tenant_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          affiliate_id?: string | null
          avatar_url?: string | null
          bio?: string | null
          capabilities?: Json | null
          created_at?: string
          first_name?: string | null
          id?: string
          invite_intent_active?: boolean | null
          is_active?: boolean | null
          last_ip?: unknown
          last_login_at?: string | null
          last_name?: string | null
          login_count?: number
          notification_prefs?: Json | null
          parent_id?: string | null
          permissions?: Json | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          affiliate_id?: string | null
          avatar_url?: string | null
          bio?: string | null
          capabilities?: Json | null
          created_at?: string
          first_name?: string | null
          id?: string
          invite_intent_active?: boolean | null
          is_active?: boolean | null
          last_ip?: unknown
          last_login_at?: string | null
          last_name?: string | null
          login_count?: number
          notification_prefs?: Json | null
          parent_id?: string | null
          permissions?: Json | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_users_view"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_replies: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          created_by_name: string | null
          id: string
          name: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
          updated_by_name: string | null
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          id?: string
          name: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          updated_by_name?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          id?: string
          name?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          updated_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quick_replies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quick_replies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quick_replies_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          key: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          key: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          key?: string
        }
        Relationships: []
      }
      report_data: {
        Row: {
          data: Json
          expires_at: string | null
          generated_at: string | null
          id: string
          metadata: Json | null
          name: string
          status: string | null
          template_id: string | null
          tenant_id: string
        }
        Insert: {
          data?: Json
          expires_at?: string | null
          generated_at?: string | null
          id?: string
          metadata?: Json | null
          name: string
          status?: string | null
          template_id?: string | null
          tenant_id: string
        }
        Update: {
          data?: Json
          expires_at?: string | null
          generated_at?: string | null
          id?: string
          metadata?: Json | null
          name?: string
          status?: string | null
          template_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_data_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "report_statistics"
            referencedColumns: ["template_id"]
          },
          {
            foreignKeyName: "report_data_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "report_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_data_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      report_executions: {
        Row: {
          error_message: string | null
          executed_at: string | null
          executed_by: string | null
          execution_time: number | null
          id: string
          parameters: Json | null
          status: string | null
          template_id: string | null
          tenant_id: string
        }
        Insert: {
          error_message?: string | null
          executed_at?: string | null
          executed_by?: string | null
          execution_time?: number | null
          id?: string
          parameters?: Json | null
          status?: string | null
          template_id?: string | null
          tenant_id: string
        }
        Update: {
          error_message?: string | null
          executed_at?: string | null
          executed_by?: string | null
          execution_time?: number | null
          id?: string
          parameters?: Json | null
          status?: string | null
          template_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_executions_executed_by_fkey"
            columns: ["executed_by"]
            isOneToOne: false
            referencedRelation: "admin_users_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_executions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "report_statistics"
            referencedColumns: ["template_id"]
          },
          {
            foreignKeyName: "report_executions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "report_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_executions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      report_schedules: {
        Row: {
          created_at: string | null
          created_by: string | null
          cron_expression: string
          id: string
          is_active: boolean | null
          last_run: string | null
          name: string
          next_run: string | null
          parameters: Json | null
          recipients: Json | null
          template_id: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          cron_expression: string
          id?: string
          is_active?: boolean | null
          last_run?: string | null
          name: string
          next_run?: string | null
          parameters?: Json | null
          recipients?: Json | null
          template_id?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          cron_expression?: string
          id?: string
          is_active?: boolean | null
          last_run?: string | null
          name?: string
          next_run?: string | null
          parameters?: Json | null
          recipients?: Json | null
          template_id?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_users_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_schedules_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "report_statistics"
            referencedColumns: ["template_id"]
          },
          {
            foreignKeyName: "report_schedules_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "report_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_schedules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      report_templates: {
        Row: {
          category: string | null
          config: Json
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_public: boolean | null
          name: string
          tenant_id: string
          type: string | null
          updated_at: string | null
          usage_count: number | null
        }
        Insert: {
          category?: string | null
          config?: Json
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          name: string
          tenant_id: string
          type?: string | null
          updated_at?: string | null
          usage_count?: number | null
        }
        Update: {
          category?: string | null
          config?: Json
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          name?: string
          tenant_id?: string
          type?: string | null
          updated_at?: string | null
          usage_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "report_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_users_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          name: string
          query: string
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          query: string
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          query?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      service_status: {
        Row: {
          dependencies: Json | null
          description: string | null
          endpoint_url: string | null
          error_count: number | null
          health_data: Json | null
          id: string
          last_check: string | null
          response_time: number | null
          service_name: string
          status: string | null
          uptime: number | null
          version: string | null
        }
        Insert: {
          dependencies?: Json | null
          description?: string | null
          endpoint_url?: string | null
          error_count?: number | null
          health_data?: Json | null
          id?: string
          last_check?: string | null
          response_time?: number | null
          service_name: string
          status?: string | null
          uptime?: number | null
          version?: string | null
        }
        Update: {
          dependencies?: Json | null
          description?: string | null
          endpoint_url?: string | null
          error_count?: number | null
          health_data?: Json | null
          id?: string
          last_check?: string | null
          response_time?: number | null
          service_name?: string
          status?: string | null
          uptime?: number | null
          version?: string | null
        }
        Relationships: []
      }
      stripe_config: {
        Row: {
          connect_client_id: string | null
          created_at: string
          environment: string | null
          id: string
          is_active: boolean
          publishable_key: string
          secret_key: string
          tenant_id: string | null
          updated_at: string
          webhook_secret: string | null
        }
        Insert: {
          connect_client_id?: string | null
          created_at?: string
          environment?: string | null
          id?: string
          is_active?: boolean
          publishable_key: string
          secret_key: string
          tenant_id?: string | null
          updated_at?: string
          webhook_secret?: string | null
        }
        Update: {
          connect_client_id?: string | null
          created_at?: string
          environment?: string | null
          id?: string
          is_active?: boolean
          publishable_key?: string
          secret_key?: string
          tenant_id?: string | null
          updated_at?: string
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stripe_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_transactions: {
        Row: {
          affiliate_id: string | null
          amount: number
          commission_amount: number | null
          commission_paid: boolean | null
          created_at: string | null
          currency: string
          description: string | null
          id: string
          metadata: Json | null
          net_amount: number | null
          payment_method: string | null
          processed_at: string | null
          status: string
          stripe_charge_id: string | null
          stripe_customer_id: string | null
          stripe_fee: number | null
          stripe_payment_intent_id: string | null
          tenant_id: string
          updated_at: string | null
          webhook_event_id: string | null
        }
        Insert: {
          affiliate_id?: string | null
          amount: number
          commission_amount?: number | null
          commission_paid?: boolean | null
          created_at?: string | null
          currency?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          net_amount?: number | null
          payment_method?: string | null
          processed_at?: string | null
          status: string
          stripe_charge_id?: string | null
          stripe_customer_id?: string | null
          stripe_fee?: number | null
          stripe_payment_intent_id?: string | null
          tenant_id: string
          updated_at?: string | null
          webhook_event_id?: string | null
        }
        Update: {
          affiliate_id?: string | null
          amount?: number
          commission_amount?: number | null
          commission_paid?: boolean | null
          created_at?: string | null
          currency?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          net_amount?: number | null
          payment_method?: string | null
          processed_at?: string | null
          status?: string
          stripe_charge_id?: string | null
          stripe_customer_id?: string | null
          stripe_fee?: number | null
          stripe_payment_intent_id?: string | null
          tenant_id?: string
          updated_at?: string | null
          webhook_event_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stripe_transactions_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stripe_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_webhook_logs: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          payload: Json
          processed: boolean
          processed_at: string | null
          stripe_event_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          id?: string
          payload: Json
          processed?: boolean
          processed_at?: string | null
          stripe_event_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          payload?: Json
          processed?: boolean
          processed_at?: string | null
          stripe_event_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          amount: number | null
          cancel_at_period_end: boolean | null
          created_at: string | null
          currency: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_name: string
          profile_id: string
          status: string
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_product_id: string | null
          stripe_subscription_id: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          amount?: number | null
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          currency?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_name?: string
          profile_id: string
          status?: string
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          stripe_subscription_id?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number | null
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          currency?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_name?: string
          profile_id?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          stripe_subscription_id?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      system_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_type: string
          current_value: number | null
          escalated: boolean | null
          escalated_at: string | null
          id: string
          message: string
          metadata: Json | null
          metric_name: string | null
          resolved_at: string | null
          resolved_by: string | null
          service_name: string | null
          severity: string
          status: string | null
          threshold_value: number | null
          title: string
          triggered_at: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type: string
          current_value?: number | null
          escalated?: boolean | null
          escalated_at?: string | null
          id?: string
          message: string
          metadata?: Json | null
          metric_name?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          service_name?: string | null
          severity: string
          status?: string | null
          threshold_value?: number | null
          title: string
          triggered_at?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type?: string
          current_value?: number | null
          escalated?: boolean | null
          escalated_at?: string | null
          id?: string
          message?: string
          metadata?: Json | null
          metric_name?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          service_name?: string | null
          severity?: string
          status?: string | null
          threshold_value?: number | null
          title?: string
          triggered_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_alerts_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "admin_users_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_alerts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "admin_users_view"
            referencedColumns: ["id"]
          },
        ]
      }
      system_logs: {
        Row: {
          component: string | null
          id: string
          level: string | null
          message: string
          metadata: Json | null
          request_id: string | null
          service_name: string | null
          session_id: string | null
          stack_trace: string | null
          timestamp: string | null
          user_id: string | null
        }
        Insert: {
          component?: string | null
          id?: string
          level?: string | null
          message: string
          metadata?: Json | null
          request_id?: string | null
          service_name?: string | null
          session_id?: string | null
          stack_trace?: string | null
          timestamp?: string | null
          user_id?: string | null
        }
        Update: {
          component?: string | null
          id?: string
          level?: string | null
          message?: string
          metadata?: Json | null
          request_id?: string | null
          service_name?: string | null
          session_id?: string | null
          stack_trace?: string | null
          timestamp?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_users_view"
            referencedColumns: ["id"]
          },
        ]
      }
      system_metrics: {
        Row: {
          description: string | null
          dimensions: Json | null
          id: string
          metric_name: string
          metric_value: number
          recorded_at: string | null
          service_name: string | null
          status: string | null
          threshold_value: number | null
          unit: string | null
        }
        Insert: {
          description?: string | null
          dimensions?: Json | null
          id?: string
          metric_name: string
          metric_value: number
          recorded_at?: string | null
          service_name?: string | null
          status?: string | null
          threshold_value?: number | null
          unit?: string | null
        }
        Update: {
          description?: string | null
          dimensions?: Json | null
          id?: string
          metric_name?: string
          metric_value?: number
          recorded_at?: string | null
          service_name?: string | null
          status?: string | null
          threshold_value?: number | null
          unit?: string | null
        }
        Relationships: []
      }
      system_modules: {
        Row: {
          created_at: string | null
          description: string | null
          display_name: string
          icon: string | null
          id: string
          is_active: boolean | null
          is_essential: boolean | null
          name: string
          route: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          display_name: string
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_essential?: boolean | null
          name: string
          route: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          display_name?: string
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_essential?: boolean | null
          name?: string
          route?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "system_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "admin_users_view"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_access_events: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          id: string
          note: string | null
          source: string
          tenant_id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          source: string
          tenant_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          source?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_access_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "admin_users_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_access_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_module_settings: {
        Row: {
          activated_at: string | null
          created_at: string | null
          deactivated_at: string | null
          id: string
          is_active: boolean | null
          module_id: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          activated_at?: string | null
          created_at?: string | null
          deactivated_at?: string | null
          id?: string
          is_active?: boolean | null
          module_id: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          activated_at?: string | null
          created_at?: string | null
          deactivated_at?: string | null
          id?: string
          is_active?: boolean | null
          module_id?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_module_settings_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "system_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_module_settings_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "tenant_active_modules"
            referencedColumns: ["module_id"]
          },
          {
            foreignKeyName: "tenant_module_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          affiliate_code: string | null
          affiliate_id: string | null
          agent_signature_enabled: boolean
          bug_report_enabled: boolean
          chip_mode: string
          created_at: string
          domain: string | null
          id: string
          kind: string
          manual_access_granted: boolean | null
          manual_access_granted_at: string | null
          manual_access_granted_by: string | null
          max_users: number | null
          max_whatsapp_instances: number | null
          name: string
          parent_tenant_id: string | null
          plan_type: string | null
          settings: Json | null
          slug: string
          status: Database["public"]["Enums"]["tenant_status"] | null
          store_slots_extra: number
          store_slots_included: number
          stripe_customer_id: string | null
          subscription_cancel_at: string | null
          subscription_id: string | null
          subscription_status: string | null
          subscription_will_cancel: boolean
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          affiliate_code?: string | null
          affiliate_id?: string | null
          agent_signature_enabled?: boolean
          bug_report_enabled?: boolean
          chip_mode?: string
          created_at?: string
          domain?: string | null
          id?: string
          kind?: string
          manual_access_granted?: boolean | null
          manual_access_granted_at?: string | null
          manual_access_granted_by?: string | null
          max_users?: number | null
          max_whatsapp_instances?: number | null
          name: string
          parent_tenant_id?: string | null
          plan_type?: string | null
          settings?: Json | null
          slug: string
          status?: Database["public"]["Enums"]["tenant_status"] | null
          store_slots_extra?: number
          store_slots_included?: number
          stripe_customer_id?: string | null
          subscription_cancel_at?: string | null
          subscription_id?: string | null
          subscription_status?: string | null
          subscription_will_cancel?: boolean
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          affiliate_code?: string | null
          affiliate_id?: string | null
          agent_signature_enabled?: boolean
          bug_report_enabled?: boolean
          chip_mode?: string
          created_at?: string
          domain?: string | null
          id?: string
          kind?: string
          manual_access_granted?: boolean | null
          manual_access_granted_at?: string | null
          manual_access_granted_by?: string | null
          max_users?: number | null
          max_whatsapp_instances?: number | null
          name?: string
          parent_tenant_id?: string | null
          plan_type?: string | null
          settings?: Json | null
          slug?: string
          status?: Database["public"]["Enums"]["tenant_status"] | null
          store_slots_extra?: number
          store_slots_included?: number
          stripe_customer_id?: string | null
          subscription_cancel_at?: string | null
          subscription_id?: string | null
          subscription_status?: string | null
          subscription_will_cancel?: boolean
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenants_manual_access_granted_by_fkey"
            columns: ["manual_access_granted_by"]
            isOneToOne: false
            referencedRelation: "admin_users_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenants_parent_tenant_id_fkey"
            columns: ["parent_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_events: {
        Row: {
          contact_id: string | null
          event_data: Json | null
          event_type: string
          id: string
          lead_tracking_id: string | null
          page_url: string | null
          tenant_id: string
          timestamp: string | null
        }
        Insert: {
          contact_id?: string | null
          event_data?: Json | null
          event_type: string
          id?: string
          lead_tracking_id?: string | null
          page_url?: string | null
          tenant_id: string
          timestamp?: string | null
        }
        Update: {
          contact_id?: string | null
          event_data?: Json | null
          event_type?: string
          id?: string
          lead_tracking_id?: string | null
          page_url?: string | null
          tenant_id?: string
          timestamp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tracking_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_events_lead_tracking_id_fkey"
            columns: ["lead_tracking_id"]
            isOneToOne: false
            referencedRelation: "lead_tracking"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      traffic_sources: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          tenant_id: string
          type: string
          updated_at: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          tenant_id: string
          type: string
          updated_at?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          tenant_id?: string
          type?: string
          updated_at?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "traffic_sources_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_limits: {
        Row: {
          created_at: string
          description: string | null
          id: string
          limit_name: string
          limit_value: Json
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          limit_name: string
          limit_value?: Json
          role: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          limit_name?: string
          limit_value?: Json
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      user_activity_log: {
        Row: {
          created_at: string
          event_type: string
          id: string
          ip: unknown
          metadata: Json | null
          profile_id: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          ip?: unknown
          metadata?: Json | null
          profile_id: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          ip?: unknown
          metadata?: Json | null
          profile_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_activity_log_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_configuration_attempts: {
        Row: {
          attempt_number: number
          created_at: string | null
          error_message: string | null
          events: string[]
          id: string
          response_data: Json | null
          success: boolean | null
          webhook_url: string
          whatsapp_instance_id: string
        }
        Insert: {
          attempt_number: number
          created_at?: string | null
          error_message?: string | null
          events: string[]
          id?: string
          response_data?: Json | null
          success?: boolean | null
          webhook_url: string
          whatsapp_instance_id: string
        }
        Update: {
          attempt_number?: number
          created_at?: string | null
          error_message?: string | null
          events?: string[]
          id?: string
          response_data?: Json | null
          success?: boolean | null
          webhook_url?: string
          whatsapp_instance_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_configuration_attempts_whatsapp_instance_id_fkey"
            columns: ["whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_deliveries: {
        Row: {
          attempts: number
          created_at: string
          delivered_at: string | null
          error_message: string | null
          event_type: string
          id: string
          max_attempts: number
          payload: Json
          response_status: number | null
          scheduled_at: string
          status: string
          tenant_id: string
          updated_at: string
          webhook_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          event_type: string
          id?: string
          max_attempts?: number
          payload?: Json
          response_status?: number | null
          scheduled_at?: string
          status?: string
          tenant_id: string
          updated_at?: string
          webhook_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          event_type?: string
          id?: string
          max_attempts?: number
          payload?: Json
          response_status?: number | null
          scheduled_at?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_deliveries_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_errors: {
        Row: {
          created_at: string
          error_context: Json | null
          error_message: string
          error_stack: string | null
          event_data: Json | null
          event_type: string
          id: string
          instance_name: string
          memory_usage: Json | null
          processing_time_ms: number | null
          retry_count: number | null
        }
        Insert: {
          created_at?: string
          error_context?: Json | null
          error_message: string
          error_stack?: string | null
          event_data?: Json | null
          event_type: string
          id?: string
          instance_name: string
          memory_usage?: Json | null
          processing_time_ms?: number | null
          retry_count?: number | null
        }
        Update: {
          created_at?: string
          error_context?: Json | null
          error_message?: string
          error_stack?: string | null
          event_data?: Json | null
          event_type?: string
          id?: string
          instance_name?: string
          memory_usage?: Json | null
          processing_time_ms?: number | null
          retry_count?: number | null
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          created_at: string
          destination: string | null
          error_message: string | null
          event_data: Json | null
          event_type: string
          http_status: number | null
          id: string
          instance_name: string
          memory_usage: Json | null
          processed_at: string
          processing_time_ms: number | null
          response_body: string | null
          retry_count: number | null
          sender: string | null
          server_url: string | null
          updated_at: string | null
          webhook_url: string | null
          whatsapp_instance_id: string | null
        }
        Insert: {
          created_at?: string
          destination?: string | null
          error_message?: string | null
          event_data?: Json | null
          event_type: string
          http_status?: number | null
          id?: string
          instance_name: string
          memory_usage?: Json | null
          processed_at?: string
          processing_time_ms?: number | null
          response_body?: string | null
          retry_count?: number | null
          sender?: string | null
          server_url?: string | null
          updated_at?: string | null
          webhook_url?: string | null
          whatsapp_instance_id?: string | null
        }
        Update: {
          created_at?: string
          destination?: string | null
          error_message?: string | null
          event_data?: Json | null
          event_type?: string
          http_status?: number | null
          id?: string
          instance_name?: string
          memory_usage?: Json | null
          processed_at?: string
          processing_time_ms?: number | null
          response_body?: string | null
          retry_count?: number | null
          sender?: string | null
          server_url?: string | null
          updated_at?: string | null
          webhook_url?: string | null
          whatsapp_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_logs_whatsapp_instance_id_fkey"
            columns: ["whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      webhooks: {
        Row: {
          created_at: string
          events: string[]
          id: string
          is_active: boolean
          name: string
          secret: string | null
          tenant_id: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          events?: string[]
          id?: string
          is_active?: boolean
          name: string
          secret?: string | null
          tenant_id: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          events?: string[]
          id?: string
          is_active?: boolean
          name?: string
          secret?: string | null
          tenant_id?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhooks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_instances: {
        Row: {
          account_review_status: string | null
          assigned_profile_id: string | null
          automation_enabled: boolean | null
          connection_config: Json | null
          created_at: string
          evolution_api_key: string | null
          evolution_api_url: string | null
          health_updated_at: string | null
          id: string
          instance_key: string
          is_active: boolean | null
          is_restricted: boolean
          last_connected_at: string | null
          messaging_limit_tier: string | null
          name: string
          phone_number: string | null
          profile_name: string | null
          profile_picture_url: string | null
          provider: string | null
          qr_code: string | null
          quality_rating: string | null
          registered_at: string | null
          restriction_info: Json | null
          status: string | null
          tenant_id: string
          updated_at: string
          webhook_configured: boolean | null
          webhook_events: string[] | null
          webhook_last_configured_at: string | null
          webhook_last_error: string | null
          webhook_retry_count: number | null
          webhook_url: string | null
        }
        Insert: {
          account_review_status?: string | null
          assigned_profile_id?: string | null
          automation_enabled?: boolean | null
          connection_config?: Json | null
          created_at?: string
          evolution_api_key?: string | null
          evolution_api_url?: string | null
          health_updated_at?: string | null
          id?: string
          instance_key: string
          is_active?: boolean | null
          is_restricted?: boolean
          last_connected_at?: string | null
          messaging_limit_tier?: string | null
          name: string
          phone_number?: string | null
          profile_name?: string | null
          profile_picture_url?: string | null
          provider?: string | null
          qr_code?: string | null
          quality_rating?: string | null
          registered_at?: string | null
          restriction_info?: Json | null
          status?: string | null
          tenant_id: string
          updated_at?: string
          webhook_configured?: boolean | null
          webhook_events?: string[] | null
          webhook_last_configured_at?: string | null
          webhook_last_error?: string | null
          webhook_retry_count?: number | null
          webhook_url?: string | null
        }
        Update: {
          account_review_status?: string | null
          assigned_profile_id?: string | null
          automation_enabled?: boolean | null
          connection_config?: Json | null
          created_at?: string
          evolution_api_key?: string | null
          evolution_api_url?: string | null
          health_updated_at?: string | null
          id?: string
          instance_key?: string
          is_active?: boolean | null
          is_restricted?: boolean
          last_connected_at?: string | null
          messaging_limit_tier?: string | null
          name?: string
          phone_number?: string | null
          profile_name?: string | null
          profile_picture_url?: string | null
          provider?: string | null
          qr_code?: string | null
          quality_rating?: string | null
          registered_at?: string | null
          restriction_info?: Json | null
          status?: string | null
          tenant_id?: string
          updated_at?: string
          webhook_configured?: boolean | null
          webhook_events?: string[] | null
          webhook_last_configured_at?: string | null
          webhook_last_error?: string | null
          webhook_retry_count?: number | null
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_instances_assigned_profile_id_fkey"
            columns: ["assigned_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_instances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_policy_change_log: {
        Row: {
          detected_at: string
          document_key: string
          excerpt: string | null
          http_status: number | null
          id: string
          new_hash: string | null
          old_hash: string | null
        }
        Insert: {
          detected_at?: string
          document_key: string
          excerpt?: string | null
          http_status?: number | null
          id?: string
          new_hash?: string | null
          old_hash?: string | null
        }
        Update: {
          detected_at?: string
          document_key?: string
          excerpt?: string | null
          http_status?: number | null
          id?: string
          new_hash?: string | null
          old_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_policy_change_log_document_key_fkey"
            columns: ["document_key"]
            isOneToOne: false
            referencedRelation: "whatsapp_policy_documents"
            referencedColumns: ["key"]
          },
        ]
      }
      whatsapp_policy_documents: {
        Row: {
          created_at: string
          is_active: boolean
          key: string
          label: string
          last_changed_at: string | null
          last_checked_at: string | null
          last_error: string | null
          last_hash: string | null
          last_status_code: number | null
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          is_active?: boolean
          key: string
          label: string
          last_changed_at?: string | null
          last_checked_at?: string | null
          last_error?: string | null
          last_hash?: string | null
          last_status_code?: number | null
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          is_active?: boolean
          key?: string
          label?: string
          last_changed_at?: string | null
          last_checked_at?: string | null
          last_error?: string | null
          last_hash?: string | null
          last_status_code?: number | null
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
    }
    Views: {
      active_alerts_summary: {
        Row: {
          alert_count: number | null
          newest_alert: string | null
          oldest_alert: string | null
          severity: string | null
        }
        Relationships: []
      }
      admin_users_view: {
        Row: {
          created_at: string | null
          email: string | null
          email_confirmed_at: string | null
          first_name: string | null
          id: string | null
          is_active: boolean | null
          last_name: string | null
          last_sign_in_at: string | null
          manual_access_granted: boolean | null
          phone: string | null
          profile_updated_at: string | null
          role: Database["public"]["Enums"]["user_role"] | null
          status: string | null
          tenant_id: string | null
          tenant_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_performance_daily: {
        Row: {
          avg_order_value: number | null
          conversion_rate: number | null
          conversions: number | null
          date: string | null
          leads: number | null
          revenue: number | null
          tenant_id: string | null
          utm_campaign: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_tracking_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_performance_daily_filtered: {
        Row: {
          avg_order_value: number | null
          conversion_rate: number | null
          conversions: number | null
          date: string | null
          leads: number | null
          revenue: number | null
          tenant_id: string | null
          utm_campaign: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_tracking_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      conversion_funnel_view: {
        Row: {
          count: number | null
          date: string | null
          stage_name: string | null
          stage_order: number | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      current_service_health: {
        Row: {
          data_freshness: string | null
          error_count: number | null
          last_check: string | null
          response_time: number | null
          service_name: string | null
          status: string | null
          uptime: number | null
        }
        Insert: {
          data_freshness?: never
          error_count?: number | null
          last_check?: string | null
          response_time?: number | null
          service_name?: string | null
          status?: string | null
          uptime?: number | null
        }
        Update: {
          data_freshness?: never
          error_count?: number | null
          last_check?: string | null
          response_time?: number | null
          service_name?: string | null
          status?: string | null
          uptime?: number | null
        }
        Relationships: []
      }
      daily_analytics_view: {
        Row: {
          conversions: number | null
          date: string | null
          leads: number | null
          revenue: number | null
          tenant_id: string | null
          visitors: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_tracking_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      report_performance_daily: {
        Row: {
          date: string | null
          failed_reports: number | null
          success_rate: number | null
          successful_reports: number | null
          tenant_id: string | null
          total_reports: number | null
        }
        Relationships: [
          {
            foreignKeyName: "report_data_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      report_performance_daily_filtered: {
        Row: {
          date: string | null
          failed_reports: number | null
          success_rate: number | null
          successful_reports: number | null
          tenant_id: string | null
          total_reports: number | null
        }
        Relationships: [
          {
            foreignKeyName: "report_data_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      report_statistics: {
        Row: {
          avg_execution_time: number | null
          category: string | null
          failed_executions: number | null
          last_execution: string | null
          successful_executions: number | null
          template_id: string | null
          template_name: string | null
          tenant_id: string | null
          total_executions: number | null
          type: string | null
          usage_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "report_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      source_performance_view: {
        Row: {
          conversions: number | null
          cost: number | null
          date: string | null
          leads: number | null
          revenue: number | null
          source: string | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_tracking_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      system_metrics_hourly: {
        Row: {
          avg_value: number | null
          hour: string | null
          max_value: number | null
          metric_name: string | null
          min_value: number | null
          sample_count: number | null
          service_name: string | null
          std_deviation: number | null
        }
        Relationships: []
      }
      system_metrics_hourly_filtered: {
        Row: {
          avg_value: number | null
          hour: string | null
          max_value: number | null
          metric_name: string | null
          min_value: number | null
          sample_count: number | null
          service_name: string | null
          std_deviation: number | null
        }
        Relationships: []
      }
      tenant_active_modules: {
        Row: {
          activated_at: string | null
          deactivated_at: string | null
          description: string | null
          display_name: string | null
          icon: string | null
          is_active: boolean | null
          is_essential: boolean | null
          module_id: string | null
          name: string | null
          route: string | null
          sort_order: number | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_module_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_metrics_daily: {
        Row: {
          conversion_rate: number | null
          conversions: number | null
          date: string | null
          tenant_id: string | null
          total_leads: number | null
          total_revenue: number | null
          unique_sources: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_tracking_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_metrics_daily_filtered: {
        Row: {
          conversion_rate: number | null
          conversions: number | null
          date: string | null
          tenant_id: string | null
          total_leads: number | null
          total_revenue: number | null
          unique_sources: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_tracking_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_metrics_view: {
        Row: {
          conversions: number | null
          created_at: string | null
          leads: number | null
          revenue: number | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_tracking_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_followups: {
        Row: {
          assigned_to: string | null
          attempts: number | null
          cancelled_at: string | null
          completed_at: string | null
          contact_id: string | null
          created_at: string | null
          created_by_automation: boolean | null
          due_date: string | null
          effective_status: string | null
          error_message: string | null
          id: string | null
          last_sent_at: string | null
          message_body: string | null
          mode: string | null
          notes: string | null
          parent_followup_id: string | null
          priority: string | null
          provider_message_id: string | null
          recurring: boolean | null
          recurring_count: number | null
          recurring_end_date: string | null
          recurring_interval: number | null
          recurring_type: string | null
          scheduled_at: string | null
          sequence_enrollment_id: string | null
          sequence_step_order: number | null
          source: string | null
          status: string | null
          tags: string[] | null
          task: string | null
          template_language: string | null
          template_name: string | null
          template_params: Json | null
          tenant_id: string | null
          type: string | null
          updated_at: string | null
          whatsapp_instance_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          attempts?: number | null
          cancelled_at?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by_automation?: boolean | null
          due_date?: string | null
          effective_status?: never
          error_message?: string | null
          id?: string | null
          last_sent_at?: string | null
          message_body?: string | null
          mode?: string | null
          notes?: string | null
          parent_followup_id?: string | null
          priority?: string | null
          provider_message_id?: string | null
          recurring?: boolean | null
          recurring_count?: number | null
          recurring_end_date?: string | null
          recurring_interval?: number | null
          recurring_type?: string | null
          scheduled_at?: string | null
          sequence_enrollment_id?: string | null
          sequence_step_order?: number | null
          source?: string | null
          status?: string | null
          tags?: string[] | null
          task?: string | null
          template_language?: string | null
          template_name?: string | null
          template_params?: Json | null
          tenant_id?: string | null
          type?: string | null
          updated_at?: string | null
          whatsapp_instance_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          attempts?: number | null
          cancelled_at?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by_automation?: boolean | null
          due_date?: string | null
          effective_status?: never
          error_message?: string | null
          id?: string | null
          last_sent_at?: string | null
          message_body?: string | null
          mode?: string | null
          notes?: string | null
          parent_followup_id?: string | null
          priority?: string | null
          provider_message_id?: string | null
          recurring?: boolean | null
          recurring_count?: number | null
          recurring_end_date?: string | null
          recurring_interval?: number | null
          recurring_type?: string | null
          scheduled_at?: string | null
          sequence_enrollment_id?: string | null
          sequence_step_order?: number | null
          source?: string | null
          status?: string | null
          tags?: string[] | null
          task?: string | null
          template_language?: string | null
          template_name?: string | null
          template_params?: Json | null
          tenant_id?: string | null
          type?: string | null
          updated_at?: string | null
          whatsapp_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "individual_followups_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "individual_followups_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "individual_followups_parent_followup_id_fkey"
            columns: ["parent_followup_id"]
            isOneToOne: false
            referencedRelation: "individual_followups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "individual_followups_parent_followup_id_fkey"
            columns: ["parent_followup_id"]
            isOneToOne: false
            referencedRelation: "v_followups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "individual_followups_sequence_enrollment_fk"
            columns: ["sequence_enrollment_id"]
            isOneToOne: false
            referencedRelation: "followup_sequence_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "individual_followups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "individual_followups_whatsapp_instance_id_fkey"
            columns: ["whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      activate_essential_modules_for_tenant: {
        Args: { tenant_uuid: string }
        Returns: undefined
      }
      calculate_affiliate_commission: {
        Args: {
          p_affiliate_id: string
          p_base_amount: number
          p_billing_period_end?: string
          p_billing_period_start?: string
          p_calculation_type: string
        }
        Returns: string
      }
      can_manage_profile: { Args: { target_id: string }; Returns: boolean }
      cleanup_expired_cache: { Args: never; Returns: undefined }
      cleanup_monitoring_data: { Args: never; Returns: undefined }
      cleanup_old_system_metrics: {
        Args: { days_to_keep?: number }
        Returns: number
      }
      complete_job: {
        Args: { p_error_message?: string; p_job_id: string; p_success: boolean }
        Returns: boolean
      }
      current_capability_role: { Args: never; Returns: string }
      current_profile_id: { Args: never; Returns: string }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      dequeue_next_job:
        | {
            Args: never
            Returns: {
              company_id: string
              id: string
              job_data: Json
              job_type: string
              scheduled_at: string
            }[]
          }
        | {
            Args: { p_job_types?: string[] }
            Returns: {
              current_attempts: number
              id: string
              job_data: Json
              job_type: string
              tenant_id: string
            }[]
          }
      descendant_profile_ids: { Args: { root_id: string }; Returns: string[] }
      emit_webhook_event: {
        Args: { p_event_type: string; p_payload: Json; p_tenant_id: string }
        Returns: undefined
      }
      enqueue_job:
        | {
            Args: {
              p_company_id: string
              p_job_data: Json
              p_job_type: string
              p_scheduled_at?: string
            }
            Returns: string
          }
        | {
            Args: {
              p_job_data?: Json
              p_job_type: string
              p_priority?: number
              p_scheduled_at?: string
              p_tenant_id: string
            }
            Returns: string
          }
      evaluate_alert_rules: { Args: never; Returns: undefined }
      finalize_completed_campaigns: { Args: never; Returns: number }
      fire_automation_trigger: {
        Args: {
          p_contact_id: string
          p_data?: Json
          p_tenant_id: string
          p_type: string
        }
        Returns: undefined
      }
      flip_overdue_followups: { Args: never; Returns: number }
      get_admin_users_data: {
        Args: never
        Returns: {
          avatar_url: string
          created_at: string
          email: string
          first_name: string
          id: string
          is_active: boolean
          last_name: string
          phone: string
          plan_type: string
          role: string
          tenant_id: string
          tenant_name: string
          updated_at: string
          user_id: string
        }[]
      }
      get_auth_users_for_admin: {
        Args: never
        Returns: {
          created_at: string
          email: string
          email_confirmed_at: string
          id: string
          last_sign_in_at: string
        }[]
      }
      get_current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      get_current_user_tenant_id: { Args: never; Returns: string }
      get_database_performance_metrics: {
        Args: never
        Returns: {
          description: string
          metric_name: string
          metric_unit: string
          metric_value: number
        }[]
      }
      get_delivery_log: {
        Args: { p_company_id: string }
        Returns: {
          contact_name: string
          message_content: string
          phone: string
          sent_at: string
          status: string
        }[]
      }
      get_followup_stats: { Args: { p_tenant_id: string }; Returns: Json }
      get_instance_meta_token: {
        Args: { p_instance_id: string }
        Returns: string
      }
      get_materialized_view_stats: {
        Args: never
        Returns: {
          is_populated: boolean
          last_refresh: string
          row_count: number
          size_bytes: number
          view_name: string
        }[]
      }
      get_my_child_tenant_ids: { Args: never; Returns: string[] }
      get_stripe_transaction_stats: {
        Args: {
          p_end_date?: string
          p_start_date?: string
          p_tenant_id: string
        }
        Returns: {
          avg_transaction_amount: number
          failed_transactions: number
          pending_transactions: number
          successful_transactions: number
          total_amount: number
          total_commission: number
          total_fees: number
          total_net_amount: number
          total_transactions: number
        }[]
      }
      handle_evolution_webhook: {
        Args: { event_data: Json; event_type: string; instance_name: string }
        Returns: undefined
      }
      handle_new_message:
        | {
            Args: { p_instance_name: string; p_message_data: Json }
            Returns: string
          }
        | { Args: { payload: Json }; Returns: undefined }
      has_capability: { Args: { p_capability: string }; Returns: boolean }
      increment_campaign_sent_count: {
        Args: { p_campaign_id: string }
        Returns: undefined
      }
      instance_outbound_today: {
        Args: { p_instance_id: string }
        Returns: number
      }
      is_account_manager_safe: { Args: never; Returns: boolean }
      is_agencia: { Args: never; Returns: boolean }
      is_agencia_safe: { Args: never; Returns: boolean }
      is_atendente: { Args: never; Returns: boolean }
      is_atendente_safe: { Args: never; Returns: boolean }
      is_enterprise_safe: { Args: never; Returns: boolean }
      is_gerente: { Args: never; Returns: boolean }
      is_gerente_safe: { Args: never; Returns: boolean }
      is_gestor: { Args: never; Returns: boolean }
      is_gestor_safe: { Args: never; Returns: boolean }
      is_loja: { Args: never; Returns: boolean }
      is_loja_safe: { Args: never; Returns: boolean }
      is_my_descendant: { Args: { target_id: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      is_super_admin_safe: { Args: never; Returns: boolean }
      is_tenant_in_my_descendants: {
        Args: { target_tenant_id: string }
        Returns: boolean
      }
      is_user_in_my_tenant: { Args: { target_id: string }; Returns: boolean }
      is_within_service_window: {
        Args: { p_instance_id: string; p_phone: string }
        Returns: boolean
      }
      mark_all_notifications_as_read: { Args: never; Returns: undefined }
      mark_notification_as_read: {
        Args: { notification_id: string }
        Returns: undefined
      }
      normalize_ad_referral: {
        Args: { p_referral: Json }
        Returns: {
          ctwa_clid: string
          display_name: string
          source_id: string
          source_type: string
          source_url: string
          traffic_type: string
          utm_medium: string
          utm_source: string
        }[]
      }
      notify_overdue_followups: { Args: never; Returns: undefined }
      process_chatbot_variables: {
        Args: {
          p_contact_id: string
          p_incoming_message?: string
          p_message_template: string
        }
        Returns: string
      }
      process_flow_step: {
        Args: {
          chatbot_id_arg: string
          contact_id_arg: string
          message_content_arg: string
        }
        Returns: undefined
      }
      process_incoming_message: {
        Args: {
          p_evolution_message_id?: string
          p_message_content: string
          p_phone: string
          p_whatsapp_instance_id: string
        }
        Returns: Json
      }
      promote_scheduled_campaigns: { Args: never; Returns: undefined }
      recompute_campaign_metrics: {
        Args: { p_campaign_id: string }
        Returns: undefined
      }
      refresh_all_materialized_views: {
        Args: never
        Returns: {
          error_message: string
          success: boolean
          view_name: string
        }[]
      }
      refresh_materialized_view: {
        Args: { view_name: string }
        Returns: boolean
      }
      refresh_monitoring_views: { Args: never; Returns: undefined }
      refresh_tracking_views: { Args: never; Returns: undefined }
      schedule_campaign_messages: {
        Args: { p_campaign_id: string }
        Returns: number
      }
      schedule_follow_up_message: {
        Args: {
          p_contact_id: string
          p_delay_hours: number
          p_sequence_id: string
          p_step_id: string
        }
        Returns: string
      }
      schedule_materialized_view_refresh: {
        Args: { view_name: string }
        Returns: undefined
      }
      seed_default_tags: { Args: { p_tenant_id: string }; Returns: undefined }
      set_campaign_status: {
        Args: { p_action: string; p_campaign_id: string }
        Returns: string
      }
      set_contact_opt_out_by_phone: {
        Args: { p_phone: string; p_source?: string; p_tenant: string }
        Returns: number
      }
      set_instance_meta_token: {
        Args: { p_instance_id: string; p_token: string }
        Returns: string
      }
      set_tenant_settings: {
        Args: { p_patch: Json; p_tenant_id: string }
        Returns: Json
      }
      tenant_access_state: {
        Args: { p_tenant_id: string }
        Returns: {
          source: string
          unlocked: boolean
        }[]
      }
      tenant_team_directory: {
        Args: { p_tenant_id?: string }
        Returns: {
          avatar_url: string
          first_name: string
          id: string
          last_name: string
        }[]
      }
      update_affiliate_totals: {
        Args: { p_affiliate_id: string }
        Returns: undefined
      }
      update_message_status: {
        Args: { p_api_message_id: string; p_status: string }
        Returns: boolean
      }
    }
    Enums: {
      chatbot_node_type:
        | "start"
        | "send_text"
        | "ask_question"
        | "show_options"
        | "condition"
        | "transfer_agent"
        | "end_flow"
        | "set_variable"
        | "update_contact"
        | "move_funnel"
      chatbot_session_status:
        | "active"
        | "completed"
        | "transferred"
        | "abandoned"
      chatbot_trigger_type:
        | "keyword"
        | "first_contact"
        | "out_of_hours"
        | "no_agent_reply"
        | "funnel_stage"
      tenant_status: "active" | "inactive" | "trial" | "suspended" | "past_due"
      user_role:
        | "superadmin"
        | "enterprise"
        | "user"
        | "account_manager"
        | "agencia"
        | "loja"
        | "gerente"
        | "gestor"
        | "atendente"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      chatbot_node_type: [
        "start",
        "send_text",
        "ask_question",
        "show_options",
        "condition",
        "transfer_agent",
        "end_flow",
        "set_variable",
        "update_contact",
        "move_funnel",
      ],
      chatbot_session_status: [
        "active",
        "completed",
        "transferred",
        "abandoned",
      ],
      chatbot_trigger_type: [
        "keyword",
        "first_contact",
        "out_of_hours",
        "no_agent_reply",
        "funnel_stage",
      ],
      tenant_status: ["active", "inactive", "trial", "suspended", "past_due"],
      user_role: [
        "superadmin",
        "enterprise",
        "user",
        "account_manager",
        "agencia",
        "loja",
        "gerente",
        "gestor",
        "atendente",
      ],
    },
  },
} as const
