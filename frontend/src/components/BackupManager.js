import React, { useCallback, useEffect, useRef, useState } from 'react';
import api from '../lib/api';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { toast } from 'sonner';
import {
  DatabaseBackup, Download, LoaderCircle, ShieldAlert, CheckSquare, Square, CircleCheck, ChevronDown, ChevronUp,
} from 'lucide-react';
import { errorMessage } from '../lib/stockSizes';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';

const fmtSize = (bytes) => {
  if (bytes == null) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
};
const fmtDateTime = (iso) => {
  try { return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso || ''; }
};
const daysSince = (iso) => { try { return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000); } catch { return null; } };

const Option = ({ checked, onChange, label, hint }) => (
  <button type="button" onClick={onChange}
          className={`w-full flex items-start gap-2 rounded-lg border p-3 text-left transition ${checked ? 'border-primary bg-primary/5' : 'hover:border-primary/50'}`}>
    {checked ? <CheckSquare className="w-5 h-5 text-primary shrink-0" /> : <Square className="w-5 h-5 text-muted-foreground shrink-0" />}
    <span className="text-sm"><b>{label}</b><span className="block text-xs text-muted-foreground">{hint}</span></span>
  </button>
);

/** Backup geral (banco de dados + código do site) para baixar. Somente Laboratório. */
export const BackupManager = () => {
  const [status, setStatus] = useState(null);
  const [database, setDatabase] = useState(true);
  const [code, setCode] = useState(true);
  const [starting, setStarting] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    try { const r = await api.get('/backup/status'); setStatus(r.data); return r.data; }
    catch (e) { setStatus((s) => s || { error: errorMessage(e, 'Não foi possível consultar o backup') }); return null; }
  }, []);

  useEffect(() => { load(); return () => clearTimeout(timer.current); }, [load]);

  const running = status?.job?.status === 'running';
  useEffect(() => {
    if (!running) return undefined;
    timer.current = setTimeout(load, 1500);
    return () => clearTimeout(timer.current);
  }, [running, status, load]);

  const start = async () => {
    if (!database && !code) return toast.error('Escolha pelo menos uma parte para guardar');
    setStarting(true);
    try {
      await api.post('/backup/start', { database, code });
      await load();
    } catch (e) { toast.error(errorMessage(e, 'Não foi possível iniciar o backup')); }
    finally { setStarting(false); }
  };

  const download = async () => {
    try {
      const r = await api.post(`/backup/${status.job.id}/download-link`);
      const link = document.createElement('a');
      link.href = `${BACKEND_URL}${r.data.url}`;
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Baixando o backup. Guarde o arquivo em um lugar seguro.');
    } catch (e) { toast.error(errorMessage(e, 'Não foi possível baixar. Faça um novo backup')); }
  };

  const job = status?.job;
  const last = status?.last;
  const age = last ? daysSince(last.finished_at) : null;
  const p = job?.progress || {};
  const pct = p.collections_total ? Math.round(((p.collections_done || 0) / p.collections_total) * 100) : null;

  return (
    <Card className="p-6 space-y-4" data-testid="backup-card">
      <div className="flex items-center gap-3">
        <DatabaseBackup className="w-6 h-6" />
        <div>
          <h3 className="font-bold">Backup geral</h3>
          <p className="text-sm text-muted-foreground">Guarda o sistema inteiro em um arquivo: banco de dados (com laudos e arquivos) e código do site</p>
        </div>
      </div>

      <div className={`rounded-lg p-3 text-sm ${!last ? 'bg-amber-500/10 text-amber-600' : age >= 7 ? 'bg-amber-500/10 text-amber-600' : 'bg-muted'}`} data-testid="backup-last">
        {!status ? 'Carregando...' : last
          ? <>Último backup: <b>{fmtDateTime(last.finished_at)}</b> por {last.by} · {fmtSize(last.size_bytes)}{age >= 7 && ` · faz ${age} dias, faça um novo`}</>
          : <>Nenhum backup foi feito ainda. Faça o primeiro agora.</>}
      </div>

      {status?.error && <p className="text-sm text-red-600">{status.error}</p>}

      <div className="grid sm:grid-cols-2 gap-2">
        <Option checked={database} onChange={() => setDatabase(!database)} label="Banco de dados" hint="Produtos, lotes, estoque, pedidos, usuários, laudos e todos os arquivos" />
        <Option checked={code} onChange={() => setCode(!code)} label="Código do site" hint="O programa (backend e frontend), sem senhas nem arquivos temporários" />
      </div>

      <Button className="w-full h-12 bg-primary hover:bg-primary/90" disabled={running || starting || !status || Boolean(status.error)} onClick={start} data-testid="backup-start">
        {running ? <><LoaderCircle className="w-5 h-5 mr-2 animate-spin" /> Fazendo o backup...</> : <><DatabaseBackup className="w-5 h-5 mr-2" /> Fazer backup agora</>}
      </Button>

      {running && (
        <div className="space-y-2" data-testid="backup-progress">
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className={`h-full bg-primary transition-all ${pct == null ? 'w-1/3 animate-pulse' : ''}`} style={pct == null ? undefined : { width: `${Math.max(pct, 4)}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">
            {p.step}{p.detail ? ` — ${p.detail}` : ''}{p.documents ? ` · ${p.documents.toLocaleString('pt-BR')} registros` : ''}{p.code_files ? ` · ${p.code_files} arquivos de código` : ''}
          </p>
        </div>
      )}

      {job?.status === 'error' && <p className="text-sm text-red-600" data-testid="backup-error">O backup falhou: {job.error}</p>}

      {job?.status === 'done' && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 space-y-3" data-testid="backup-done">
          <p className="flex items-center gap-2 font-semibold text-emerald-600"><CircleCheck className="w-5 h-5" /> Backup pronto · {fmtSize(job.size_bytes)}</p>
          <Button className="w-full h-12" onClick={download} data-testid="backup-download"><Download className="w-5 h-5 mr-2" /> Baixar backup</Button>
          <p className="text-xs text-muted-foreground">O arquivo fica no servidor só por algumas horas. Baixe agora e guarde em um lugar seguro (HD externo ou seu Google Drive pessoal).</p>
        </div>
      )}

      <div className="flex gap-2 rounded-lg border border-amber-500/40 p-3 text-xs">
        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
        <p>
          O arquivo tem dados da empresa e as senhas (criptografadas) dos usuários. <b>Guarde em lugar privado e nunca publique nem envie para o GitHub.</b>{' '}
          As variáveis de ambiente (arquivo <code>.env</code>) <b>não entram</b> no backup por segurança: guarde-as separadamente.
        </p>
      </div>

      <button type="button" className="flex items-center gap-1 text-sm text-primary font-semibold" onClick={() => setShowHow(!showHow)}>
        Como restaurar {showHow ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {showHow && (
        <div className="text-xs text-muted-foreground space-y-2" data-testid="backup-how">
          <p>Dentro do arquivo existe o <b>LEIA-ME-RESTAURAR.txt</b> com o passo a passo. Em resumo:</p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Descompacte o arquivo. A pasta <b>code/</b> é o programa; recrie o <code>.env</code> (os nomes das variáveis estão no <b>manifest.json</b>).</li>
            <li>Para o banco: <code>python code/backend/restore_backup.py backup.zip --mongo-url "..." --db-name lumix_teste</code> (só simula, não grava nada).</li>
            <li>Acrescente <code>--apply</code> para restaurar de verdade. Prefira testar num banco novo antes de trocar o do sistema.</li>
          </ol>
          <p>Na hora de restaurar, peça ajuda a quem cuida do servidor.</p>
        </div>
      )}
    </Card>
  );
};
