import React from 'react';
import { Button } from './ui/button';
import { Printer } from 'lucide-react';
import { toast } from 'sonner';

export const ProductPrintButton = ({ product, rawMaterials = [] }) => {
  const handlePrint = () => {
    if (!product) {
      toast.error('Produto não encontrado');
      return;
    }

    const printWindow = window.open('', '_blank');

    // Resolve raw material names from IDs
    const getMatName = (rmId) => {
      const mat = rawMaterials.find(m => m.id === rmId);
      return mat ? mat.name : rmId;
    };

    // Calculate quantities based on expected liters
    const expectedLiters = product.expected_liters || 0;

    // Build material rows
    const recipes = product.recipes || [];
    let totalPercent = 0;
    let totalQuant = 0;

    const materialRows = recipes.map((recipe, idx) => {
      const name = getMatName(recipe.raw_material_id);
      const quant = recipe.quantity_per_liter || 0;
      const percent = expectedLiters > 0 ? ((quant / expectedLiters) * 100) : 0;
      totalPercent += percent;
      totalQuant += quant;
      return `
        <tr>
          <td class="cell center">${idx + 1}</td>
          <td class="cell">${name.toUpperCase()}</td>
          <td class="cell center"></td>
          <td class="cell center"></td>
          <td class="cell center">${percent % 1 === 0 ? percent : percent.toFixed(2)}</td>
          <td class="cell center">${quant % 1 === 0 ? quant : parseFloat(quant).toFixed(2)}</td>
          <td class="cell center"></td>
          <td class="cell center"></td>
          <td class="cell center"></td>
        </tr>
      `;
    }).join('');

    // Empty rows to fill the table (min 12 rows total)
    const emptyRowCount = Math.max(0, 12 - recipes.length);
    const emptyRows = Array(emptyRowCount).fill('').map(() => `
      <tr>
        <td class="cell">&nbsp;</td>
        <td class="cell">&nbsp;</td>
        <td class="cell">&nbsp;</td>
        <td class="cell">&nbsp;</td>
        <td class="cell">&nbsp;</td>
        <td class="cell">&nbsp;</td>
        <td class="cell">&nbsp;</td>
        <td class="cell">&nbsp;</td>
        <td class="cell">&nbsp;</td>
      </tr>
    `).join('');

    const today = new Date().toLocaleDateString('pt-BR');

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>OP - ${product.name}</title>
        <style>
          @media print {
            @page { 
              margin: 10mm; 
              size: A4 portrait;
            }
            .no-print { display: none !important; }
          }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: Arial, sans-serif;
            font-size: 10pt;
            padding: 10mm;
          }
          .op-container {
            width: 100%;
            max-width: 210mm;
            margin: 0 auto;
          }

          /* HEADER */
          .header-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 0;
          }
          .header-table td {
            border: 2px solid #000;
            padding: 6px 10px;
          }
          .header-title {
            font-size: 16pt;
            font-weight: bold;
            text-align: center;
          }
          .header-op {
            font-size: 12pt;
            font-weight: bold;
            text-align: center;
          }

          /* PRODUCT INFO */
          .info-table {
            width: 100%;
            border-collapse: collapse;
          }
          .info-table td {
            border: 1px solid #000;
            padding: 5px 8px;
            font-size: 10pt;
          }
          .info-label {
            font-weight: bold;
          }

          /* MATERIALS TABLE */
          .materials-table {
            width: 100%;
            border-collapse: collapse;
          }
          .materials-table th {
            border: 2px solid #000;
            padding: 4px 6px;
            font-size: 9pt;
            font-weight: bold;
            text-align: center;
            background-color: #f0f0f0;
          }
          .materials-table td.cell {
            border: 1px solid #000;
            padding: 3px 6px;
            font-size: 9pt;
            height: 20px;
          }
          .materials-table td.center {
            text-align: center;
          }
          .total-row td {
            border: 2px solid #000 !important;
            font-weight: bold;
          }

          /* PACKAGING SECTION */
          .section-title {
            font-weight: bold;
            font-size: 11pt;
            border: 2px solid #000;
            padding: 4px 8px;
            background-color: #f0f0f0;
            text-align: center;
            margin-top: 8px;
          }
          .pack-table {
            width: 100%;
            border-collapse: collapse;
          }
          .pack-table th, .pack-table td {
            border: 1px solid #000;
            padding: 3px 6px;
            font-size: 9pt;
            text-align: center;
            height: 22px;
          }
          .pack-table th {
            font-weight: bold;
            background-color: #f0f0f0;
          }
          .pack-table td.label-cell {
            text-align: left;
            font-weight: bold;
            background-color: #fafafa;
          }

          /* SIGNATURE SECTION */
          .sig-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
          }
          .sig-table td {
            border: 1px solid #000;
            padding: 3px 6px;
            font-size: 9pt;
            height: 22px;
          }
          .sig-table td.sig-header {
            font-weight: bold;
            text-align: center;
            background-color: #f0f0f0;
          }
          .sig-table td.sig-label {
            font-weight: bold;
            width: 80px;
          }

          .print-buttons {
            margin-top: 20px;
            text-align: center;
          }
          .print-buttons button {
            padding: 10px 24px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            margin: 0 5px;
          }
          .btn-print { background: #2563eb; color: white; }
          .btn-close { background: #666; color: white; }
        </style>
      </head>
      <body>
        <div class="op-container">

          <!-- HEADER -->
          <table class="header-table">
            <tr>
              <td class="header-title" style="width:60%">ORDEM DE PRODU&Ccedil;&Atilde;O</td>
              <td class="header-op" style="width:40%">OP N&ordm;: ______</td>
            </tr>
          </table>

          <!-- PRODUCT INFO -->
          <table class="info-table">
            <tr>
              <td class="info-label" colspan="5">PRODUTO: ${product.name.toUpperCase()}</td>
              <td class="info-label" style="text-align:right">QUANT(${product.unit === 'Litros' ? 'Lts' : 'Kg'}):</td>
              <td style="text-align:center; font-weight:bold">${expectedLiters}</td>
            </tr>
            <tr>
              <td class="info-label" colspan="2">LOTE:</td>
              <td class="info-label" colspan="2">DATA: ${today}</td>
              <td>Hora I:</td>
              <td>Hora F:</td>
              <td></td>
            </tr>
          </table>

          <!-- MATERIALS TABLE -->
          <table class="materials-table">
            <thead>
              <tr>
                <th style="width:5%">C&Oacute;D</th>
                <th style="width:25%">MAT&Eacute;RIAS-PRIMAS</th>
                <th style="width:12%">LOTE</th>
                <th style="width:12%">VALIDADE</th>
                <th style="width:8%">%</th>
                <th style="width:12%">QUANT. (kg)</th>
                <th style="width:10%">CORRE&Ccedil;&Atilde;O</th>
                <th style="width:10%">TOTAL</th>
                <th style="width:6%">OBS</th>
              </tr>
            </thead>
            <tbody>
              ${materialRows}
              ${emptyRows}
              <tr class="total-row">
                <td class="cell" colspan="4" style="text-align:right; font-weight:bold; border:2px solid #000">TOTAL</td>
                <td class="cell center" style="border:2px solid #000">${totalPercent % 1 === 0 ? totalPercent : totalPercent.toFixed(2)}</td>
                <td class="cell center" style="border:2px solid #000">${totalQuant % 1 === 0 ? totalQuant : totalQuant.toFixed(2)}</td>
                <td class="cell" style="border:2px solid #000"></td>
                <td class="cell" style="border:2px solid #000"></td>
                <td class="cell" style="border:2px solid #000"></td>
              </tr>
            </tbody>
          </table>

          <!-- PACKAGING SECTION -->
          <div class="section-title">EMBALAGENS</div>
          <table class="pack-table">
            <thead>
              <tr>
                <th style="width:14%">EMBALAGENS</th>
                <th>2LTS</th>
                <th>5 LTS</th>
                <th>20 LTS</th>
                <th>50 LTS</th>
                <th>TB</th>
                <th>SOBRA</th>
                <th>PERDA</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="label-cell">Peso Bruto</td>
                <td></td><td></td><td></td><td></td><td></td><td></td><td></td>
                <td>%</td>
              </tr>
              <tr>
                <td class="label-cell">Tara</td>
                <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
              </tr>
              <tr>
                <td class="label-cell">Peso L&iacute;quido</td>
                <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
              </tr>
              <tr>
                <td class="label-cell">Quantidade</td>
                <td></td><td></td><td></td><td></td><td></td><td></td><td></td>
                <td>Litros</td>
              </tr>
              <tr>
                <td class="label-cell">Total (Litros)</td>
                <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
              </tr>
            </tbody>
          </table>

          <!-- SIGNATURE SECTION -->
          <table class="sig-table">
            <tr>
              <td class="sig-header" colspan="2">Respons&aacute;vel pela pesagem</td>
              <td class="sig-header" colspan="2">Respons&aacute;vel pela prepara&ccedil;&atilde;o</td>
              <td class="sig-header" colspan="2">Respons&aacute;vel pelo envase</td>
            </tr>
            <tr>
              <td class="sig-label">Ass.</td><td></td>
              <td class="sig-label">Ass.</td><td></td>
              <td class="sig-label">Ass.</td><td></td>
            </tr>
            <tr>
              <td class="sig-label">Nome</td><td></td>
              <td class="sig-label">Nome</td><td></td>
              <td class="sig-label">Nome</td><td></td>
            </tr>
            <tr>
              <td class="sig-label">H In&iacute;cio</td><td></td>
              <td class="sig-label">H In&iacute;cio</td><td></td>
              <td class="sig-label">H In&iacute;cio</td><td></td>
            </tr>
            <tr>
              <td class="sig-label">H T&eacute;rm</td><td></td>
              <td class="sig-label">H T&eacute;rm</td><td></td>
              <td class="sig-label">H T&eacute;rm</td><td></td>
            </tr>
            <tr>
              <td class="sig-header" colspan="2">Conferente / Analista</td>
              <td class="sig-label">Ass.:</td><td></td>
              <td class="sig-label">Ass.</td><td></td>
            </tr>
            <tr>
              <td colspan="2"></td>
              <td class="sig-label">Nome:</td><td></td>
              <td class="sig-label">Nome:</td><td></td>
            </tr>
          </table>

        </div>

        <div class="print-buttons no-print">
          <button class="btn-print" onclick="window.print()">Imprimir</button>
          <button class="btn-close" onclick="window.close()">Fechar</button>
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
    toast.success('OP aberta para impressão');
  };

  return (
    <Button
      size="sm"
      variant="outline"
      className="border-border text-foreground hover:bg-muted"
      onClick={handlePrint}
      data-testid="print-op-button"
    >
      <Printer className="w-3 h-3 mr-1" />
      Imprimir OP
    </Button>
  );
};
