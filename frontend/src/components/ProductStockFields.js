import React from 'react';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { StockBottle } from './StockBottle';
import { productKind, sizesForKind } from '../lib/stockSizes';

/** Tamanhos que o produto possui e quantidade mínima de cada um (aba Estoque). */
export const ProductStockFields = ({ unit, sizes = [], minimums = {}, onChange }) => {
  const options = sizesForKind(productKind(unit));
  const selected = sizes.filter((s) => options.some((o) => o.size === s));

  const toggle = (size) => {
    const next = selected.includes(size) ? selected.filter((s) => s !== size) : [...selected, size];
    onChange({ sizes: next, minimums });
  };
  const setMin = (size, value) => onChange({ sizes: selected, minimums: { ...minimums, [size]: value.replace(/\D/g, '') } });

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <Label className="text-foreground">Estoque — tamanhos e quantidade mínima</Label>
      <p className="text-xs text-muted-foreground">
        Marque os tamanhos que este produto tem. Quando o estoque chegar no mínimo, todos recebem uma notificação.
        {selected.length === 0 && ' Nenhum marcado = aparecem todos os tamanhos.'}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {options.map((o) => {
          const on = selected.includes(o.size);
          return (
            <div key={o.size} className={`rounded-xl border-2 p-2 space-y-2 transition ${on ? 'border-primary bg-primary/5' : 'border-border'}`}>
              <button type="button" onClick={() => toggle(o.size)} className="w-full flex flex-col items-center gap-1">
                <StockBottle size={o.size} empty={!on} />
                <span className="text-sm font-bold">{o.label}</span>
                <span className="text-[11px] text-muted-foreground">{on ? 'Tem ✓' : 'Não tem'}</span>
              </button>
              {on && (
                <div>
                  <span className="text-[11px] text-muted-foreground">Mínimo</span>
                  <Input type="number" inputMode="numeric" min="0" value={minimums[o.size] ?? ''} placeholder="0"
                         onChange={(e) => setMin(o.size, e.target.value)} className="h-9 text-center" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const stockConfigPayload = (unit, sizes = [], minimums = {}) => {
  const allowed = sizesForKind(productKind(unit)).map((o) => o.size);
  const chosen = sizes.filter((s) => allowed.includes(s));
  const mins = {};
  chosen.forEach((s) => { const n = parseInt(minimums[s], 10); if (n > 0) mins[s] = n; });
  return { sizes: chosen, minimums: mins };
};
