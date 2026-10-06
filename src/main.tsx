import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { initRewardful } from '@/lib/rewardful'

// Rastreamento de afiliados (Rewardful) — só carrega se a chave estiver setada.
initRewardful();

createRoot(document.getElementById("root")!).render(<App />);
