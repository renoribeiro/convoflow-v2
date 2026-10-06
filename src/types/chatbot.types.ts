
export interface ChatbotTrigger {
  id: string;
  phrase: string;
  isActive: boolean;
}

export interface ChatbotResponse {
  id: string;
  message: string;
  variables: string[];
  order: number;
}

export interface ChatbotFlow {
  id: string;
  name: string;
  steps: ChatbotFlowStep[];
}

export interface ChatbotFlowStep {
  id: string;
  type: 'message' | 'condition' | 'action';
  content: string;
  conditions?: ChatbotCondition[];
  nextStepId?: string;
}

export interface ChatbotCondition {
  field: string;
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith';
  value: string;
}

export interface ChatbotInteraction {
  id: string;
  chatbotId: string;
  contactPhone: string;
  message: string;
  response: string;
  timestamp: Date;
  wasSuccessful: boolean;
}

export interface ChatbotAnalytics {
  totalInteractions: number;
  successRate: number;
  averageResponseTime: number;
  topTriggers: { trigger: string; count: number }[];
  interactionsByDay: { date: string; count: number }[];
}

export interface Chatbot {
  id: string;
  name: string;
  description: string;
  type: 'simple' | 'flow';
  isActive: boolean;
  triggers: ChatbotTrigger[];
  responses: ChatbotResponse[];
  flow?: ChatbotFlow;
  whatsappInstanceId?: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  analytics: ChatbotAnalytics;
}

export interface ChatbotSettings {
  defaultResponseTime: number;
  maxRetries: number;
  enableFallback: boolean;
  fallbackMessage: string;
  businessHours: string;
  timezone: string;
  enableTypingIndicator: boolean;
  enableReadReceipts: boolean;
  autoTransferEnabled: boolean;
  transferThreshold: number;
}
