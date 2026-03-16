import React from 'react';
import { Button } from './ui/button';
import { FileText } from 'lucide-react';
import { toast } from 'sonner';

export const ProductPrintFichaButton = ({ product }) => {
  const handlePrint = () => {
    if (!product) {
      toast.error('Produto não encontrado');
      return;
    }

    const printWindow = window.open('', '_blank');
    const today = new Date().toLocaleDateString('pt-BR');

    // Build one analysis block (6 rows: Aspecto, Cor, Odor, pH, Viscosidade, Correção)
    const buildAnalysisBlock = () => {
      const analyses = [
        { name: 'Aspecto', spec: '' },
        { name: 'Cor', spec: '' },
        { name: 'Odor', spec: '' },
        { name: 'pH', spec: '' },
        { name: 'Viscosidade', spec: '' },
        { name: 'Correção:', spec: '', isCorrection: true },
      ];

      return analyses.map(a => {
        if (a.isCorrection) {
          return `
            <tr>
              <td class="sample-cell" rowspan="1">AMOSTRA<br>HORA:<br><br>DATA:</td>
              <td class="analysis-cell">${a.name}</td>
              <td class="spec-cell">${a.name}</td>
              <td class="result-cell">${a.name}</td>
              <td class="auth-cell">AUTORIZADO O ENVASE<br>HORA:<br>DATA: _______________<br>ANALISTA:</td>
            </tr>
          `;
        }
        return `
          <tr>
            <td class="sample-cell" rowspan="1">AMOSTRA<br>HORA:<br><br>DATA:</td>
            <td class="analysis-cell">${a.name}</td>
            <td class="spec-cell"></td>
            <td class="result-cell"></td>
            <td class="auth-cell">AUTORIZADO O ENVASE<br>HORA:<br>DATA: _______________<br>ANALISTA:</td>
          </tr>
        `;
      }).join('');
    };

    // 4 repeating blocks
    const allBlocks = [1, 2, 3, 4].map(() => buildAnalysisBlock()).join('');

    // Final analysis rows
    const finalRows = [
      { name: 'Aspecto', spec: '' },
      { name: 'Cor', spec: '' },
      { name: 'pH', spec: '' },
      { name: 'Viscosidade', spec: '' },
      { name: 'Massa específica', spec: '' },
    ].map(a => `
      <tr>
        <td class="sample-cell">HORA:<br><br>DATA:</td>
        <td class="analysis-cell">${a.name}</td>
        <td class="spec-cell"></td>
        <td class="result-cell"></td>
        <td class="result-cell"></td>
      </tr>
    `).join('');

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Ficha - ${product.name}</title>
        <style>
          @media print {
            @page { margin: 8mm; size: A4 portrait; }
            .no-print { display: none !important; }
          }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: Arial, sans-serif;
            font-size: 9pt;
            padding: 8mm;
          }
          .container {
            width: 100%;
            max-width: 210mm;
            margin: 0 auto;
          }

          /* HEADER */
          .main-title {
            font-size: 12pt;
            font-weight: bold;
            text-align: center;
            margin-bottom: 6px;
            border: 2px solid #000;
            padding: 6px;
            background-color: #f0f0f0;
          }
          .info-line {
            font-size: 10pt;
            margin-bottom: 3px;
            padding: 3px 0;
          }
          .info-line b { font-weight: bold; }

          /* PROCESS SECTION */
          .process-title {
            font-size: 11pt;
            font-weight: bold;
            text-align: center;
            margin: 10px 0 6px 0;
            border: 2px solid #000;
            padding: 4px;
            background-color: #f0f0f0;
          }
          .process-steps {
            padding: 4px 0 4px 10px;
            font-size: 9pt;
            line-height: 1.5;
            min-height: 60px;
            border: 1px solid #ccc;
            margin-bottom: 6px;
          }
          .process-steps li {
            margin-bottom: 2px;
          }

          /* QC TABLE */
          .qc-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 0;
          }
          .qc-table th, .qc-table td {
            border: 1px solid #000;
            padding: 2px 4px;
            font-size: 8pt;
            vertical-align: top;
          }
          .qc-header {
            background-color: #f0f0f0;
            font-weight: bold;
            text-align: center;
            font-size: 9pt;
            padding: 4px;
          }
          .sub-header {
            background-color: #fafafa;
            font-weight: bold;
            text-align: center;
            font-size: 8pt;
          }
          .sample-cell {
            width: 14%;
            font-size: 8pt;
            text-align: center;
            height: 40px;
          }
          .analysis-cell {
            width: 14%;
            font-weight: bold;
            font-size: 8pt;
          }
          .spec-cell {
            width: 16%;
            font-size: 8pt;
            text-align: center;
          }
          .result-cell {
            width: 16%;
            font-size: 8pt;
            text-align: center;
          }
          .auth-cell {
            width: 40%;
            font-size: 7pt;
            text-align: center;
          }

          /* FINAL ANALYSIS */
          .final-header {
            background-color: #e8e8e8;
            font-weight: bold;
            text-align: center;
            font-size: 9pt;
            padding: 4px;
          }

          /* OBSERVATIONS */
          .obs-table {
            width: 100%;
            border-collapse: collapse;
          }
          .obs-table td {
            border: 1px solid #000;
            padding: 4px;
            font-size: 8pt;
            vertical-align: top;
            height: 60px;
            width: 20%;
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
        <div class="container">

          <!-- HEADER -->
          <div class="main-title">FICHA DE FABRICA&Ccedil;&Atilde;O &ndash; PROCESSO/CONTROLE DA QUALIDADE</div>
          <div class="info-line">
            <b>ORDEM DE PRODU&Ccedil;&Atilde;O N&ordm;:</b> ______ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
            <b>DATA:</b> ${today}
          </div>
          <div class="info-line">
            <b>PRODUTO:</b> ${product.name.toUpperCase()} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
            <b>LOTE N&ordm;:</b> ______________
          </div>

          <!-- PROCESS -->
          <div class="process-title">PROCESSO DE FABRICA&Ccedil;&Atilde;O</div>
          <div class="process-steps">
            <ol>
              <li>_____________________________________________</li>
              <li>_____________________________________________</li>
              <li>_____________________________________________</li>
              <li>_____________________________________________</li>
              <li>_____________________________________________</li>
              <li>_____________________________________________</li>
              <li>Efetuar a amostragem e encaminhar ao Laborat&oacute;rio;</li>
              <li>Efetuar as corre&ccedil;&otilde;es, se estipuladas;</li>
              <li>Aguardar autoriza&ccedil;&atilde;o do laborat&oacute;rio para iniciar o envase.</li>
            </ol>
          </div>

          <!-- QC TABLE -->
          <table class="qc-table">
            <tr>
              <td colspan="5" class="qc-header">CONTROLE DE QUALIDADE INTEROPERACIONAL</td>
            </tr>
            <tr>
              <td class="sub-header"></td>
              <td class="sub-header">AN&Aacute;LISES</td>
              <td class="sub-header">ESPECIFICA&Ccedil;&Otilde;ES</td>
              <td class="sub-header">RESULTADOS</td>
              <td class="sub-header"></td>
            </tr>
            ${allBlocks}

            <!-- FINAL ANALYSIS -->
            <tr>
              <td colspan="5" class="final-header">AN&Aacute;LISE FINAL &ndash; AP&Oacute;S 24H DA FABRICA&Ccedil;&Atilde;O</td>
            </tr>
            ${finalRows}
          </table>

          <!-- OBSERVATIONS -->
          <table class="obs-table">
            <tr>
              <td>Observa&ccedil;&otilde;es:<br><br><br><br>_______________________<br>Resp. T&eacute;cnico</td>
              <td>Observa&ccedil;&otilde;es:<br><br><br><br>_______________________<br>Resp. T&eacute;cnico</td>
              <td>Observa&ccedil;&otilde;es:<br><br><br><br>_______________________<br>Resp. T&eacute;cnico</td>
              <td>Observa&ccedil;&otilde;es:<br><br><br><br>_______________________<br>Resp. T&eacute;cnico</td>
              <td>Observa&ccedil;&otilde;es:<br><br><br><br>_______________________<br>Resp. T&eacute;cnico</td>
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
    toast.success('Ficha de Análise aberta para impressão');
  };

  return (
    <Button
      size="sm"
      variant="outline"
      className="border-border text-foreground hover:bg-muted"
      onClick={handlePrint}
      data-testid="print-ficha-button"
    >
      <FileText className="w-3 h-3 mr-1" />
      Imprimir Ficha
    </Button>
  );
};
