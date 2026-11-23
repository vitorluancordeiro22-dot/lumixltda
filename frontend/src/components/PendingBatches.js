import React, { useCallback, useEffect, useState } from 'react';
import api from '../lib/api';
import { Card } from './ui/card';
import { Button } from './ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from './ui/alert-dialog';
import { toast } from 'sonner';
import { Hourglass, Container, Split, EyeOff, ChevronDown, ChevronUp } from 'lucide-react';
import { StockBottle } from './StockBottle';
import { errorMessage } from '../lib/stockSizes';

const fmtDate = (d) => (d && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10).split('-').reverse().join('/') : d || '');

/**
 * Lotes finalizados cujas garrafas contadas ainda não foram para o Estoque nem para o Depósito.
 * Só mostra e aciona: nada muda de saldo sem a pessoa tocar num botão.
 */
export const PendingBatches = ({ reloadKey = 0, operator = '', onChanged, onSplit }) => {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(true);
  const [ask, setAsk] = useState(null); // { type: 'deposit' | 'dismiss', row }
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setRows((await api.get('/finished-stock/pending-batches')).data); }
    catch { setRows([]); }
  }, []);

  useEffect(() => { load(); }, [load, reloadKey]);

  const run = async () => {
    const { type, row } = ask;
    setAsk(null); setBusy(true);
    try {
      if (type === 'deposit') {
        await api.post('/finished-stock/entries', {
          product_id: row.product_id, size: row.size, quantity: 0, to_deposit: row.available,
          batch_id: row.batch_id, mode: 'normal', operator,
        });
        toast.success(`${row.available} × ${row.product_name} ${row.label} foram para o Depósito`);
      } else {
        await api.post('/finished-stock/pending-batches/dismiss', { batch_id: row.batch_id, size: row.size });
        toast.success('Retirado da lista (nenhum saldo foi alterado)');
      }
      await load();
      onChanged?.();
    } catch (e) { toast.error(errorMessage(e, 'Não foi possível concluir')); }
    finally { setBusy(false); }
  };

  if (!rows.length) return null;

  return (
    <Card className="p-4 space-y-3 border-amber-300" data-testid="pending-batches">
      <button type="button" className="w-full flex items-center justify-between gap-2 text-left" onClick={() => setOpen(!open)}>
        <span className="flex items-center gap-2 font-bold">
          <Hourglass className="w-5 h-5 text-amber-600" /> Lotes aguardando destino
          <span className="rounded-full bg-amber-500/15 text-amber-600 px-2 py-0.5 text-xs">{rows.length}</span>
        </span>
        {open ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
      </button>
      <p className="text-xs text-muted-foreground">
        Garrafas já contadas (mesmo de lote ainda aberto) que ainda não foram registradas nem no Estoque nem no Depósito.
        Guarde o que foi engarrafado: se tudo vai para o Depósito, é só tocar em <b>Tudo para o Depósito</b>.
        Quando contarem mais no mesmo lote, o restante aparece aqui de novo.
      </p>
      {open && (
        <div className="divide-y rounded-lg border max-h-[40vh] overflow-y-auto">
          {rows.map((r) => (
            <div key={`${r.batch_id}-${r.size}`} className="p-3 space-y-2" data-testid={`pending-${r.batch_number}-${r.size}`}>
              <div className="flex items-center gap-3">
                <StockBottle size={r.size} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-tight">{r.product_name} <span className="text-muted-foreground">{r.label}</span></p>
                  <p className="text-xs text-muted-foreground">
                    Lote {r.batch_number} · {fmtDate(r.date)}{r.status === 'arquivado' ? ' · arquivado' : ''}
                    {r.open && <span className="ml-1 rounded-full bg-amber-500/15 text-amber-600 px-1.5 py-0.5 font-semibold" data-testid="open-badge">lote aberto · contagem parcial</span>}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xl font-bold leading-none">{r.available}</p>
                  <p className="text-[11px] text-muted-foreground">de {r.counted}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" className="bg-primary hover:bg-primary/90" disabled={busy} onClick={() => setAsk({ type: 'deposit', row: r })} data-testid="pending-all">
                  <Container className="w-4 h-4 mr-1" /> Tudo para o Depósito
                </Button>
                {onSplit && (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => onSplit(r)} data-testid="pending-split">
                    <Split className="w-4 h-4 mr-1" /> Dividir
                  </Button>
                )}
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => setAsk({ type: 'dismiss', row: r })} title="Tirar da lista">
                  <EyeOff className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={Boolean(ask)} onOpenChange={(o) => !o && setAsk(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{ask?.type === 'deposit' ? 'Mandar para o Depósito?' : 'Tirar da lista?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {ask?.type === 'deposit'
                ? `${ask.row.available} × ${ask.row.product_name} ${ask.row.label} (lote ${ask.row.batch_number}) entram no Depósito e nada fica no Estoque. Dá para estornar depois, na aba Depósito.`
                : 'Use quando essas garrafas já foram contadas em outro lugar (ex.: no Inventário). Nenhum saldo é alterado e o lote continua disponível na Entrada. Se contarem mais garrafas nesse lote depois, elas voltam a aparecer aqui.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={run} className="bg-primary" data-testid="pending-confirm">Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
