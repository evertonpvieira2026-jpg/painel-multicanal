import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  Link2,
  Unlink,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Bot,
  Lock,
  Server,
  Database,
  Radio,
  FileText,
  Sliders,
  Check,
  Info,
  Download
} from 'lucide-react';

interface ServerConnectionStatus {
  configured: boolean;
  connected: boolean;
  app_id: string;
  user_id?: string | number;
  connected_at?: string;
  expires_at?: string;
  is_expired?: boolean;
  status: 'active' | 'disconnected' | 'expired';
  storage_error?: string;
  storage_warning?: string;
  message?: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'conexoes' | 'visao-geral' | 'anuncios' | 'diagnostico'>('conexoes');
  const [loading, setLoading] = useState<boolean>(true);
  const [disconnecting, setDisconnecting] = useState<boolean>(false);
  const [status, setStatus] = useState<ServerConnectionStatus>({
    configured: false,
    connected: false,
    app_id: '',
    status: 'disconnected',
  });
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Consulta o estado real do servidor em /.netlify/functions/ml-status
  const fetchServerStatus = useCallback(async (isUserAction = false) => {
    if (isUserAction) setLoading(true);
    try {
      const response = await fetch('/.netlify/functions/ml-status', {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-store',
        },
      });

      if (!response.ok) {
        throw new Error(`Servidor respondeu com HTTP ${response.status}`);
      }

      const data: ServerConnectionStatus = await response.json();
      setStatus(data);

      if (isUserAction) {
        if (data.connected) {
          setFeedbackMessage({
            type: 'success',
            text: 'Conexão ativa e verificada no armazenamento durável do servidor!',
          });
        } else {
          setFeedbackMessage({
            type: 'info',
            text: 'Servidor consultado: Mercado Livre não está conectado no momento.',
          });
        }
      }
    } catch (err: any) {
      console.error('[Robô CEO] Erro ao consultar /.netlify/functions/ml-status:', err);
      setStatus(prev => ({
        ...prev,
        connected: false,
        status: 'disconnected',
      }));
      if (isUserAction) {
        setFeedbackMessage({
          type: 'error',
          text: 'Falha ao contatar a função ml-status no servidor. Verifique o deploy.',
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Ao montar, carrega o status real do servidor e checa se veio de retorno (?connected=1)
  useEffect(() => {
    fetchServerStatus();

    // Se a URL contém ?connected=1 (retorno do callback com sucesso)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('connected') === '1') {
      setFeedbackMessage({
        type: 'success',
        text: 'Autorização concluída! Os tokens foram persistidos no Netlify Blobs.',
      });
      // Limpa a query string da URL sem recarregar
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [fetchServerStatus]);

  // Função para desconectar com segurança no servidor
  const handleDisconnect = async () => {
    if (!window.confirm('Tem certeza de que deseja desconectar o Robô CEO do Mercado Livre? Os tokens persistidos no Netlify serão removidos.')) {
      return;
    }

    setDisconnecting(true);
    try {
      const res = await fetch('/.netlify/functions/ml-disconnect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) throw new Error('Erro ao desconectar no servidor.');

      await fetchServerStatus();
      setFeedbackMessage({
        type: 'info',
        text: 'Desconectado com sucesso. Os registros no servidor foram limpos.',
      });
    } catch (error: any) {
      setFeedbackMessage({
        type: 'error',
        text: error?.message || 'Falha ao processar desconexão.',
      });
    } finally {
      setDisconnecting(false);
    }
  };

  const handleConnectRedirect = () => {
    // Redireciona para o fluxo oficial PKCE do ml-auth-start
    window.location.href = '/.netlify/functions/ml-auth-start';
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col">
      {/* Top Header */}
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-300 flex items-center justify-center text-slate-950 font-black shadow-md shadow-amber-500/20">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold tracking-tight text-lg text-white">Robô CEO</span>
                <span className="bg-amber-400 text-slate-950 text-[10px] font-black px-1.5 py-0.5 rounded tracking-wider uppercase">
                  Mercado Livre
                </span>
              </div>
              <p className="text-xs text-slate-400">Painel de Operações &amp; Conexão OAuth 2.0 PKCE</p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* Indicador de Modo Seguro */}
            <div className="hidden sm:flex items-center space-x-1.5 px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs text-amber-300">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Modo Seguro: Não publica anúncios automaticamente</span>
            </div>

            {/* Botão Baixar ZIP */}
            <a
              href="/robo-ceo-mercadolivre.zip"
              download="robo-ceo-mercadolivre.zip"
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm transition-colors cursor-pointer"
              title="Baixar arquivo ZIP com o código completo corrigido"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Baixar ZIP</span>
            </a>

            {/* Status Geral */}
            <div className="flex items-center space-x-2 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700/60 text-xs">
              <span className={`w-2.5 h-2.5 rounded-full ${status.connected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
              <span className="font-medium text-slate-200">
                {loading ? 'Consultando...' : status.connected ? 'Conectado (Servidor)' : 'Desconectado'}
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-1 border-t border-slate-800/80">
          <button
            onClick={() => setActiveTab('conexoes')}
            className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors flex items-center space-x-2 ${
              activeTab === 'conexoes'
                ? 'border-amber-400 text-amber-300 bg-slate-800/40'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Link2 className="w-4 h-4" />
            <span>Conexões</span>
            {status.connected && (
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('visao-geral')}
            className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors flex items-center space-x-2 ${
              activeTab === 'visao-geral'
                ? 'border-amber-400 text-amber-300 bg-slate-800/40'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radio className="w-4 h-4" />
            <span>Visão Geral</span>
          </button>

          <button
            onClick={() => setActiveTab('anuncios')}
            className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors flex items-center space-x-2 ${
              activeTab === 'anuncios'
                ? 'border-amber-400 text-amber-300 bg-slate-800/40'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Publicações &amp; Anúncios</span>
          </button>

          <button
            onClick={() => setActiveTab('diagnostico')}
            className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors flex items-center space-x-2 ${
              activeTab === 'diagnostico'
                ? 'border-amber-400 text-amber-300 bg-slate-800/40'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Configurações &amp; Netlify</span>
          </button>
        </div>
      </header>

      {/* Feedback Banner */}
      {feedbackMessage && (
        <div className={`border-b text-sm py-2.5 px-4 flex items-center justify-between ${
          feedbackMessage.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
          feedbackMessage.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800' :
          'bg-sky-50 border-sky-200 text-sky-800'
        }`}>
          <div className="max-w-7xl mx-auto w-full flex items-center space-x-2">
            {feedbackMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" /> :
             feedbackMessage.type === 'error' ? <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" /> :
             <Info className="w-4 h-4 text-sky-600 flex-shrink-0" />}
            <span className="font-medium">{feedbackMessage.text}</span>
          </div>
          <button
            onClick={() => setFeedbackMessage(null)}
            className="text-xs font-bold uppercase tracking-wider opacity-60 hover:opacity-100"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'conexoes' && (
          <div className="space-y-6">
            {/* Header Conexões */}
            <div className="bg-white rounded-xl border border-slate-200/80 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-slate-900 flex items-center space-x-2">
                  <Link2 className="w-5 h-5 text-amber-500" />
                  <span>Conexão Oficial Mercado Livre</span>
                </h1>
                <p className="text-sm text-slate-500 mt-1">
                  Gerenciamento da integração OAuth 2.0 PKCE persistida no servidor com Netlify Blobs.
                </p>
              </div>

              <div className="flex items-center space-x-3">
                <button
                  onClick={() => fetchServerStatus(true)}
                  disabled={loading}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-300/80 transition-colors flex items-center space-x-2 disabled:opacity-50"
                  title="Consulta o estado real no servidor"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>Atualizar Status</span>
                </button>
              </div>
            </div>

            {/* Card Principal da Conexão */}
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    status.connected ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {status.connected ? <CheckCircle2 className="w-6 h-6" /> : <Link2 className="w-6 h-6" />}
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Mercado Livre Brasil</h2>
                    <p className="text-xs text-slate-500">API de Vendas e Anúncios (auth.mercadolivre.com.br)</p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
                    status.connected
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : 'bg-slate-100 text-slate-700 border border-slate-200'
                  }`}>
                    <span className={`w-2 h-2 rounded-full mr-1.5 ${status.connected ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                    {status.connected ? 'Conectado no Servidor' : 'Desconectado'}
                  </span>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Form Fields: App ID e Detalhes da Conta */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Campo App ID */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center justify-between">
                      <span>App ID (Client ID Mercado Livre)</span>
                      <span className="text-[11px] text-slate-400 font-normal">Sincronizado do Servidor</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        readOnly
                        value={status.app_id || (status.configured ? '(Carregado via ML_CLIENT_ID)' : 'Não configurado')}
                        placeholder="Ex: 8472918471928374"
                        className="w-full bg-slate-50 text-slate-800 font-mono text-sm px-3.5 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-400 cursor-default"
                      />
                      <div className="absolute right-3 top-3 text-slate-400">
                        <Lock className="w-4 h-4" />
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Este ID é recuperado diretamente de <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700">process.env.ML_CLIENT_ID</code> do servidor, sem depender do cache do navegador.
                    </p>
                  </div>

                  {/* ID do Vendedor / Status da Sessão */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center justify-between">
                      <span>ID do Vendedor (User ID)</span>
                      <span className="text-[11px] text-slate-400 font-normal">Conta Autorizada</span>
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={status.user_id ? String(status.user_id) : 'Nenhuma conta conectada'}
                      className="w-full bg-slate-50 text-slate-800 font-mono text-sm px-3.5 py-2.5 rounded-lg border border-slate-300 focus:outline-none cursor-default"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      {status.connected
                        ? `Conexão persistida no Netlify Blobs em ${status.connected_at ? new Date(status.connected_at).toLocaleString('pt-BR') : 'data recente'}.`
                        : 'Conecte sua conta para gerar os tokens de acesso protegidos no servidor.'}
                    </p>
                  </div>
                </div>

                {/* Status Detalhado da Conexão */}
                {status.connected && (
                  <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-start space-x-3">
                      <ShieldCheck className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <h4 className="text-sm font-bold text-emerald-900">Persistência Durável Ativa (Netlify Blobs)</h4>
                        <p className="text-xs text-emerald-700 mt-0.5">
                          Os tokens de autenticação estão guardados de forma segura no Netlify Blobs. Ao recarregar ou fechar a página, sua conexão é mantida automaticamente.
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={handleDisconnect}
                      disabled={disconnecting}
                      className="px-4 py-2 bg-white text-rose-700 border border-rose-300 hover:bg-rose-50 rounded-lg text-xs font-bold transition-colors flex items-center space-x-1.5 shadow-sm disabled:opacity-50"
                    >
                      <Unlink className="w-3.5 h-3.5" />
                      <span>{disconnecting ? 'Desconectando...' : 'Desconectar Conta'}</span>
                    </button>
                  </div>
                )}

                {/* Se desconectado: Botão de Ação para Conectar */}
                {!status.connected && (
                  <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-amber-950 flex items-center space-x-1.5">
                        <AlertCircle className="w-4 h-4 text-amber-600" />
                        <span>Pronto para Conectar via OAuth 2.0 PKCE</span>
                      </h4>
                      <p className="text-xs text-amber-800 leading-relaxed max-w-2xl">
                        Clique no botão abaixo para ser redirecionado ao portal seguro do Mercado Livre. O verificador criptográfico PKCE será gerado e persistido pelo servidor.
                      </p>
                    </div>

                    <button
                      onClick={handleConnectRedirect}
                      className="w-full sm:w-auto px-6 py-3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm rounded-lg shadow-sm shadow-amber-500/20 transition-all flex items-center justify-center space-x-2 flex-shrink-0"
                    >
                      <Link2 className="w-4 h-4" />
                      <span>Conectar Mercado Livre</span>
                    </button>
                  </div>
                )}

                {/* Política de Segurança Sem Tokens no Navegador */}
                <div className="border-t border-slate-100 pt-5">
                  <div className="flex items-start space-x-3 text-xs text-slate-500">
                    <Lock className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="font-semibold text-slate-700">Segurança Robô CEO: </span>
                      Nenhum <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-600">access_token</code>, <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-600">refresh_token</code> ou segredo de API é gravado no <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-600">localStorage</code> do navegador. Toda autenticação com o Mercado Livre permanece enclausurada nas Netlify Functions e no Netlify Blobs.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Grid Informativo dos Componentes de Servidor */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm space-y-2">
                <div className="flex items-center space-x-2 text-slate-900 font-bold text-sm">
                  <Server className="w-4 h-4 text-blue-600" />
                  <span>Função: ml-auth-start</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Inicia o fluxo gerando o <code className="text-slate-700">code_verifier</code> (RFC 7636) e o armazena em cookie seguro temporário até a volta do usuário.
                </p>
                <div className="text-[11px] font-mono text-emerald-700 bg-emerald-50 px-2 py-1 rounded inline-block">
                  PKCE Ativo (S256)
                </div>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm space-y-2">
                <div className="flex items-center space-x-2 text-slate-900 font-bold text-sm">
                  <Database className="w-4 h-4 text-purple-600" />
                  <span>Função: ml-callback</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Troca o código pelo token na API do Mercado Livre e persiste os dados com consistência forte no Netlify Blobs sob a chave do seller.
                </p>
                <div className="text-[11px] font-mono text-emerald-700 bg-emerald-50 px-2 py-1 rounded inline-block">
                  Armazenamento Durável
                </div>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm space-y-2">
                <div className="flex items-center space-x-2 text-slate-900 font-bold text-sm">
                  <RefreshCw className="w-4 h-4 text-amber-600" />
                  <span>Função: ml-status</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Endpoint consultado por este painel para verificar se a conexão está ativa e manter o campo App ID preenchido permanentemente.
                </p>
                <div className="text-[11px] font-mono text-emerald-700 bg-emerald-50 px-2 py-1 rounded inline-block">
                  Status em Tempo Real
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'visao-geral' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200/80 p-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">Visão Geral — Robô CEO</h2>
              <p className="text-sm text-slate-500 mt-1">Status operacional do robô e integridade das rotinas.</p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-xs font-semibold text-slate-500 uppercase">Conexão API</span>
                  <div className="text-lg font-bold text-slate-900 mt-1 flex items-center space-x-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${status.connected ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                    <span>{status.connected ? 'Ativa' : 'Pendente'}</span>
                  </div>
                  <span className="text-xs text-slate-400 mt-1 block">Mercado Livre OAuth 2.0</span>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-xs font-semibold text-slate-500 uppercase">Publicação Automática</span>
                  <div className="text-lg font-bold text-amber-700 mt-1 flex items-center space-x-1.5">
                    <ShieldAlert className="w-4 h-4 text-amber-600" />
                    <span>Desativada</span>
                  </div>
                  <span className="text-xs text-slate-400 mt-1 block">Diretriz de segurança ativa</span>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-xs font-semibold text-slate-500 uppercase">Armazenamento</span>
                  <div className="text-lg font-bold text-blue-700 mt-1">Netlify Blobs</div>
                  <span className="text-xs text-slate-400 mt-1 block">Persistência segura em nuvem</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'anuncios' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200/80 p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Gerenciador de Publicações</h2>
                  <p className="text-sm text-slate-500 mt-1">Fila de anúncios do Robô CEO.</p>
                </div>

                <div className="px-3 py-1 bg-amber-50 border border-amber-300 text-amber-800 rounded-lg text-xs font-bold flex items-center space-x-1.5">
                  <ShieldCheck className="w-4 h-4 text-amber-600" />
                  <span>Nenhum anúncio é publicado automaticamente</span>
                </div>
              </div>

              <div className="mt-8 border border-dashed border-slate-200 rounded-xl p-8 text-center bg-slate-50">
                <Bot className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                <h3 className="text-sm font-bold text-slate-800">Modo de Proteção Ativo</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                  O Robô CEO está configurado para operar somente sob autorização explícita. Não há disparos autônomos ou publicações não solicitadas na sua conta do Mercado Livre.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'diagnostico' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200/80 p-6 shadow-sm space-y-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Checklist de Configuração no Netlify</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Confirme as configurações abaixo no painel da sua conta Netlify para garantir a persistência contínua.
                </p>
              </div>

              <div className="space-y-4">
                <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 flex items-start space-x-3">
                  <Check className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-slate-900">1. Variáveis de Ambiente no Netlify</h4>
                    <p className="text-xs text-slate-600">
                      Vá em <strong>Site Configuration &gt; Environment Variables</strong> e confirme:
                    </p>
                    <ul className="text-xs font-mono text-slate-700 space-y-1 mt-2 bg-white p-3 rounded border border-slate-200">
                      <li>• ML_CLIENT_ID: (Seu App ID numérico do Mercado Livre, sem aspas)</li>
                      <li>• ML_CLIENT_SECRET: (Seu segredo de chave de aplicação, sem aspas)</li>
                      <li>• ML_REDIRECT_URI: https://seu-site.netlify.app/.netlify/functions/ml-callback</li>
                    </ul>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 flex items-start space-x-3">
                  <Check className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-slate-900">2. Recurso Netlify Blobs Habilitado</h4>
                    <p className="text-xs text-slate-600">
                      O Netlify Blobs é o armazenamento chave-valor durável onde os tokens são salvos. Em projetos Netlify modernos, o Blobs é ativado automaticamente pelas funções ao importar <code className="bg-white px-1 py-0.5 rounded font-mono text-slate-800">@netlify/blobs</code>.
                    </p>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 flex items-start space-x-3">
                  <Check className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-slate-900">3. URLs no Painel de Desenvolvedores do Mercado Livre</h4>
                    <p className="text-xs text-slate-600">
                      Em developers.mercadolivre.com.br, na sua aplicação, certifique-se de que a <strong>Redirect URI</strong> cadastrada corresponda exatamente à sua URL de callback HTTPS do Netlify:
                    </p>
                    <code className="text-xs font-mono text-blue-700 bg-blue-50 px-2 py-1 rounded block mt-1">
                      https://seu-site.netlify.app/.netlify/functions/ml-callback
                    </code>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4">
          Robô CEO — Painel de Gestão Mercado Livre | Persistência Segura com Netlify Functions &amp; Blobs
        </div>
      </footer>
    </div>
  );
}
