import React from 'react';
import { env } from '@/lib/env';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const EnvironmentDebug = () => {
  const config = env.getAll();
  
  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>Environment Variables Debug</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h3 className="font-semibold mb-2">Supabase Configuration</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>SUPABASE_URL:</span>
                <Badge variant={config.SUPABASE_URL ? 'default' : 'destructive'}>
                  {config.SUPABASE_URL ? 'Set' : 'Missing'}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span>SUPABASE_ANON_KEY:</span>
                <Badge variant={config.SUPABASE_ANON_KEY ? 'default' : 'destructive'}>
                  {config.SUPABASE_ANON_KEY ? 'Set' : 'Missing'}
                </Badge>
              </div>
            </div>
          </div>
          
          <div>
            <h3 className="font-semibold mb-2">Evolution API Configuration</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>EVOLUTION_API_URL:</span>
                <Badge variant={config.EVOLUTION_API_URL ? 'default' : 'destructive'}>
                  {config.EVOLUTION_API_URL || 'Missing'}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span>EVOLUTION_API_KEY:</span>
                <Badge variant={config.EVOLUTION_API_KEY ? 'default' : 'destructive'}>
                  {config.EVOLUTION_API_KEY ? 'Set' : 'Missing'}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span>EVOLUTION_WEBHOOK_SECRET:</span>
                <Badge variant={config.EVOLUTION_WEBHOOK_SECRET ? 'default' : 'destructive'}>
                  {config.EVOLUTION_WEBHOOK_SECRET ? 'Set' : 'Missing'}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span>EVOLUTION_X_API_KEY:</span>
                <Badge variant={config.EVOLUTION_X_API_KEY ? 'default' : 'destructive'}>
                  {config.EVOLUTION_X_API_KEY ? 'Set' : 'Missing'}
                </Badge>
              </div>
            </div>
          </div>
          
          <div>
            <h3 className="font-semibold mb-2">App Configuration</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>APP_NAME:</span>
                <Badge variant="outline">{config.APP_NAME}</Badge>
              </div>
              <div className="flex justify-between">
                <span>ENVIRONMENT:</span>
                <Badge variant="outline">{config.ENVIRONMENT}</Badge>
              </div>
              <div className="flex justify-between">
                <span>DEBUG_LOGS:</span>
                <Badge variant={config.ENABLE_DEBUG_LOGS ? 'default' : 'secondary'}>
                  {config.ENABLE_DEBUG_LOGS ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>
            </div>
          </div>
          
          <div>
            <h3 className="font-semibold mb-2">Raw Environment Values</h3>
            <div className="space-y-1 text-sm">
              <div>VITE_EVOLUTION_API_URL: {import.meta.env.VITE_EVOLUTION_API_URL || 'undefined'}</div>
              <div>VITE_EVOLUTION_API_KEY: {import.meta.env.VITE_EVOLUTION_API_KEY ? '***' : 'undefined'}</div>
              <div>VITE_ENVIRONMENT: {import.meta.env.VITE_ENVIRONMENT || 'undefined'}</div>
              <div>DEV: {import.meta.env.DEV ? 'true' : 'false'}</div>
              <div>MODE: {import.meta.env.MODE}</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};