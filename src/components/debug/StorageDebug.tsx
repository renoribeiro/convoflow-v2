import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const StorageDebug = () => {
  const [storageData, setStorageData] = useState<any>(null);

  const checkStorage = () => {
    const localStorage = window.localStorage;
    const sessionStorage = window.sessionStorage;
    
    const localStorageData: any = {};
    const sessionStorageData: any = {};
    
    // Get all localStorage items
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        localStorageData[key] = localStorage.getItem(key);
      }
    }
    
    // Get all sessionStorage items
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key) {
        sessionStorageData[key] = sessionStorage.getItem(key);
      }
    }
    
    setStorageData({
      localStorage: localStorageData,
      sessionStorage: sessionStorageData
    });
  };

  useEffect(() => {
    checkStorage();
  }, []);

  const clearStorage = () => {
    if (confirm('Tem certeza que deseja limpar todo o storage? Isso fará logout.')) {
      localStorage.clear();
      sessionStorage.clear();
      window.location.reload();
    }
  };

  return (
    <Card className="mb-4 border-purple-200 bg-purple-50">
      <CardHeader>
        <CardTitle className="text-sm text-purple-800 flex items-center justify-between">
          Debug: Storage do Navegador
          <div className="space-x-2">
            <Button size="sm" onClick={checkStorage}>
              Atualizar
            </Button>
            <Button size="sm" variant="destructive" onClick={clearStorage}>
              Limpar Storage
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {storageData && (
          <>
            <div className="p-2 bg-white rounded border">
              <strong>localStorage:</strong>
              <pre className="text-xs mt-1 overflow-auto max-h-32">
                {JSON.stringify(storageData.localStorage, null, 2)}
              </pre>
            </div>
            
            <div className="p-2 bg-white rounded border">
              <strong>sessionStorage:</strong>
              <pre className="text-xs mt-1 overflow-auto max-h-32">
                {JSON.stringify(storageData.sessionStorage, null, 2)}
              </pre>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};