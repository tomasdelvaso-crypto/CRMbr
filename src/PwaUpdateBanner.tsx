import React, { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X } from 'lucide-react';

// Aviso de versão nova do CRM (PWA em modo "prompt").
// Nunca recarrega sozinho: o vendedor pode estar no meio de um formulário.
// O navegador já verifica ao abrir o app; para quem deixa o app aberto dias
// no celular, pedimos a verificação no máximo uma vez por dia.
const CHAVE_ULTIMA_VERIFICACAO = 'pwa:ultimaVerificacao';
const UM_DIA = 24 * 60 * 60 * 1000;

const PwaUpdateBanner: React.FC = () => {
  const [dispensado, setDispensado] = useState(false);
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const verificar = () => {
        let ultima = 0;
        try { ultima = Number(localStorage.getItem(CHAVE_ULTIMA_VERIFICACAO)) || 0; } catch { /* sem storage */ }
        if (Date.now() - ultima < UM_DIA || navigator.onLine === false) return;
        try { localStorage.setItem(CHAVE_ULTIMA_VERIFICACAO, String(Date.now())); } catch { /* sem storage */ }
        registration.update().catch(() => { /* sem rede: tenta amanhã */ });
      };
      verificar();
      // Ao voltar para o app e, com ele aberto, olhando o relógio a cada hora
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') verificar(); });
      setInterval(verificar, 60 * 60 * 1000);
    },
  });

  if (!needRefresh || dispensado) return null;

  return (
    <div className="fixed top-3 inset-x-0 z-[80] flex justify-center px-4 pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-3 bg-gray-900 text-white rounded-xl shadow-2xl pl-4 pr-2 py-2 max-w-md w-full sm:w-auto">
        <span className="text-sm flex-1">Nova versão do CRM disponível</span>
        <button
          onClick={() => updateServiceWorker(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-semibold"
        >
          <RefreshCw className="w-4 h-4" /> Atualizar
        </button>
        <button onClick={() => setDispensado(true)} className="p-1.5 text-gray-400 hover:text-white rounded-lg" title="Depois">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default PwaUpdateBanner;
