import React from 'react';
import { Button } from './ui/button';
import { Printer } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';

export const ProductPrintButton = ({ product }) => {
  const hasOpModel = product?.file_models?.op_model || product?.file_models?.ficha_analise;

  const handlePrint = async () => {
    if (!hasOpModel) {
      toast.error('Produto não possui modelos (OP ou Ficha) cadastrados.');
      return;
    }

    try {
      // Requisita o PDF gerado pelo backend (ficha + op) e baixa como arquivo
      const response = await api.post(
        `/products/${product.id}/generate-model-pdf`,
        {},
        { responseType: 'blob' }
      );

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Modelos_${product.name}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      toast.success('PDF gerado e enviado para download');
    } catch (err) {
      console.error('Erro ao gerar PDF:', err);
      const message = err?.response?.data?.detail || 'Erro ao gerar PDF do modelo';
      toast.error(message);
    }
  };

  return (
    <Button
      size="sm"
      variant="outline"
      className="border-border text-foreground hover:bg-muted"
      onClick={handlePrint}
      disabled={!hasOpModel}
    >
      <Printer className="w-3 h-3 mr-1" />
      Imprimir
    </Button>
  );
};

export default ProductPrintButton;
