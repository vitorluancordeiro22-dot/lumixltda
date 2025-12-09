import React from 'react';
import { Button } from './ui/button';
import { Printer } from 'lucide-react';
import { toast } from 'sonner';

export const ProductPrintButton = ({ product }) => {
  const hasOpModel = product?.file_models?.op_model;

  const handlePrint = () => {
    if (!hasOpModel) {
      toast.error('Produto não possui modelo de OP cadastrado');
      return;
    }

    // Criar página de impressão com dados do produto
    const printWindow = window.open('', '_blank');
    
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Impressão - ${product.name}</title>
        <style>
          @media print {
            @page { margin: 2cm; }
          }
          body {
            font-family: Arial, sans-serif;
            padding: 20px;
            max-width: 800px;
            margin: 0 auto;
          }
          .header {
            text-align: center;
            border-bottom: 2px solid #333;
            padding-bottom: 20px;
            margin-bottom: 30px;
          }
          .header h1 {
            margin: 0;
            color: #333;
            font-size: 24px;
          }
          .section {
            margin-bottom: 30px;
          }
          .section h2 {
            background-color: #f0f0f0;
            padding: 10px;
            margin-bottom: 15px;
            font-size: 18px;
            border-left: 4px solid #333;
          }
          .info-row {
            display: flex;
            padding: 8px 0;
            border-bottom: 1px solid #e0e0e0;
          }
          .info-label {
            font-weight: bold;
            min-width: 200px;
            color: #555;
          }
          .info-value {
            flex: 1;
            color: #333;
          }
          .recipe-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
          }
          .recipe-table th,
          .recipe-table td {
            border: 1px solid #ddd;
            padding: 10px;
            text-align: left;
          }
          .recipe-table th {
            background-color: #f5f5f5;
            font-weight: bold;
          }
          .footer {
            margin-top: 50px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            text-align: center;
            color: #666;
            font-size: 12px;
          }
          .signature-section {
            margin-top: 60px;
            display: flex;
            justify-content: space-around;
          }
          .signature-box {
            text-align: center;
            flex: 1;
            margin: 0 20px;
          }
          .signature-line {
            border-top: 1px solid #333;
            margin-top: 60px;
            padding-top: 5px;
          }
          @media print {
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>FICHA TÉCNICA DO PRODUTO</h1>
          <p>Data de Impressão: ${new Date().toLocaleString('pt-BR')}</p>
        </div>

        <div class="section">
          <h2>Informações do Produto</h2>
          <div class="info-row">
            <div class="info-label">Nome do Produto:</div>
            <div class="info-value">${product.name}</div>
          </div>
          ${product.code ? `
          <div class="info-row">
            <div class="info-label">Código:</div>
            <div class="info-value">${product.code}</div>
          </div>
          ` : ''}
          <div class="info-row">
            <div class="info-label">Unidade:</div>
            <div class="info-value">${product.unit}</div>
          </div>
          <div class="info-row">
            <div class="info-label">Lote Padrão Esperado:</div>
            <div class="info-value">${product.expected_liters} ${product.unit}</div>
          </div>
        </div>

        ${product.recipes && product.recipes.length > 0 ? `
        <div class="section">
          <h2>Receita / Formulação</h2>
          <table class="recipe-table">
            <thead>
              <tr>
                <th>Matéria-Prima</th>
                <th>Quantidade por ${product.unit === 'Litros' ? 'Litro' : 'Kg'}</th>
                <th>Unidade</th>
              </tr>
            </thead>
            <tbody>
              ${product.recipes.map(recipe => `
                <tr>
                  <td>MP ID: ${recipe.raw_material_id}</td>
                  <td>${recipe.quantity_per_liter}</td>
                  <td>${recipe.unit || 'L'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ` : ''}

        <div class="section">
          <h2>Informações do Arquivo Modelo</h2>
          <div class="info-row">
            <div class="info-label">Arquivo Modelo de OP:</div>
            <div class="info-value">${product.file_models.op_model.filename}</div>
          </div>
          <div class="info-row">
            <div class="info-label">Versão:</div>
            <div class="info-value">v${product.file_models.op_model.version}</div>
          </div>
          <div class="info-row">
            <div class="info-label">Data de Upload:</div>
            <div class="info-value">${new Date(product.file_models.op_model.uploaded_at).toLocaleString('pt-BR')}</div>
          </div>
        </div>

        ${product.file_models.ficha_analise ? `
        <div class="section">
          <h2>Ficha de Análise</h2>
          <div class="info-row">
            <div class="info-label">Arquivo:</div>
            <div class="info-value">${product.file_models.ficha_analise.filename}</div>
          </div>
          <div class="info-row">
            <div class="info-label">Versão:</div>
            <div class="info-value">v${product.file_models.ficha_analise.version}</div>
          </div>
        </div>
        ` : ''}

        <div class="signature-section">
          <div class="signature-box">
            <div class="signature-line">Responsável pela Produção</div>
          </div>
          <div class="signature-box">
            <div class="signature-line">Supervisor de Qualidade</div>
          </div>
        </div>

        <div class="footer">
          <p>Este documento foi gerado automaticamente pelo Sistema Lumix</p>
          <p>Produto ID: ${product.id}</p>
        </div>

        <div style="margin-top: 30px; text-align: center;">
          <button 
            onclick="window.print()" 
            style="padding: 12px 24px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px;"
          >
            🖨️ Imprimir Documento
          </button>
          <button 
            onclick="window.close()" 
            style="padding: 12px 24px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; margin-left: 10px;"
          >
            ✖ Fechar
          </button>
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();

    toast.success('Documento de impressão aberto em nova aba');
  };

  return (
    <Button
      size="sm"
      variant="outline"
      className="border-slate-700 text-white hover:bg-slate-800"
      onClick={handlePrint}
      disabled={!hasOpModel}
    >
      <Printer className="w-3 h-3 mr-1" />
      Imprimir
    </Button>
  );
};
