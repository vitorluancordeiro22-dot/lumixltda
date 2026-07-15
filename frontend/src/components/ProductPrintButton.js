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
              margin: 8mm; 
              size: A4 portrait;
            }
            .no-print { display: none !important; }
            body { padding: 0; }
          }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            font-size: 9pt;
            line-height: 1.3;
            color: #333;
            background: #fff;
            padding: 8mm;
          }
          .op-container {
            width: 100%;
            max-width: 210mm;
            margin: 0 auto;
            background: white;
            position: relative;
          }

          /* HEADER */
          .header-section {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
            border-bottom: 3px solid #16a34a;
            padding-bottom: 8px;
          }
          .header-left {
            flex: 1;
          }
          .header-title {
            font-size: 18pt;
            font-weight: 700;
            color: #16a34a;
            letter-spacing: 0.5px;
          }
          .header-subtitle {
            font-size: 8pt;
            color: #666;
            margin-top: 2px;
          }
          .header-right {
            text-align: right;
            border-left: 2px solid #dcfce7;
            padding-left: 12px;
          }
          .op-number-label {
            font-size: 8pt;
            color: #16a34a;
            font-weight: 600;
          }
          .op-number-input {
            font-size: 14pt;
            font-weight: bold;
            color: #16a34a;
            border: 1px dashed #86efac;
            padding: 2px 6px;
            width: 120px;
            text-align: center;
            margin-top: 2px;
          }

          /* PRODUCT INFO */
          .info-section {
            margin-bottom: 10px;
            background: #f0fdf4;
            border-radius: 4px;
            overflow: hidden;
            border: 1px solid #dcfce7;
          }
          .info-row {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 0;
            font-size: 9pt;
          }
          .info-row.full {
            grid-template-columns: 1fr;
          }
          .info-cell {
            padding: 6px 10px;
            border-right: 1px solid #dcfce7;
            border-bottom: 1px solid #dcfce7;
            display: flex;
            align-items: center;
          }
          .info-cell:last-child {
            border-right: none;
          }
          .info-row:last-child .info-cell {
            border-bottom: none;
          }
          .info-label {
            font-weight: 700;
            color: #16a34a;
            margin-right: 8px;
            min-width: 60px;
          }
          .info-value {
            color: #1f2937;
            font-weight: 500;
          }
          .info-input {
            border: 1px solid #86efac;
            padding: 3px 6px;
            border-radius: 2px;
            font-size: 8pt;
            flex: 1;
            background: white;
          }

          /* MATERIALS TABLE */
          .section-header {
            background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);
            color: white;
            font-weight: 700;
            padding: 8px 10px;
            margin-top: 10px;
            margin-bottom: 6px;
            font-size: 10pt;
            border-radius: 4px;
            text-transform: uppercase;
            letter-spacing: 0.3px;
          }

          .materials-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 10px;
            background: white;
            border: 1px solid #86efac;
          }
          .materials-table th {
            background: #dcfce7;
            border: 1px solid #86efac;
            padding: 5px 4px;
            font-size: 8pt;
            font-weight: 700;
            text-align: center;
            color: #16a34a;
            height: 24px;
          }
          .materials-table td.cell {
            border: 1px solid #f0fdf4;
            padding: 4px 4px;
            font-size: 8pt;
            height: 18px;
          }
          .materials-table td.center {
            text-align: center;
          }
          .materials-table tbody tr:nth-child(odd) {
            background: #f0fdf4;
          }
          .materials-table tbody tr:hover {
            background: #e7f5ed;
          }
          .total-row td {
            background: #bbf7d0 !important;
            border: 2px solid #16a34a !important;
            font-weight: 700;
            color: #16a34a;
            padding: 5px 4px;
          }

          /* PACKAGING SECTION */
          .pack-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 10px;
            background: white;
            border: 1px solid #86efac;
          }
          .pack-table th, .pack-table td {
            border: 1px solid #f0fdf4;
            padding: 4px 4px;
            font-size: 8pt;
            text-align: center;
            height: 20px;
          }
          .pack-table th {
            background: #dcfce7;
            font-weight: 700;
            color: #16a34a;
          }
          .pack-table td.label-cell {
            text-align: left;
            font-weight: 700;
            background: #ecfdf5;
            color: #16a34a;
            width: 100px;
          }
          .pack-table tbody tr:nth-child(odd) {
            background: #f0fdf4;
          }

          /* SIGNATURE SECTION */
          .sig-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
            background: white;
            border: 1px solid #86efac;
          }
          .sig-table td {
            border: 1px solid #f0fdf4;
            padding: 3px 6px;
            font-size: 8pt;
            height: 20px;
          }
          .sig-table td.sig-header {
            background: #dcfce7;
            font-weight: 700;
            text-align: center;
            color: #16a34a;
            padding: 5px 6px;
          }
          .sig-table td.sig-label {
            font-weight: 600;
            background: #ecfdf5;
            color: #16a34a;
            width: 70px;
          }
          .sig-table td.sig-input {
            background: white;
            border-bottom: 1px solid #86efac;
          }

          .print-buttons {
            margin-top: 20px;
            text-align: center;
            gap: 10px;
          }
          .print-buttons button {
            padding: 10px 24px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            margin: 0 5px;
            font-weight: 600;
            transition: all 0.2s;
          }
          .btn-print { 
            background: #16a34a; 
            color: white;
          }
          .btn-print:hover {
            background: #15803d;
          }
          .btn-close { 
            background: #6b7280; 
            color: white;
          }
          .btn-close:hover {
            background: #4b5563;
          }

          /* FOOTER WITH LOGO */
          .footer-section {
            position: fixed;
            bottom: 8mm;
            right: 8mm;
            width: 60px;
            height: 60px;
            opacity: 0.15;
            z-index: 0;
            pointer-events: none;
          }
          .footer-section img {
            width: 100%;
            height: 100%;
            object-fit: contain;
          }

          @media print {
            .footer-section {
              position: absolute;
              bottom: 15px;
              right: 15px;
              opacity: 0.12;
            }
          }
        </style>
      </head>
      <body>
        <div class="op-container">

          <!-- HEADER -->
          <div class="header-section">
            <div class="header-left">
              <div class="header-title"> ORDEM DE PRODUÇÃO</div>
              <div class="header-subtitle">Lumix - Sistema de Gestão de Produção</div>
            </div>
            <div class="header-right">
              <div class="op-number-label">OP Nº</div>
              <input type="text" class="op-number-input" placeholder="______">
            </div>
          </div>

          <!-- PRODUCT INFO -->
          <div class="info-section">
            <div class="info-row full">
              <div class="info-cell">
                <span class="info-label">PRODUTO:</span>
                <span class="info-value">${product.name.toUpperCase()}</span>
              </div>
            </div>
            <div class="info-row">
              <div class="info-cell">
                <span class="info-label">LOTE:</span>
                <input type="text" class="info-input" placeholder="">
              </div>
              <div class="info-cell">
                <span class="info-label">DATA:</span>
                <span class="info-value">${today}</span>
              </div>
              <div class="info-cell">
                <span class="info-label">QUANT. (${product.unit === 'Litros' ? 'Lts' : 'Kg'}):</span>
                <span class="info-value" style="font-weight: bold;">${expectedLiters}</span>
              </div>
            </div>
            <div class="info-row">
              <div class="info-cell">
                <span class="info-label">HORA INÍCIO:</span>
                <input type="text" class="info-input" placeholder="">
              </div>
              <div class="info-cell">
                <span class="info-label">HORA FIM:</span>
                <input type="text" class="info-input" placeholder="">
              </div>
              <div class="info-cell">
                <span class="info-label">OBSERVAÇÕES:</span>
                <input type="text" class="info-input" placeholder="">
              </div>
            </div>
          </div>

          <!-- MATERIALS TABLE -->
          <div class="section-header">📋 Matérias-Primas</div>
          <table class="materials-table">
            <thead>
              <tr>
                <th style="width:4%">CÓD</th>
                <th style="width:22%">MATÉRIAS-PRIMAS</th>
                <th style="width:10%">LOTE</th>
                <th style="width:10%">VALIDADE</th>
                <th style="width:7%">%</th>
                <th style="width:11%">QUANT.(kg)</th>
                <th style="width:9%">CORREÇÃO</th>
                <th style="width:9%">TOTAL</th>
                <th style="width:5%">OBS</th>
              </tr>
            </thead>
            <tbody>
              ${materialRows}
              ${emptyRows}
              <tr class="total-row">
                <td class="cell" colspan="4" style="text-align:right; padding-right:8px;">TOTAL</td>
                <td class="cell center">${totalPercent % 1 === 0 ? totalPercent : totalPercent.toFixed(2)}</td>
                <td class="cell center">${totalQuant % 1 === 0 ? totalQuant : totalQuant.toFixed(2)}</td>
                <td class="cell"></td>
                <td class="cell"></td>
                <td class="cell"></td>
              </tr>
            </tbody>
          </table>

          <!-- PACKAGING SECTION -->
          <div class="section-header">📦 Embalagens</div>
          <table class="pack-table">
            <thead>
              <tr>
                <th style="width:14%">EMBALAGEM</th>
                <th>2L</th>
                <th>5L</th>
                <th>20L</th>
                <th>50L</th>
                <th>TAMBOR</th>
                <th>SOBRA</th>
                <th>PERDA</th>
                <th>%</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="label-cell">Peso Bruto</td>
                <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
              </tr>
              <tr>
                <td class="label-cell">Tara</td>
                <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
              </tr>
              <tr>
                <td class="label-cell">Peso Líquido</td>
                <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
              </tr>
              <tr>
                <td class="label-cell">Quantidade</td>
                <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
              </tr>
              <tr>
                <td class="label-cell">Total (Litros)</td>
                <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
              </tr>
            </tbody>
          </table>

          <!-- SIGNATURE SECTION -->
          <div class="section-header">✍️ Responsáveis</div>
          <table class="sig-table">
            <tr>
              <td class="sig-header" colspan="2">Pesagem</td>
              <td class="sig-header" colspan="2">Preparação</td>
              <td class="sig-header" colspan="2">Envase</td>
            </tr>
            <tr>
              <td class="sig-label">Assinatura:</td><td class="sig-input"></td>
              <td class="sig-label">Assinatura:</td><td class="sig-input"></td>
              <td class="sig-label">Assinatura:</td><td class="sig-input"></td>
            </tr>
            <tr>
              <td class="sig-label">Nome:</td><td class="sig-input"></td>
              <td class="sig-label">Nome:</td><td class="sig-input"></td>
              <td class="sig-label">Nome:</td><td class="sig-input"></td>
            </tr>
            <tr>
              <td class="sig-label">H Início:</td><td class="sig-input"></td>
              <td class="sig-label">H Início:</td><td class="sig-input"></td>
              <td class="sig-label">H Início:</td><td class="sig-input"></td>
            </tr>
            <tr>
              <td class="sig-label">H Término:</td><td class="sig-input"></td>
              <td class="sig-label">H Término:</td><td class="sig-input"></td>
              <td class="sig-label">H Término:</td><td class="sig-input"></td>
            </tr>
            <tr>
              <td class="sig-header" colspan="2">Conferente/Analista</td>
              <td class="sig-label">Assinatura:</td><td class="sig-input"></td>
              <td class="sig-label">Assinatura:</td><td class="sig-input"></td>
            </tr>
            <tr>
              <td colspan="2"></td>
              <td class="sig-label">Nome:</td><td class="sig-input"></td>
              <td class="sig-label">Nome:</td><td class="sig-input"></td>
            </tr>
          </table>

          <!-- FOOTER WITH LOGO -->
          <div class="footer-section">
            <img src="https://customer-assets.emergentagent.com/job_prodman-lumix/artifacts/aod9p9yw_images.png" alt="Logo Lumix">
          </div>

        </div>

        <div class="print-buttons no-print">
          <button class="btn-print" onclick="window.print()">🖨️ Imprimir</button>
          <button class="btn-close" onclick="window.close()">✕ Fechar</button>
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
      className="border-green-300 text-green-700 hover:bg-green-50"
      onClick={handlePrint}
      data-testid="print-op-button"
    >
      <Printer className="w-3 h-3 mr-1" />
      Imprimir OP
    </Button>
  );
};
