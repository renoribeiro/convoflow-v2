
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { Bot, MessageSquare, TrendingUp, Clock, Users, Zap } from 'lucide-react';
import { useChatbot } from '@/contexts/ChatbotContext';
import { CHART_SERIES } from '@/lib/chartColors';

interface ChatbotAnalyticsProps {
  chatbotId?: string;
}

const COLORS = CHART_SERIES;

export const ChatbotAnalytics: React.FC<ChatbotAnalyticsProps> = ({ chatbotId }) => {
  const { chatbots, getChatbotAnalytics } = useChatbot();
  const [selectedPeriod, setSelectedPeriod] = useState('30days');
  const [selectedBot, setSelectedBot] = useState(chatbotId || 'all');
  const [analytics, setAnalytics] = useState<any>(null);

  useEffect(() => {
    loadAnalytics();
  }, [selectedBot, selectedPeriod]);

  const loadAnalytics = async () => {
    try {
      if (selectedBot === 'all') {
        // Aggregate analytics for all bots
        const aggregatedData = {
          totalInteractions: chatbots.reduce((acc, bot) => acc + bot.analytics.totalInteractions, 0),
          successRate: chatbots.reduce((acc, bot) => acc + bot.analytics.successRate, 0) / chatbots.length,
          averageResponseTime: chatbots.reduce((acc, bot) => acc + bot.analytics.averageResponseTime, 0) / chatbots.length,
          topTriggers: chatbots.flatMap(bot => bot.analytics.topTriggers)
            .reduce((acc: any[], trigger) => {
              const existing = acc.find(t => t.trigger === trigger.trigger);
              if (existing) {
                existing.count += trigger.count;
              } else {
                acc.push({ ...trigger });
              }
              return acc;
            }, [])
            .sort((a, b) => b.count - a.count)
            .slice(0, 10),
          interactionsByDay: generateMockDailyData(),
          botPerformance: chatbots.map(bot => ({
            name: bot.name,
            interactions: bot.analytics.totalInteractions,
            successRate: bot.analytics.successRate
          }))
        };
        setAnalytics(aggregatedData);
      } else {
        const botAnalytics = await getChatbotAnalytics(selectedBot);
        setAnalytics({
          ...botAnalytics,
          interactionsByDay: generateMockDailyData(),
          botPerformance: []
        });
      }
    } catch (error) {
      console.error('Error loading analytics:', error);
    }
  };

  const generateMockDailyData = () => {
    const days = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      days.push({
        date: date.toISOString().split('T')[0],
        interactions: Math.floor(Math.random() * 50) + 10,
        success: Math.floor(Math.random() * 40) + 8
      });
    }
    return days;
  };

  if (!analytics) {
    return <div>Carregando analytics...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="flex items-center gap-4">
        <Select value={selectedBot} onValueChange={setSelectedBot}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Chatbots</SelectItem>
            {chatbots.map(bot => (
              <SelectItem key={bot.id} value={bot.id}>{bot.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7days">Últimos 7 dias</SelectItem>
            <SelectItem value="30days">Últimos 30 dias</SelectItem>
            <SelectItem value="90days">Últimos 90 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Métricas principais */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total de Interações</p>
                <p className="text-2xl font-bold">{analytics.totalInteractions.toLocaleString()}</p>
              </div>
              <MessageSquare className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Taxa de Sucesso</p>
                <p className="text-2xl font-bold text-green-600">{analytics.successRate.toFixed(1)}%</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Tempo de Resposta</p>
                <p className="text-2xl font-bold text-orange-600">{analytics.averageResponseTime.toFixed(1)}s</p>
              </div>
              <Clock className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Chatbots Ativos</p>
                <p className="text-2xl font-bold text-purple-600">{chatbots.filter(bot => bot.isActive).length}</p>
              </div>
              <Bot className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Interações por dia */}
        <Card>
          <CardHeader>
            <CardTitle>Interações Diárias</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={analytics.interactionsByDay}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="interactions" stroke={CHART_SERIES[0]} strokeWidth={2} />
                <Line type="monotone" dataKey="success" stroke={CHART_SERIES[1]} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top gatilhos */}
        <Card>
          <CardHeader>
            <CardTitle>Top Gatilhos</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analytics.topTriggers.slice(0, 5)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="trigger" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill={CHART_SERIES[0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Performance por bot (se visualizando todos) */}
        {selectedBot === 'all' && analytics.botPerformance.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Performance por Chatbot</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={analytics.botPerformance}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip />
                  <Bar yAxisId="left" dataKey="interactions" fill={CHART_SERIES[0]} name="Interações" />
                  <Bar yAxisId="right" dataKey="successRate" fill={CHART_SERIES[1]} name="Taxa de Sucesso %" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Lista de gatilhos detalhada */}
      <Card>
        <CardHeader>
          <CardTitle>Análise de Gatilhos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {analytics.topTriggers.map((trigger: any, index: number) => (
              <div key={trigger.trigger} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 bg-primary/10 rounded-full">
                    <span className="text-sm font-bold">#{index + 1}</span>
                  </div>
                  <div>
                    <h4 className="font-semibold">{trigger.trigger}</h4>
                    <p className="text-sm text-muted-foreground">{trigger.count} ativações</p>
                  </div>
                </div>
                <Badge variant="outline">
                  {((trigger.count / analytics.totalInteractions) * 100).toFixed(1)}% do total
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
