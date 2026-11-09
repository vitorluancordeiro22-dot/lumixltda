import React, { useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { toast } from 'sonner';
import { Gauge, Search, CheckSquare, Square, Table2, Layers } from 'lucide-react';
import { StockBottle } from './StockBottle';
import { sizesForKind, errorMessage } from '../lib/stockSizes';

const digits = (v) => String(v ?? '').replace(/\D/g, '');

const KindToggle = ({ kind, onChange, counts }) => (
  <div className="inline-flex rounded-lg border p-1 gap-1">
    {[{ k: 'L', label: 'Litros' }, { k: 'Kg', label: 'Kg' }].map(({ k, label }) => (
      <button key={k} type="button" onClick={() => onChange(k)}
              className={`px-3 h-8 rounded-md text-sm font-semibold transition ${kind === k ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
        {label} <span className="opacity-70">({counts[k] || 0})</span>
      </button>
    ))}
  </div>
);

const currentText = (p, kind) => sizesForKind(kind)
  .filter((s) => p.minimums?.[s.size])
  .map((s) => `${s.label}: ${p.minimums[s.size]}`)
  .join(' · ');

// ---------- aba 1: aplicar o mesmo padrão a vários produtos ----------
const ApplyMany = ({ products, kind, onSaved }) => {
  const sizes = sizesForKind(kind);
  const [values, setValues] = useState({});
  const [selected, setSelected] = useState(new Set());
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setValues({}); setSelected(new Set()); setSearch(''); }, [kind]);

  const visible = products.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()));
  const allVisibleSelected = visible.length > 0 && visible.every((p) => selected.has(p.product_id));
  const filled = Object.entries(values).filter(([, v]) => v !== '');

  const toggle = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };
  const toggleAll = () => {
    const next = new Set(selected);
    visible.forEach((p) => (allVisibleSelected ? next.delete(p.product_id) : next.add(p.product_id)));
    setSelected(next);
  };

  const apply = async () => {
    if (!filled.length) return toast.error('Digite o mínimo de pelo menos um tamanho');
    if (!selected.size) return toast.error('Selecione os produtos');
    const minimums = Object.fromEntries(filled.map(([k, v]) => [k, parseInt(v, 10) || 0]));
    setSaving(true);
    try {
      const r = await api.put('/finished-stock/minimums/bulk', {
        updates: [...selected].map((product_id) => ({ product_id, minimums })),
      });
      toast.success(`Mínimo aplicado em ${r.data.updated} produto(s)`);
      setSelected(new Set());
      onSaved();
    } catch (e) { toast.error(errorMessage(e, 'Erro ao aplicar')); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-3 space-y-2">
        <p className="text-sm font-semibold">1. Digite o padrão</p>
        <div className="grid grid-cols-4 gap-2">
          {sizes.map((s) => (
            <div key={s.size} className="flex flex-col items-center gap-1 rounded-xl border p-2">
              <StockBottle size={s.size} empty={!values[s.size]} />
              <span className="text-sm font-bold">{s.label}</span>
              <Input value={values[s.size] ?? ''} inputMode="numeric" placeholder="—" className="h-9 text-center"
                     onChange={(e) => setValues({ ...values, [s.size]: digits(e.target.value) })} />
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">Vazio = não mexe nesse tamanho · 0 = tira o mínimo. Nenhum tamanho é escondido dos produtos.</p>
      </div>

      <div className="rounded-lg border p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">2. Marque os produtos <span className="text-muted-foreground font-normal">({selected.size} selecionados)</span></p>
          <Button type="button" size="sm" variant="outline" onClick={toggleAll}>
            {allVisibleSelected ? 'Desmarcar' : 'Selecionar'} {search ? 'filtrados' : 'todos'}
          </Button>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filtrar por nome (ex.: desinfetante)" className="pl-9" />
        </div>
        <div className="max-h-[38vh] overflow-y-auto divide-y rounded-md border">
          {visible.map((p) => {
            const on = selected.has(p.product_id);
            const cur = currentText(p, kind);
            return (
              <button key={p.product_id} type="button" onClick={() => toggle(p.product_id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-left transition ${on ? 'bg-primary/10' : 'hover:bg-muted'}`}>
                {on ? <CheckSquare className="w-5 h-5 text-primary shrink-0" /> : <Square className="w-5 h-5 text-muted-foreground shrink-0" />}
                <span className="flex-1 min-w-0">
                  <span className="block truncate text-sm font-medium">{p.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{cur || 'sem mínimo'}</span>
                </span>
              </button>
            );
          })}
          {visible.length === 0 && <p className="p-3 text-sm text-muted-foreground">Nenhum produto.</p>}
        </div>
      </div>

      <Button className="w-full h-12 bg-primary hover:bg-primary/90" disabled={saving || !selected.size || !filled.length} onClick={apply}>
        Aplicar em {selected.size} produto(s)
      </Button>
    </div>
  );
};

// ---------- aba 2: tabela para digitar em sequência ----------
const TableEdit = ({ products, kind, onSaved }) => {
  const sizes = sizesForKind(kind);
  const [edits, setEdits] = useState({});
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setEdits({}); setSearch(''); }, [kind]);

  const visible = products.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()));
  const original = (p, size) => (p.minimums?.[size] ? String(p.minimums[size]) : '');
  const value = (p, size) => edits[p.product_id]?.[size] ?? original(p, size);
  const changed = useMemo(() => products.filter((p) => sizes.some((s) => {
    const e = edits[p.product_id]?.[s.size];
    return e !== undefined && e !== original(p, s.size);
  })), [edits, products, sizes]);

  const setCell = (pid, size, v) => setEdits({ ...edits, [pid]: { ...(edits[pid] || {}), [size]: digits(v) } });

  const save = async () => {
    if (!changed.length) return;
    setSaving(true);
    try {
      const updates = changed.map((p) => ({
        product_id: p.product_id,
        minimums: Object.fromEntries(sizes
          .filter((s) => edits[p.product_id]?.[s.size] !== undefined && edits[p.product_id][s.size] !== original(p, s.size))
          .map((s) => [s.size, parseInt(edits[p.product_id][s.size], 10) || 0])),
      }));
      const r = await api.put('/finished-stock/minimums/bulk', { updates });
      toast.success(`${r.data.updated} produto(s) salvos`);
      setEdits({});
      onSaved();
    } catch (e) { toast.error(errorMessage(e, 'Erro ao salvar')); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-3 min-w-0">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filtrar por nome" className="pl-9" />
      </div>
      <p className="text-[11px] text-muted-foreground">Digite e use <b>Tab</b> ou <b>Enter</b> para ir ao próximo campo. Vazio = sem mínimo. Campo apagado = tamanho desmarcado no produto (ao digitar um mínimo, ele passa a ter).</p>
      <div className="max-h-[50vh] overflow-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="border-b">
              <th className="text-left p-2 sticky left-0 bg-card min-w-[120px]">Produto</th>
              {sizes.map((s) => <th key={s.size} className="p-2 text-center min-w-[64px]">{s.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => {
              const dirty = changed.includes(p);
              return (
                <tr key={p.product_id} className={`border-b last:border-0 ${dirty ? 'bg-amber-50 dark:bg-amber-900/20' : ''}`}>
                  <td className="p-2 sticky left-0 bg-inherit font-medium"><span className="line-clamp-2">{p.name}</span></td>
                  {sizes.map((s) => {
                    const has = !p.configured || p.stock_sizes.includes(s.size);
                    return (
                      <td key={s.size} className="p-1">
                        <Input value={value(p, s.size)} inputMode="numeric" placeholder="—" data-cell
                               className={`h-9 text-center px-1 ${has ? '' : 'opacity-50'}`}
                               onChange={(e) => setCell(p.product_id, s.size, e.target.value)}
                               onKeyDown={(e) => {
                                 if (e.key !== 'Enter') return;
                                 e.preventDefault();
                                 const cells = [...document.querySelectorAll('input[data-cell]')];
                                 cells[cells.indexOf(e.currentTarget) + 1]?.focus();
                               }} />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        {visible.length === 0 && <p className="p-3 text-sm text-muted-foreground">Nenhum produto.</p>}
      </div>
      <Button className="w-full h-12 bg-primary hover:bg-primary/90" disabled={saving || !changed.length} onClick={save}>
        Salvar alterações {changed.length ? `(${changed.length} produto${changed.length === 1 ? '' : 's'})` : ''}
      </Button>
    </div>
  );
};

/** Estoque mínimo de vários produtos de uma vez. */
export const MinimumsManager = ({ open, onOpenChange, onSaved }) => {
  const [tab, setTab] = useState('many');
  const [kind, setKind] = useState('L');
  const [products, setProducts] = useState([]);

  const load = () => api.get('/finished-stock/overview')
    .then((r) => setProducts(r.data.products))
    .catch((e) => toast.error(errorMessage(e, 'Erro ao carregar produtos')));

  useEffect(() => { if (open) load(); }, [open]);

  const counts = products.reduce((a, p) => ({ ...a, [p.kind]: (a[p.kind] || 0) + 1 }), {});
  const ofKind = products.filter((p) => p.kind === kind);
  const saved = () => { load(); onSaved?.(); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-2xl max-h-[94vh] overflow-y-auto [&>*]:min-w-0">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Gauge className="w-5 h-5" /> Estoque mínimo</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {[{ k: 'many', label: 'Aplicar a vários', icon: Layers }, { k: 'table', label: 'Tabela', icon: Table2 }].map(({ k, label, icon: Icon }) => (
            <button key={k} type="button" onClick={() => setTab(k)}
                    className={`h-11 rounded-lg border-2 font-semibold flex items-center justify-center gap-2 transition ${
                      tab === k ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>
        <KindToggle kind={kind} onChange={setKind} counts={counts} />
        {tab === 'many'
          ? <ApplyMany products={ofKind} kind={kind} onSaved={saved} />
          : <TableEdit products={ofKind} kind={kind} onSaved={saved} />}
      </DialogContent>
    </Dialog>
  );
};
