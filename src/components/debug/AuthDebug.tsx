import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const AuthDebug = () => {
  const { user, session, isLoading } = useAuth();

  return (
    <Card className="mb-4 border-yellow-200 bg-yellow-50">
      <CardHeader>
        <CardTitle className="text-sm text-yellow-800">Debug: Estado da Autenticação</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="font-medium">Loading:</span>
          <Badge variant={isLoading ? "destructive" : "secondary"}>
            {isLoading ? "Sim" : "Não"}
          </Badge>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="font-medium">Usuário:</span>
          <Badge variant={user ? "default" : "destructive"}>
            {user ? user.email : "Não autenticado"}
          </Badge>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="font-medium">Sessão:</span>
          <Badge variant={session ? "default" : "destructive"}>
            {session ? "Ativa" : "Inativa"}
          </Badge>
        </div>
        
        {user && (
          <div className="mt-2 p-2 bg-white rounded border">
            <div className="text-xs">
              <div><strong>ID:</strong> {user.id}</div>
              <div><strong>Email:</strong> {user.email}</div>
              <div><strong>Criado em:</strong> {new Date(user.created_at).toLocaleString()}</div>
            </div>
          </div>
        )}
        
        {session && (
          <div className="mt-2 p-2 bg-white rounded border">
            <div className="text-xs">
              <div><strong>Access Token:</strong> {session.access_token.substring(0, 20)}...</div>
              <div><strong>Expires:</strong> {new Date(session.expires_at! * 1000).toLocaleString()}</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};