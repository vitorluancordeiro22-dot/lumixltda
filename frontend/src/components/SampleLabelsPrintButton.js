import React, { useMemo, useState } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Printer, Eye, Check, X } from 'lucide-react';

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

// Converte "YYYY-MM-DD" ou ISO string em "DD/MM/YYYY" sem deslocamento de fuso.
const formatDateBR = (iso) => {
  if (!iso) return '';
  const s = String(iso).split('T')[0];
  const parts = s.split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

const buildLabelsHTML = (labels) => {
  // labels: array de { productName, lote, fab }
  // 80 etiquetas por folha (4 colunas × 20 linhas)
  const PER_SHEET = 80;
  const sheets = [];
  for (let i = 0; i < labels.length; i += PER_SHEET) {
    sheets.push(labels.slice(i, i + PER_SHEET));
  }
  if (sheets.length === 0) sheets.push([]);

  const sheetsHTML = sheets.map((sheet) => {
    const cells = [];
    for (let i = 0; i < PER_SHEET; i++) {
      const lbl = sheet[i];
      if (lbl) {
        cells.push(`
          <div class="label">
            <div class="product-name">${(lbl.productName || '').toUpperCase()}</div>
            <div class="info">
              <span class="lote">LOTE ${lbl.lote || '-'}</span>
              <span class="fab">FAB ${lbl.fab || '-'}</span>
            </div>
          </div>
        `);
      } else {
        cells.push('<div class="label empty"></div>');
      }
    }
    return `<div class="sheet">${cells.join('')}</div>`;
  }).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Etiquetas de Amostras</title>
      <style>
        @page {
          size: 21.6cm 27.9cm;
          margin: 0;
        }
        * { box-sizing: border-box; }
        html, body {
          margin: 0; padding: 0;
          font-family: Arial, Helvetica, sans-serif;
          color: #000; background: #fff;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .sheet {
          width: 21.6cm;
          height: 27.9cm;
          padding: 1.3cm 1.3cm 0 1.3cm;
          display: grid;
          grid-template-columns: repeat(4, 4.4cm);
          grid-template-rows: repeat(20, 1.3cm);
          column-gap: 0.3cm;
          row-gap: 0;
          page-break-after: always;
        }
        .sheet:last-child { page-break-after: auto; }
        .label {
          width: 4.4cm;
          height: 1.3cm;
          padding: 0.1cm 0.15cm;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: stretch;
          overflow: hidden;
          line-height: 1.05;
        }
        .label.empty { background: transparent; }
        .product-name {
          font-weight: bold;
          font-size: 8pt;
          text-align: center;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-bottom: 0.05cm;
          color: #1e3a8a; /* azul marinho */
        }
        .info {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 6.8pt;
          font-weight: 600;
          white-space: nowrap;
        }
        .info .lote { color: #15803d; }  /* verde escuro */
        .info .fab  { color: #b91c1c; }  /* vermelho escuro */
        .info span { letter-spacing: 0.2px; }
        /* Preview only (não afeta impressão) */
        body.preview { background: #2a2a2a; padding: 1cm 0; }
        body.preview .sheet {
          background: #fff;
          margin: 0 auto 1cm auto;
          box-shadow: 0 4px 20px rgba(0,0,0,0.4);
        }
        body.preview .label {
          outline: 1px dashed rgba(0,0,0,0.15);
        }
      </style>
    </head>
    <body>
      ${sheetsHTML}
    </body>
    </html>
  `;
};

export default function SampleLabelsPrintButton({ samples, products, batches }) {
  const [open, setOpen] = useState(false);
  const today = new Date();
  const [month, setMonth] = useState(String(today.getMonth() + 1));
  const [year, setYear] = useState(String(today.getFullYear()));
  // map de sampleId -> quantidade (string para facilitar input). 0 ou vazio = não imprimir
  const [quantities, setQuantities] = useState({});

  const getProduct = (id) => products.find(p => p.id === id);
  const getBatch = (id) => batches.find(b => b.id === id);

  // Anos disponíveis nas amostras (+ ano atual)
  const availableYears = useMemo(() => {
    const set = new Set(samples.map(s => String(s.year)));
    set.add(String(today.getFullYear()));
    return Array.from(set).sort((a, b) => Number(b) - Number(a));
  }, [samples]); // eslint-disable-line

  // Amostras filtradas pelo mês/ano
  const filtered = useMemo(() => {
    return samples
      .filter(s => String(s.month) === String(month) && String(s.year) === String(year))
      .sort((a, b) => {
        const ap = getProduct(a.product_id)?.name || '';
        const bp = getProduct(b.product_id)?.name || '';
        return ap.localeCompare(bp, 'pt-BR');
      });
  }, [samples, month, year]); // eslint-disable-line

  const setQty = (sampleId, val) => {
    setQuantities(prev => ({ ...prev, [sampleId]: val }));
  };

  const selectAll = (qty) => {
    const next = {};
    filtered.forEach(s => { next[s.id] = String(qty); });
    setQuantities(prev => ({ ...prev, ...next }));
  };

  const clearAll = () => {
    const next = { ...quantities };
    filtered.forEach(s => { next[s.id] = '0'; });
    setQuantities(next);
  };

  // Constrói o array de labels (expandindo pela quantidade)
  const buildLabels = () => {
    const out = [];
    filtered.forEach(s => {
      const qty = parseInt(quantities[s.id] || '0', 10);
      if (qty > 0) {
        const product = getProduct(s.product_id);
        const batch = getBatch(s.product_batch_id);
        const lbl = {
          productName: product?.name || 'PRODUTO',
          lote: batch?.batch_number || '-',
          fab: batch?.date ? formatDateBR(batch.date) : '-',
        };
        for (let i = 0; i < qty; i++) out.push(lbl);
      }
    });
    return out;
  };

  const totalLabels = useMemo(() => {
    return filtered.reduce((acc, s) => acc + (parseInt(quantities[s.id] || '0', 10) || 0), 0);
  }, [filtered, quantities]);

  const totalSheets = Math.max(1, Math.ceil(totalLabels / 80));

  const handlePreview = () => {
    const labels = buildLabels();
    if (labels.length === 0) {
      return;
    }
    const html = buildLabelsHTML(labels).replace('<body>', '<body class="preview">');
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
  };

  const handlePrint = () => {
    const labels = buildLabels();
    if (labels.length === 0) return;
    const html = buildLabelsHTML(labels);
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
    // espera renderizar
    setTimeout(() => {
      try {
        win.focus();
        win.print();
      } catch (e) { /* noop */ }
    }, 400);
  };

  return (
    <>
      <Button
        variant="outline"
        className="border-border"
        onClick={() => setOpen(true)}
        data-testid="print-sample-labels-btn"
      >
        <Printer className="w-4 h-4 mr-2" /> Imprimir Etiquetas
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Printer className="w-5 h-5" /> Imprimir Etiquetas de Amostras
            </DialogTitle>
          </DialogHeader>

          {/* Filtros */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Mês</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="bg-input border-border text-foreground mt-1" data-testid="month-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {MESES.map((m, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)} className="text-foreground">{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Ano</Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger className="bg-input border-border text-foreground mt-1" data-testid="year-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {availableYears.map(y => (
                    <SelectItem key={y} value={y} className="text-foreground">{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Ações rápidas */}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <Button variant="outline" size="sm" className="border-border h-8" onClick={() => selectAll(1)} data-testid="select-all-1">
              <Check className="w-3 h-3 mr-1" /> Marcar todos (1 etiqueta)
            </Button>
            <Button variant="outline" size="sm" className="border-border h-8" onClick={() => selectAll(2)}>
              Marcar todos (2)
            </Button>
            <Button variant="ghost" size="sm" className="h-8" onClick={clearAll}>
              <X className="w-3 h-3 mr-1" /> Zerar
            </Button>
            <span className="ml-auto text-xs text-muted-foreground">
              {totalLabels} etiqueta(s) · {totalSheets} folha(s)
            </span>
          </div>

          {/* Lista */}
          <div className="overflow-y-auto flex-1 -mx-1 px-1 mt-1 border-t border-border pt-3">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhuma amostra encontrada para {MESES[Number(month) - 1]} de {year}.
              </p>
            ) : (
              <div className="space-y-2">
                {filtered.map(s => {
                  const product = getProduct(s.product_id);
                  const batch = getBatch(s.product_batch_id);
                  const qty = quantities[s.id] || '0';
                  const selected = parseInt(qty, 10) > 0;
                  return (
                    <div
                      key={s.id}
                      className={`grid grid-cols-[1fr_auto] gap-3 items-center rounded-md border px-3 py-2 transition-colors ${
                        selected ? 'border-primary/60 bg-primary/5' : 'border-border bg-muted/20'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground truncate">{product?.name || 'Produto removido'}</p>
                        <p className="text-xs text-muted-foreground">
                          Lote: <span className="font-mono text-foreground">{batch?.batch_number || '-'}</span>
                          {batch?.date && (
                            <> · Fab: <span className="text-foreground">{formatDateBR(batch.date)}</span></>
                          )}
                          {' · '}
                          <span className={s.status === 'retirado' ? 'text-green-500' : 'text-amber-500'}>
                            {s.status === 'retirado' ? 'Retirada' : 'Pendente'}
                          </span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground">Qtd</Label>
                        <Input
                          type="number"
                          min="0"
                          max="80"
                          value={qty}
                          onChange={(e) => setQty(s.id, e.target.value.replace(/[^0-9]/g, ''))}
                          className="bg-input border-border text-foreground w-16 h-8 text-center text-sm"
                          data-testid={`qty-${s.id}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Rodapé */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button variant="outline" className="border-border" onClick={handlePreview} disabled={totalLabels === 0} data-testid="preview-labels-btn">
              <Eye className="w-4 h-4 mr-1" /> Pré-visualizar
            </Button>
            <Button onClick={handlePrint} disabled={totalLabels === 0} data-testid="print-labels-btn">
              <Printer className="w-4 h-4 mr-1" /> Imprimir
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pré-visualização abre em nova janela (ver handlePreview) */}
    </>
  );
}
