
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart3, MessageSquare, Users, Zap, Download } from 'lucide-react';

interface ChatbotReportsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChatbotReportsModal = ({ isOpen, onClose }: ChatbotReportsModalProps) => {
  const metrics = {
    totalInteractions: 1247,
    activeUsers: 324,
    responseRate: 87.5,
    avgResponseTime: 1.2
  };

  const topChatbots = [
    { name: 'Atendimento Geral', interactions: 456, rate: 89 },
    { name: 'Vendas Premium', interactions: 321, rate: 92 },
    { name: 'Suporte Técnico', interactions: 234, rate: 85 },
    { name: 'FAQ Básico', interactions: 189, rate: 78 }
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Relatórios de Chatbots</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Filtros */}
          <div className="flex items-center gap-4">
            <Select defaultValue="30days">
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7days">Últimos 7 dias</SelectItem>
                <SelectItem value="30days">Últimos 30 dias</SelectItem>
                <SelectItem value="90days">Últimos 90 dias</SelectItem>
              </SelectContent>
            </Select>
            <Select defaultValue="all">
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Chatbots</SelectItem>
                <SelectItem value="general">Atendimento Geral</SelectItem>
                <SelectItem value="sales">Vendas Premium</SelectItem>
                <SelectItem value="support">Suporte Técnico</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" />
              Exportar
            </Button>
          </div>

          {/* Métricas principais */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Total de Interações</p>
                    <p className="text-2xl font-bold">{metrics.totalInteractions.toLocaleString()}</p>
                  </div>
                  <MessageSquare className="h-8 w-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Usuários Ativos</p>
                    <p className="text-2xl font-bold text-green-600">{metrics.activeUsers}</p>
                  </div>
                  <Users className="h-8 w-8 text-green-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Taxa de Resposta</p>
                    <p className="text-2xl font-bold text-purple-600">{metrics.responseRate}%</p>
                  </div>
                  <BarChart3 className="h-8 w-8 text-purple-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Tempo Médio</p>
                    <p className="text-2xl font-bold text-orange-600">{metrics.avgResponseTime}s</p>
                  </div>
                  <Zap className="h-8 w-8 text-orange-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Top Chatbots */}
          <Card>
            <CardHeader>
              <CardTitle>Performance por Chatbot</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {topChatbots.map((bot, index) => (
                  <div key={bot.name} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 bg-primary/10 rounded-full">
                        <span className="text-sm font-bold">#{index + 1}</span>
                      </div>
                      <div>
                        <h4 className="font-semibold">{bot.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          {bot.interactions} interações
                        </p>
                      </div>
                    </div>
                    <Badge variant={bot.rate >= 90 ? 'default' : bot.rate >= 80 ? 'secondary' : 'outline'}>
                      {bot.rate}% taxa de sucesso
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={onClose}>Fechar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
