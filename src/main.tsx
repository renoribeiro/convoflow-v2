import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { initRewardful } from '@/lib/rewardful'
import { ligarAtualizacaoAutomatica } from '@/lib/pwa/atualizacao'

// Rastreamento de afiliados (Rewardful) — só carrega se a chave estiver setada.
initRewardful();

// Cache offline com versão nova a cada volta para a tela (ver atualizacao.ts).
ligarAtualizacaoAutomatica();

createRoot(document.getElementById("root")!).render(<App />);
