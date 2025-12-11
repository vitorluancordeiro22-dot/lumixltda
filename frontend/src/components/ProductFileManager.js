import React, { useState } from 'react';
import api from '../lib/api';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { toast } from 'sonner';
import { Upload, FileText, Download, CheckCircle, AlertCircle } from 'lucide-react';

export const ProductFileManager = ({ product, onUpdate }) => {
  const [uploading, setUploading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const isMountedRef = React.useRef(true);
  
  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fileTypes = [
    { key: 'op_model', label: 'Modelo de OP', required: true },
    { key: 'ficha_analise', label: 'Ficha de Análise', required: false }
  ];

  const hasFile = (fileType) => {
    return product.file_models && product.file_models[fileType];
  };

  const handleFileUpload = async (fileType, file) => {
    if (!file || !isMountedRef.current) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('file_type', fileType);

      await api.post(
        `/products/${product.id}/upload-model?file_type=${fileType}`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      if (!isMountedRef.current) return;
      
      toast.success('Arquivo enviado com sucesso!');
      if (onUpdate) {
        setTimeout(() => {
          if (isMountedRef.current) onUpdate();
        }, 300);
      }
    } catch (error) {
      if (!isMountedRef.current) return;
      
      const errorMsg = error.response?.data?.detail || 'Erro ao enviar arquivo';
      toast.error(errorMsg);
    } finally {
      if (isMountedRef.current) {
        setUploading(false);
      }
    }
  };

  const handleFileDownload = async (fileType) => {
    if (!isMountedRef.current) return;
    
    try {
      const response = await api.get(
        `/products/${product.id}/download-model/${fileType}`,
        { responseType: 'blob' }
      );

      if (!isMountedRef.current) return;

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${product.name}_${fileType}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();

      if (isMountedRef.current) {
        toast.success('Download iniciado!');
      }
    } catch (error) {
      if (isMountedRef.current) {
        toast.error('Erro ao baixar arquivo');
      }
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="border-border text-foreground hover:bg-muted"
        onClick={() => setDialogOpen(true)}
      >
        <FileText className="w-3 h-3 mr-1" />
        Arquivos Modelo
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              Arquivos Modelo - {product.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {fileTypes.map((type) => (
              <div
                key={type.key}
                className="p-4 bg-muted rounded-lg border border-border"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Label className="text-foreground font-medium">{type.label}</Label>
                      {type.required && (
                        <span className="text-red-400 text-xs">* Obrigatório</span>
                      )}
                    </div>
                    {hasFile(type.key) && (
                      <div className="flex items-center gap-2 mt-1">
                        <CheckCircle className="w-4 h-4 text-green-400" />
                        <span className="text-green-400 text-sm">
                          Arquivo enviado (v{product.file_models[type.key].version})
                        </span>
                      </div>
                    )}
                    {!hasFile(type.key) && type.required && (
                      <div className="flex items-center gap-2 mt-1">
                        <AlertCircle className="w-4 h-4 text-yellow-400" />
                        <span className="text-yellow-400 text-sm">
                          Arquivo não enviado
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <label className="flex-1">
                    <input
                      type="file"
                      accept=".docx,.xlsx,.xls,.pdf"
                      onChange={(e) => {
                        if (e.target.files[0]) {
                          handleFileUpload(type.key, e.target.files[0]);
                        }
                      }}
                      className="hidden"
                      disabled={uploading}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full border-border text-foreground hover:bg-muted"
                      disabled={uploading}
                      onClick={(e) => {
                        e.preventDefault();
                        e.currentTarget.previousElementSibling.click();
                      }}
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      {hasFile(type.key) ? 'Atualizar Arquivo' : 'Enviar Arquivo'}
                    </Button>
                  </label>

                  {hasFile(type.key) && (
                    <Button
                      variant="outline"
                      className="border-border text-foreground hover:bg-muted"
                      onClick={() => handleFileDownload(type.key)}
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                  )}
                </div>

                {hasFile(type.key) && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    <p>Arquivo: {product.file_models[type.key].filename}</p>
                    <p>Enviado em: {new Date(product.file_models[type.key].uploaded_at).toLocaleString('pt-BR')}</p>
                  </div>
                )}
              </div>
            ))}

            <div className="p-3 bg-blue-900/20 border border-blue-700/50 rounded-lg">
              <p className="text-blue-300 text-sm">
                <strong>Formatos aceitos:</strong> .docx, .xlsx, .xls, .pdf
              </p>
              <p className="text-blue-300 text-sm mt-1">
                <strong>Importante:</strong> O modelo de OP é obrigatório para criar Ordens de Produção Industrial.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
