import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from './ui/alert-dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Combobox } from './ui/combobox';
import { toast } from 'sonner';
import {
  FileUp, Link2, History, Search, Check, Ban, AlertTriangle, ShieldAlert, Undo2, CheckSquare, Square, Lock,
} from 'lucide-react';
import { sizesForKind, errorMessage } from '../lib/stockSizes';

const fmtDate = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
const periodLabel = (p) => (!p ? 'sem período' : p.start === p.end ? fmtDate(p.start) : `${fmtDate(p.start)} a ${fmtDate(p.end)}`);
const fmtDateTime = (iso) => {
  try { return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso || ''; }
};
const num = (n) => Number(n).toLocaleString('pt-BR');

const complete = (v) => Boolean(v) && (v.action === 'ignore' || (v.action === 'map' && v.product_id && v.size));
const current = (row) => (row.status === 'mapped' ? { action: 'map', product_id: row.product_id, size: row.size }
  : row.status === 'ignored' ? { action: 'ignore' } : null);
const same = (a, b) => Boolean(a) && Boolean(b) && a.action === b.action && (a.action === 'ignore' || (a.product_id === b.product_id && a.size === b.size));

// ---------- uma linha do relatório: ligar a um produto + tamanho, ou ignorar ----------
const CodeRow = ({ row, value, products, onChange }) => {
  const product = products.find((p) => p.product_id === value?.product_id);
  const sizes = sizesForKind(product?.kind || 'L');
  const ignored = value?.action === 'ignore';
  const sug = row.suggestion;
  const sugProduct = sug && products.find((p) => p.product_id === sug.product_id);
  const useSuggestion = () => onChange({ action: 'map', product_id: sug.product_id, size: sug.size || '' });

  return (
    <div className={`rounded-lg border p-2.5 space-y-2 ${row.status === 'unmapped' && !complete(value) ? 'border-amber-300' : ''}`}
         data-testid={`code-row-${row.code}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-sm leading-tight">{row.name}</p>
          <p className="text-[11px] text-muted-foreground">Código {row.code.replace(/^0+/, '')} · vendeu {num(row.quantity)}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
          row.status === 'mapped' ? 'bg-emerald-500/15 text-emerald-600' : row.status === 'ignored' ? 'bg-muted text-muted-foreground' : 'bg-amber-500/15 text-amber-600'}`}>
          {row.status === 'mapped' ? 'Ligado' : row.status === 'ignored' ? 'Ignorado' : row.stale ? 'Produto apagado' : 'Sem produto'}
        </span>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
        <div className={`min-w-0 ${ignored ? 'opacity-40 pointer-events-none' : ''}`}>
          <Combobox options={products.map((p) => ({ value: p.product_id, label: p.name }))} value={ignored ? '' : (value?.product_id || '')}
                    onChange={(id) => onChange({ action: 'map', product_id: id, size: '' })}
                    placeholder="Produto do Lumix" searchPlaceholder="Nome do produto..." emptyText="Nenhum produto" />
        </div>
        <select aria-label="Tamanho" disabled={ignored || !product} value={ignored ? '' : (value?.size || '')}
                onChange={(e) => onChange({ ...value, action: 'map', size: e.target.value })}
                className="h-10 rounded-md border bg-background px-2 text-sm disabled:opacity-40">
          <option value="">Tamanho</option>
          {sizes.map((s) => <option key={s.size} value={s.size}>{s.label}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant={ignored ? 'default' : 'outline'} onClick={() => onChange(ignored ? null : { action: 'ignore' })}>
          <Ban className="w-3.5 h-3.5 mr-1" /> {ignored ? 'Ignorado (não é nosso)' : 'Ignorar'}
        </Button>
        {sug && sugProduct && !complete(value) && (
          <Button type="button" size="sm" variant="outline" onClick={useSuggestion} className="border-primary text-primary">
            Sugestão: {sugProduct.name}{sug.size ? ` ${sizes.find((s) => s.size === sug.size)?.label || ''}` : ''}
          </Button>
        )}
        {value?.suggested && complete(value) && <span className="text-[11px] text-primary">sugerido pelo nome</span>}
      </div>
    </div>
  );
};

/**
 * Saída do Depósito pelo relatório de vendas do GigaMob (PDF). Somente Laboratório.
 * O PDF é lido no servidor e descartado: nada de preço é guardado.
 */
export const SalesImportDialog = ({ open, onOpenChange, products, onDone }) => {
  const [view, setView] = useState('start'); // start | review | done | history
  const [intent, setIntent] = useState('sale');
  const [uploading, setUploading] = useState(false);
  const [state, setState] = useState(null);
  const [draft, setDraft] = useState({});
  const [filter, setFilter] = useState('pending');
  const [search, setSearch] = useState('');
  const [allowOverlap, setAllowOverlap] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [askConfirm, setAskConfirm] = useState(false);
  const [history, setHistory] = useState([]);
  const [undoTarget, setUndoTarget] = useState(null);
  const inputRef = useRef(null);
  const stateRef = useRef(null);
  stateRef.current = state;

  const options = useMemo(() => [...products].sort((a, b) => a.name.localeCompare(b.name)), [products]);

  const reset = useCallback(() => {
    setView('start'); setState(null); setDraft({}); setFilter('pending'); setSearch('');
    setAllowOverlap(false); setUploading(false); setConfirming(false); setAskConfirm(false);
  }, []);

  useEffect(() => { if (open) reset(); }, [open, reset]);

  const discardPending = useCallback(() => {
    const s = stateRef.current;
    if (s && s.status === 'pendente') api.delete(`/finished-stock/sales/imports/${s.id}`).catch(() => {});
  }, []);

  const close = (o) => { if (!o) { discardPending(); } onOpenChange(o); };

  const initDraft = (st, keep = {}) => {
    const d = {};
    st.lines.forEach((r) => {
      if (keep[r.code] && r.status === 'unmapped') { d[r.code] = keep[r.code]; return; }
      const cur = current(r);
      if (cur) d[r.code] = cur;
      else if (r.suggestion?.exact) d[r.code] = { action: 'map', product_id: r.suggestion.product_id, size: r.suggestion.size, suggested: true };
    });
    setDraft(d);
  };

  const pick = (kind) => { setIntent(kind); inputRef.current?.click(); };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await api.post('/finished-stock/sales/parse', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setState(r.data); initDraft(r.data); setView('review');
      setFilter(r.data.summary.unmapped > 0 ? 'pending' : 'all');
    } catch (err) { toast.error(errorMessage(err, 'Não foi possível ler o PDF')); }
    finally { setUploading(false); }
  };

  const rows = state?.lines || [];
  const setRowDraft = (code, value) => setDraft((d) => {
    const next = { ...d };
    if (value) next[code] = value; else delete next[code];
    return next;
  });

  const savable = rows.filter((r) => complete(draft[r.code]) && (r.status === 'unmapped' || !same(draft[r.code], current(r))));
  const noSuggestion = rows.filter((r) => r.status === 'unmapped' && !draft[r.code] && !r.suggestion);
  const counts = {
    pending: rows.filter((r) => r.status === 'unmapped').length,
    mapped: rows.filter((r) => r.status === 'mapped').length,
    ignored: rows.filter((r) => r.status === 'ignored').length,
  };

  const visible = rows.filter((r) => {
    if (filter === 'pending' && r.status !== 'unmapped') return false;
    if (filter === 'mapped' && r.status !== 'mapped') return false;
    if (filter === 'ignored' && r.status !== 'ignored') return false;
    const q = search.trim().toLowerCase();
    return !q || r.name.toLowerCase().includes(q) || r.code.includes(q);
  });

  const refresh = async (keep) => {
    const r = await api.get(`/finished-stock/sales/imports/${state.id}`);
    setState(r.data); initDraft(r.data, keep);
    return r.data;
  };

  const saveLinks = async () => {
    if (!savable.length) return;
    setSaving(true);
    try {
      await api.put('/finished-stock/sales/codes', {
        items: savable.map((r) => ({ code: r.code, action: draft[r.code].action, product_id: draft[r.code].product_id, size: draft[r.code].size, name: r.name })),
      });
      toast.success(`${savable.length} código(s) ligados`);
      const kept = {};
      Object.entries(draft).forEach(([code, v]) => { if (!complete(v)) kept[code] = v; });
      await refresh(kept);
    } catch (err) { toast.error(errorMessage(err, 'Erro ao salvar as ligações')); }
    finally { setSaving(false); }
  };

  const ignoreRest = () => setDraft((d) => {
    const next = { ...d };
    noSuggestion.forEach((r) => { next[r.code] = { action: 'ignore' }; });
    return next;
  });

  const finishRegister = () => { discardPending(); setState(null); onOpenChange(false); toast.success('Códigos cadastrados'); };

  const confirmSale = async () => {
    setAskConfirm(false); setConfirming(true);
    try {
      const r = await api.post(`/finished-stock/sales/imports/${state.id}/confirm`, { allow_overlap: allowOverlap });
      setState(r.data); setView('done'); onDone?.();
    } catch (err) { toast.error(errorMessage(err, 'Não foi possível baixar')); }
    finally { setConfirming(false); }
  };

  const loadHistory = async () => {
    try { setHistory((await api.get('/finished-stock/sales/imports')).data); }
    catch (err) { toast.error(errorMessage(err, 'Erro ao carregar o histórico')); }
  };
  const openHistory = () => { discardPending(); setState(null); setView('history'); loadHistory(); };

  const undo = async () => {
    const t = undoTarget; setUndoTarget(null);
    try {
      await api.post(`/finished-stock/sales/imports/${t.id}/cancel`);
      toast.success('Baixa desfeita: as unidades voltaram para o Depósito');
      loadHistory(); onDone?.();
    } catch (err) { toast.error(errorMessage(err, 'Não foi possível desfazer')); }
  };

  const blockMessages = {
    unmapped: 'Ligue ou ignore todos os códigos pendentes.',
    fractional: 'Há quantidade fracionada num produto ligado. Confira o PDF.',
    incomplete: 'O PDF não foi lido por completo. Gere o relatório de novo.',
    duplicate: 'Este relatório já foi baixado.',
  };
  const isSale = intent === 'sale';
  const unsaved = savable.length > 0;
  const canConfirm = state && state.status === 'pendente' && state.blocking.length === 0 && !unsaved
    && (state.overlaps.length === 0 || allowOverlap) && !confirming;
  const shortage = state?.summary?.shortage_units || 0;

  return (
    <>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="bg-card border-border max-w-2xl max-h-[94vh] overflow-y-auto [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileUp className="w-5 h-5" /> {view === 'history' ? 'Histórico de baixas' : isSale || view === 'start' ? 'Saída do Depósito — relatório de vendas' : 'Cadastrar códigos do GigaMob'}
            </DialogTitle>
          </DialogHeader>

          <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={onFile} data-testid="sales-file" />

          {view === 'start' && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-lg bg-muted p-3 text-sm">
                <Lock className="w-4 h-4 mt-0.5 shrink-0" />
                <p>O relatório é <b>confidencial</b>. O Lumix lê o PDF e o descarta: <b>o arquivo e os valores em R$ não ficam guardados</b>. Só ficam o código, o nome e a quantidade vendida.</p>
              </div>
              <Button className="w-full h-14 bg-primary hover:bg-primary/90 text-base" disabled={uploading} onClick={() => pick('sale')} data-testid="pick-sale">
                <FileUp className="w-5 h-5 mr-2" /> {uploading && isSale ? 'Lendo o PDF...' : 'Anexar relatório e baixar vendas'}
              </Button>
              <Button variant="outline" className="w-full h-12" disabled={uploading} onClick={() => pick('register')} data-testid="pick-register">
                <Link2 className="w-5 h-5 mr-2" /> {uploading && !isSale ? 'Lendo o PDF...' : 'Só cadastrar os códigos (não baixa nada)'}
              </Button>
              <p className="text-xs text-muted-foreground">
                Use "só cadastrar" com um relatório grande (ex.: do mês) para ligar todos os produtos de uma vez. Depois, no dia a dia, só aparecem os códigos novos.
              </p>
              <Button variant="ghost" className="w-full" onClick={openHistory}><History className="w-4 h-4 mr-2" /> Ver histórico de baixas</Button>
            </div>
          )}

          {view === 'review' && state && (
            <div className="space-y-4">
              <div className="rounded-lg border p-3 text-sm space-y-1">
                <p><b>Relatório de {periodLabel(state.period)}</b>{state.company ? ` · ${state.company}` : ''}</p>
                <p className="text-muted-foreground">
                  {state.summary.lines} produtos · <b className="text-emerald-600">{state.summary.mapped} ligados</b> · {state.summary.ignored} ignorados ·{' '}
                  <b className={state.summary.unmapped ? 'text-amber-600' : ''}>{state.summary.unmapped} sem produto</b>
                </p>
              </div>

              {state.warnings.map((w) => (
                <p key={w} className="flex gap-2 text-sm rounded-md bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200 p-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {w}</p>
              ))}
              {state.duplicate && (
                <p className="flex gap-2 text-sm rounded-md bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-200 p-2" data-testid="dup-alert">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" /> Este relatório já foi baixado em {fmtDateTime(state.duplicate.confirmed_at)}. Não dá para baixar de novo.
                </p>
              )}

              <div className="flex gap-2 overflow-x-auto pb-1">
                {[['pending', `Pendentes (${counts.pending})`], ['mapped', `Ligados (${counts.mapped})`], ['ignored', `Ignorados (${counts.ignored})`], ['all', 'Todos']].map(([k, label]) => (
                  <button key={k} type="button" onClick={() => setFilter(k)}
                          className={`px-3 h-9 rounded-full border-2 text-sm font-semibold whitespace-nowrap transition ${filter === k ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary/50'}`}>{label}</button>
                ))}
              </div>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filtrar por nome ou código" className="pl-9" />
              </div>

              {counts.pending > 0 && (
                <p className="text-xs text-muted-foreground">
                  Códigos que o Lumix ainda não conhece. Ligue cada um ao produto e tamanho, ou toque em <b>Ignorar</b> se não é produção da Lumix (vassoura, rodo, pano...).
                  O que o nome acertou com certeza já vem preenchido: confira.
                </p>
              )}

              <div className="space-y-2 max-h-[42vh] overflow-y-auto pr-1" data-testid="code-list">
                {visible.map((r) => (
                  <CodeRow key={r.code} row={r} products={options} value={draft[r.code]} onChange={(v) => setRowDraft(r.code, v)} />
                ))}
                {visible.length === 0 && <p className="text-sm text-muted-foreground p-2">Nada aqui.</p>}
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                {noSuggestion.length > 0 && (
                  <Button type="button" variant="outline" className="flex-1" onClick={ignoreRest} data-testid="ignore-rest">
                    <Ban className="w-4 h-4 mr-1" /> Ignorar os {noSuggestion.length} sem sugestão
                  </Button>
                )}
                <Button type="button" className="flex-1 bg-primary hover:bg-primary/90" disabled={!savable.length || saving} onClick={saveLinks} data-testid="save-links">
                  <Check className="w-4 h-4 mr-1" /> Salvar ligações ({savable.length})
                </Button>
              </div>

              {!isSale && (
                <Button type="button" variant="outline" className="w-full h-12" onClick={finishRegister} disabled={unsaved}>
                  {unsaved ? 'Salve as ligações antes de concluir' : counts.pending ? `Concluir (ainda faltam ${counts.pending})` : 'Concluir — tudo ligado'}
                </Button>
              )}

              {isSale && (
                <div className="space-y-3 border-t pt-3">
                  <p className="font-semibold text-sm">O que vai sair do Depósito</p>
                  {state.plan.length === 0 && <p className="text-sm text-muted-foreground">Nenhum produto ligado neste relatório tem venda a baixar.</p>}
                  <div className="divide-y rounded-lg border text-sm" data-testid="plan">
                    {state.plan.map((i) => (
                      <div key={`${i.product_id}-${i.size}`} className="flex items-center justify-between gap-2 p-2">
                        <span className="min-w-0 truncate">{i.name} <b>{i.label}</b></span>
                        <span className="shrink-0 text-right">
                          <b>{num(i.deduct)}</b> <span className="text-muted-foreground">de {num(i.requested)} vendidas</span>
                          {i.shortage > 0 && <span className="block text-[11px] text-red-600 font-semibold">falta {num(i.shortage)} no Depósito</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                  {shortage > 0 && (
                    <p className="flex gap-2 text-sm rounded-md bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200 p-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      O Depósito não tem saldo para {num(shortage)} unidade(s). Será baixado só o que existe e a falta fica registrada para acertar na contagem.
                    </p>
                  )}
                  {state.overlaps.length > 0 && (
                    <button type="button" onClick={() => setAllowOverlap(!allowOverlap)} data-testid="allow-overlap"
                            className={`w-full flex items-start gap-2 rounded-lg border p-2 text-left ${allowOverlap ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20' : 'border-amber-300'}`}>
                      {allowOverlap ? <CheckSquare className="w-5 h-5 shrink-0 text-amber-600" /> : <Square className="w-5 h-5 shrink-0 text-amber-600" />}
                      <span className="text-sm">O período deste relatório se sobrepõe a uma baixa já feita ({state.overlaps.map((o) => periodLabel(o.period)).join(', ')}). As mesmas vendas podem sair duas vezes. <b>Quero baixar mesmo assim.</b></span>
                    </button>
                  )}
                  {state.blocking.map((b) => <p key={b} className="text-sm text-red-600">• {blockMessages[b]}</p>)}
                  {unsaved && <p className="text-sm text-amber-700">• Salve as ligações antes de baixar.</p>}
                  <Button className="w-full h-12 bg-primary hover:bg-primary/90" disabled={!canConfirm} onClick={() => setAskConfirm(true)} data-testid="confirm-sale">
                    {confirming ? 'Baixando...' : `Baixar ${num(state.summary.units)} unidades do Depósito`}
                  </Button>
                </div>
              )}
            </div>
          )}

          {view === 'done' && state && (
            <div className="space-y-4" data-testid="sale-done">
              <p className="flex items-center gap-2 text-lg font-bold text-emerald-600"><Check className="w-5 h-5" /> Baixa concluída</p>
              <p className="text-sm">Relatório de {periodLabel(state.period)}: <b>{num(state.summary.units)}</b> unidades saíram do Depósito.</p>
              {state.summary.shortage_units > 0 && (
                <div className="rounded-lg border border-red-300 p-3 text-sm space-y-1">
                  <p className="font-semibold text-red-600">Sem saldo no Depósito ({num(state.summary.shortage_units)} unidades)</p>
                  {state.plan.filter((i) => i.shortage > 0).map((i) => (
                    <p key={`${i.product_id}-${i.size}`}>{i.name} {i.label}: faltaram <b>{num(i.shortage)}</b></p>
                  ))}
                  <p className="text-xs text-muted-foreground">Confira na contagem do Depósito (Inventário).</p>
                </div>
              )}
              <Button className="w-full" onClick={() => onOpenChange(false)}>Fechar</Button>
            </div>
          )}

          {view === 'history' && (
            <div className="space-y-3">
              {history.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma baixa feita ainda.</p>}
              {history.map((h) => (
                <div key={h.id} className={`rounded-lg border p-3 text-sm space-y-1 ${h.status === 'cancelado' ? 'opacity-60' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">{periodLabel(h.period)} {h.status === 'cancelado' && <span className="text-xs font-normal">(desfeita)</span>}</p>
                    {h.status === 'baixado' && (
                      <Button size="sm" variant="outline" onClick={() => setUndoTarget(h)}><Undo2 className="w-4 h-4 mr-1" /> Desfazer</Button>
                    )}
                  </div>
                  <p className="text-muted-foreground">{num(h.summary?.units || 0)} unidades · {h.confirmed_by || ''} · {fmtDateTime(h.confirmed_at)}</p>
                  {(h.shortages || []).length > 0 && <p className="text-xs text-red-600">Sem saldo: {h.shortages.map((s) => `${s.name} ${s.label} (${num(s.shortage)})`).join(', ')}</p>}
                </div>
              ))}
              <Button variant="outline" className="w-full" onClick={reset}>Voltar</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={askConfirm} onOpenChange={setAskConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Baixar {state ? num(state.summary.units) : 0} unidades do Depósito?</AlertDialogTitle>
            <AlertDialogDescription>
              Relatório de {state ? periodLabel(state.period) : ''}. A baixa sai só do Depósito{shortage > 0 ? ` e ${num(shortage)} unidade(s) ficam registradas como falta de saldo` : ''}. Você pode desfazer depois pelo histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSale} className="bg-primary" data-testid="confirm-yes">Baixar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(undoTarget)} onOpenChange={(o) => !o && setUndoTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desfazer a baixa de {undoTarget ? periodLabel(undoTarget.period) : ''}?</AlertDialogTitle>
            <AlertDialogDescription>As {undoTarget ? num(undoTarget.summary?.units || 0) : 0} unidades voltam para o Depósito e o relatório poderá ser baixado de novo.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={undo} className="bg-primary">Desfazer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
