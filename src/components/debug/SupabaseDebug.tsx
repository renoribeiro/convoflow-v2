import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export const SupabaseDebug = () => {
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const checkSession = async () => {
    setLoading(true);
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      console.log('[SupabaseDebug] Session check:', { session, error });
      setSessionInfo({ session, error });
      
      if (session) {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        console.log('[SupabaseDebug] User check:', { user, userError });
        setUserInfo({ user, error: userError });
      }
    } catch (err) {
      console.error('[SupabaseDebug] Error:', err);
      setSessionInfo({ error: err });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkSession();
  }, []);

  const testQuery = async () => {
    try {
      const { data, error } = await supabase
        .from('module_settings')
        .select('*')
        .limit(1);
      
      console.log('[SupabaseDebug] Test query result:', { data, error });
      alert(`Query result: ${JSON.stringify({ data, error }, null, 2)}`);
    } catch (err) {
      console.error('[SupabaseDebug] Query error:', err);
      alert(`Query error: ${err}`);
    }
  };

  return (
    <Card className="mb-4 border-blue-200 bg-blue-50">
      <CardHeader>
        <CardTitle className="text-sm text-blue-800 flex items-center justify-between">
          Debug: Cliente Supabase
          <Button size="sm" onClick={checkSession} disabled={loading}>
            {loading ? 'Verificando...' : 'Atualizar'}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          <strong>URL Supabase:</strong> {supabase.supabaseUrl}
        </div>
        
        <div>
          <strong>Anon Key:</strong> {supabase.supabaseKey.substring(0, 20)}...
        </div>
        
        {sessionInfo && (
          <div className="p-2 bg-white rounded border">
            <strong>Sessão:</strong>
            <pre className="text-xs mt-1 overflow-auto max-h-32">
              {JSON.stringify(sessionInfo, null, 2)}
            </pre>
          </div>
        )}
        
        {userInfo && (
          <div className="p-2 bg-white rounded border">
            <strong>Usuário:</strong>
            <pre className="text-xs mt-1 overflow-auto max-h-32">
              {JSON.stringify(userInfo, null, 2)}
            </pre>
          </div>
        )}
        
        <Button size="sm" onClick={testQuery} className="w-full">
          Testar Query
        </Button>
      </CardContent>
    </Card>
  );
};