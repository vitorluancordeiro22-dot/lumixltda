import React, { useState, useEffect, useMemo, useRef } from 'react';
import api from '../lib/api';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Card } from './ui/card';
import { Label } from './ui/label';
import { FileText, Download, Loader2, Calendar, Package, Upload, Trash2, CheckCircle2, Info } from 'lucide-react';
import { toast } from 'sonner';

const formatBR = (iso) => {
  if (!iso) return '-';
  const s = String(iso).split('T')[0].split('-');
  return s.length === 3 ? `${s[2]}/${s[1]}/${s[0]}` : iso;
};

/**
 * Botão "Gerar Documentação" — abre modal listando lotes do produto e permite
 * baixar/visualizar a Ficha de Fabricação (DOCX/PDF) e a Ordem de Produção (XLS/PDF).
 *
 * Props:
 *   productId (string) — id do produto selecionado
 *   productName (string) — nome do produto (para feedback visual)
 */
export default function DocumentationButton({ productId, productName }) {
  const [open, setOpen] = useState(false);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState(null);
  const [generating, setGenerating] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  // Template personalizado
  const [templateStatus, setTemplateStatus] = useState(null); // {has_custom, filename, uploaded_at}
  const [opTemplateStatus, setOpTemplateStatus] = useState(null);
  const [uploadingTpl, setUploadingTpl] = useState(false);
  const [uploadingOpTpl, setUploadingOpTpl] = useState(false);
  const fileInputRef = useRef(null);
  const opFileInputRef = useRef(null);

  const fetchTemplateStatus = async () => {
    if (!productId) return;
    try {
      const [r1, r2] = await Promise.all([
        api.get(`/products/${productId}/ficha-template`),
        api.get(`/products/${productId}/op-template`),
      ]);
      setTemplateStatus(r1.data);
      setOpTemplateStatus(r2.data);
    } catch (e) {
      setTemplateStatus({ has_custom: false });
      setOpTemplateStatus({ has_custom: false });
    }
  };

  useEffect(() => {
    if (!open || !productId) return;
    fetchTemplateStatus();
    setLoading(true);
    Promise.all([
      api.get('/product-batches'),
      api.get('/archive/all-product-batches').catch(() => ({ data: [] }))
    ])
      .then(([a, b]) => {
        const activeIds = new Set((a.data || []).map(x => x.id));
        const archivedOnly = (b.data || []).filter(x => !activeIds.has(x.id));
        const all = [...(a.data || []), ...archivedOnly]
          .filter(bt => bt.product_id === productId)
          .sort((x, y) => String(y.date || '').localeCompare(String(x.date || '')));
        setBatches(all);
        if (all.length > 0) setSelectedBatchId(all[0].id);
      })
      .catch(() => toast.error('Erro ao carregar lotes'))
      .finally(() => setLoading(false));
  }, [open, productId]);

  // Carrega preview quando lote muda
  useEffect(() => {
    if (!selectedBatchId) {
      setPreviewData(null);
      return;
    }
    api.get(`/documentation/${selectedBatchId}/preview-data`)
      .then(r => setPreviewData(r.data))
      .catch(() => setPreviewData(null));
  }, [selectedBatchId]);

  const downloadFile = async (docType, fmt) => {
    if (!selectedBatchId) {
      toast.error('Selecione um lote primeiro');
      return;
    }
    const key = `${docType}-${fmt}`;
    setGenerating(key);
    try {
      const res = await api.get(`/documentation/${selectedBatchId}/${docType}?fmt=${fmt}`, {
        responseType: 'blob'
      });
      const ext = fmt === 'pdf' ? 'pdf' : (docType === 'ficha' ? 'docx' : 'xls');
      const label = docType === 'ficha' ? 'Ficha' : 'OP';
      const safe = (productName || 'produto').replace(/[^a-zA-Z0-9_-]+/g, '_');
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${label}_${safe}_${previewData?.lote_number || 'lote'}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success(`${label} (${fmt.toUpperCase()}) gerada com sucesso`);
    } catch (err) {
      const detail = err.response?.data?.detail || 'Erro ao gerar documento';
      toast.error(detail);
    } finally {
      setGenerating(null);
    }
  };

  const openPreviewInTab = async (docType) => {
    if (!selectedBatchId) return;
    const key = `${docType}-preview`;
    setGenerating(key);
    try {
      const res = await api.get(`/documentation/${selectedBatchId}/${docType}?fmt=pdf`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(res.data);
      window.open(url, '_blank');
      // url será revogada quando a aba fechar — não revogamos imediatamente
    } catch (err) {
      const detail = err.response?.data?.detail || 'Erro ao abrir preview';
      toast.error(detail);
    } finally {
      setGenerating(null);
    }
  };

  const sel = useMemo(() => batches.find(b => b.id === selectedBatchId), [batches, selectedBatchId]);

  const handleUploadTemplate = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.docx')) {
      toast.error('Apenas arquivos .docx são aceitos');
      return;
    }
    setUploadingTpl(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await api.post(`/products/${productId}/ficha-template`, form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success(r.data.message || 'Template enviado!');
      await fetchTemplateStatus();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao enviar template');
    } finally {
      setUploadingTpl(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveTemplate = async () => {
    if (!window.confirm('Remover o template personalizado? O sistema voltará a usar o template padrão.')) return;
    try {
      await api.delete(`/products/${productId}/ficha-template`);
      toast.success('Template removido');
      await fetchTemplateStatus();
    } catch (err) {
      toast.error('Erro ao remover template');
    }
  };

  const handleUploadOpTemplate = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.xls')) {
      toast.error('Apenas arquivos .xls são aceitos');
      return;
    }
    setUploadingOpTpl(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await api.post(`/products/${productId}/op-template`, form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success(r.data.message || 'Template de OP enviado!');
      await fetchTemplateStatus();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao enviar template de OP');
    } finally {
      setUploadingOpTpl(false);
      if (opFileInputRef.current) opFileInputRef.current.value = '';
    }
  };

  const handleRemoveOpTemplate = async () => {
    if (!window.confirm('Remover o template de OP personalizado? O sistema voltará a usar o template padrão.')) return;
    try {
      await api.delete(`/products/${productId}/op-template`);
      toast.success('Template de OP removido');
      await fetchTemplateStatus();
    } catch (err) {
      toast.error('Erro ao remover template');
    }
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        variant="default"
        className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl shadow-soft"
        data-testid="generate-documentation-btn"
      >
        <FileText className="w-4 h-4 mr-2" />
        Gerar Documentação
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Gerar Documentação — {productName}
            </DialogTitle>
          </DialogHeader>

          {loading ? (
            <div className="py-10 text-center text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando lotes...
            </div>
          ) : batches.length === 0 ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Card className={`p-3.5 rounded-xl border ${templateStatus?.has_custom ? 'border-secondary/40 bg-secondary/5' : 'border-border bg-muted/30'}`}>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Template Ficha (.docx)</p>
                  <p className="text-xs text-foreground font-semibold mt-0.5 truncate">
                    {templateStatus?.has_custom ? <><span className="text-secondary">Personalizado:</span> <span className="font-mono text-[11px]">{templateStatus.filename}</span></> : 'Padrão (CITRONELA GEL)'}
                  </p>
                  <div className="flex gap-1.5 mt-2">
                    <input ref={fileInputRef} type="file" accept=".docx" onChange={handleUploadTemplate} className="hidden" />
                    <Button size="sm" variant="outline" className="border-border h-7 rounded-lg text-[11px] flex-1" disabled={uploadingTpl} onClick={() => fileInputRef.current?.click()}>
                      {uploadingTpl ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Upload className="w-3 h-3 mr-1" /> {templateStatus?.has_custom ? 'Trocar' : 'Enviar'}</>}
                    </Button>
                    {templateStatus?.has_custom && <Button size="sm" variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10 h-7 rounded-lg" onClick={handleRemoveTemplate}><Trash2 className="w-3 h-3" /></Button>}
                  </div>
                </Card>
                <Card className={`p-3.5 rounded-xl border ${opTemplateStatus?.has_custom ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/30'}`}>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Template OP (.xls)</p>
                  <p className="text-xs text-foreground font-semibold mt-0.5 truncate">
                    {opTemplateStatus?.has_custom ? <><span className="text-primary">Personalizado:</span> <span className="font-mono text-[11px]">{opTemplateStatus.filename}</span></> : 'Padrão (mantém % e Kg do sistema)'}
                  </p>
                  <div className="flex gap-1.5 mt-2">
                    <input ref={opFileInputRef} type="file" accept=".xls" onChange={handleUploadOpTemplate} className="hidden" />
                    <Button size="sm" variant="outline" className="border-border h-7 rounded-lg text-[11px] flex-1" disabled={uploadingOpTpl} onClick={() => opFileInputRef.current?.click()}>
                      {uploadingOpTpl ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Upload className="w-3 h-3 mr-1" /> {opTemplateStatus?.has_custom ? 'Trocar' : 'Enviar'}</>}
                    </Button>
                    {opTemplateStatus?.has_custom && <Button size="sm" variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10 h-7 rounded-lg" onClick={handleRemoveOpTemplate}><Trash2 className="w-3 h-3" /></Button>}
                  </div>
                </Card>
              </div>
              <div className="py-6 text-center">
                <Package className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                <p className="text-foreground font-semibold">Nenhum lote encontrado</p>
                <p className="text-sm text-muted-foreground">Crie um lote desse produto para gerar a documentação.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* TEMPLATES: Ficha + OP */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* FICHA TEMPLATE */}
                <Card className={`p-3.5 rounded-xl border ${
                  templateStatus?.has_custom ? 'border-secondary/40 bg-secondary/5' : 'border-border bg-muted/30'
                }`}>
                  <div className="flex items-start gap-2">
                    {templateStatus?.has_custom ? <CheckCircle2 className="w-4 h-4 text-secondary shrink-0 mt-0.5" /> : <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Template Ficha (.docx)</p>
                      {templateStatus?.has_custom ? (
                        <p className="text-xs text-foreground font-semibold mt-0.5 truncate" data-testid="template-status">
                          <span className="text-secondary">Personalizado:</span> <span className="font-mono text-[11px]">{templateStatus.filename}</span>
                        </p>
                      ) : (
                        <p className="text-xs text-foreground font-semibold mt-0.5">Padrão (CITRONELA GEL)</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1.5 mt-2">
                    <input ref={fileInputRef} type="file" accept=".docx" onChange={handleUploadTemplate} className="hidden" data-testid="upload-template-input" />
                    <Button size="sm" variant="outline" className="border-border h-7 rounded-lg text-[11px] flex-1" disabled={uploadingTpl} onClick={() => fileInputRef.current?.click()} data-testid="upload-template-btn">
                      {uploadingTpl ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Upload className="w-3 h-3 mr-1" /> {templateStatus?.has_custom ? 'Trocar' : 'Enviar'}</>}
                    </Button>
                    {templateStatus?.has_custom && (
                      <Button size="sm" variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10 h-7 rounded-lg" onClick={handleRemoveTemplate} data-testid="remove-template-btn">
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </Card>

                {/* OP TEMPLATE */}
                <Card className={`p-3.5 rounded-xl border ${
                  opTemplateStatus?.has_custom ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/30'
                }`}>
                  <div className="flex items-start gap-2">
                    {opTemplateStatus?.has_custom ? <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" /> : <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Template OP (.xls)</p>
                      {opTemplateStatus?.has_custom ? (
                        <p className="text-xs text-foreground font-semibold mt-0.5 truncate" data-testid="op-template-status">
                          <span className="text-primary">Personalizado:</span> <span className="font-mono text-[11px]">{opTemplateStatus.filename}</span>
                        </p>
                      ) : (
                        <p className="text-xs text-foreground font-semibold mt-0.5">Padrão (mantém % e Kg do sistema)</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1.5 mt-2">
                    <input ref={opFileInputRef} type="file" accept=".xls" onChange={handleUploadOpTemplate} className="hidden" data-testid="upload-op-template-input" />
                    <Button size="sm" variant="outline" className="border-border h-7 rounded-lg text-[11px] flex-1" disabled={uploadingOpTpl} onClick={() => opFileInputRef.current?.click()} data-testid="upload-op-template-btn">
                      {uploadingOpTpl ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Upload className="w-3 h-3 mr-1" /> {opTemplateStatus?.has_custom ? 'Trocar' : 'Enviar'}</>}
                    </Button>
                    {opTemplateStatus?.has_custom && (
                      <Button size="sm" variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10 h-7 rounded-lg" onClick={handleRemoveOpTemplate} data-testid="remove-op-template-btn">
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </Card>
              </div>

              {/* Seleção de lote */}
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                  Selecione o lote
                </Label>
                <div className="space-y-1.5 mt-2 max-h-44 overflow-y-auto pr-1">
                  {batches.map(b => {
                    const isSel = b.id === selectedBatchId;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setSelectedBatchId(b.id)}
                        data-testid={`select-batch-${b.id}`}
                        className={`w-full flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-left transition-all ${
                          isSel
                            ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                            : 'border-border bg-card hover:border-primary/40 hover:bg-muted/50'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground font-mono">{b.batch_number || '-'}</p>
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Calendar className="w-3 h-3" /> Fab: {formatBR(b.date)}
                            {b.planned_liters ? ` · ${b.planned_liters}L planejados` : ''}
                          </p>
                        </div>
                        {isSel && <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Selecionado</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Preview dos dados */}
              {previewData && (
                <Card className="bg-muted/40 border-border p-4 rounded-xl">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Dados que serão impressos</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                    <div><span className="text-muted-foreground">Produto:</span> <span className="text-foreground font-semibold">{previewData.product_name}</span></div>
                    <div><span className="text-muted-foreground">OP Nº:</span> <span className="text-foreground font-mono">{previewData.op_number || '-'}</span></div>
                    <div><span className="text-muted-foreground">Lote:</span> <span className="text-foreground font-mono">{previewData.lote_number || '-'}</span></div>
                    <div><span className="text-muted-foreground">Data Fab:</span> <span className="text-foreground">{previewData.fab_date || '-'}</span></div>
                    <div className="col-span-2"><span className="text-muted-foreground">Matérias-primas:</span> <span className="text-foreground font-semibold">{previewData.materials?.length || 0} item(s)</span></div>
                  </div>
                </Card>
              )}

              {/* Ações */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                {/* FICHA DE FABRICAÇÃO */}
                <Card className="border-border rounded-xl p-4 space-y-2.5 hover-lift">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center">
                      <FileText className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground text-sm">Ficha de Fabricação</p>
                      <p className="text-[11px] text-muted-foreground">Processo / Controle de Qualidade</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <Button size="sm" variant="default" className="bg-primary hover:bg-primary/90 col-span-1 rounded-lg h-9"
                      onClick={() => openPreviewInTab('ficha')}
                      disabled={!!generating || !selectedBatchId}
                      data-testid="ficha-preview-btn">
                      {generating === 'ficha-preview' ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Ver'}
                    </Button>
                    <Button size="sm" variant="outline" className="border-border rounded-lg h-9 col-span-1 text-xs"
                      onClick={() => downloadFile('ficha', 'pdf')}
                      disabled={!!generating || !selectedBatchId}
                      data-testid="ficha-pdf-btn">
                      {generating === 'ficha-pdf' ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Download className="w-3 h-3 mr-1" /> PDF</>}
                    </Button>
                    <Button size="sm" variant="outline" className="border-border rounded-lg h-9 col-span-1 text-xs"
                      onClick={() => downloadFile('ficha', 'native')}
                      disabled={!!generating || !selectedBatchId}
                      data-testid="ficha-docx-btn">
                      {generating === 'ficha-native' ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Download className="w-3 h-3 mr-1" /> DOCX</>}
                    </Button>
                  </div>
                </Card>

                {/* ORDEM DE PRODUÇÃO */}
                <Card className="border-border rounded-xl p-4 space-y-2.5 hover-lift">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-lg bg-secondary/10 ring-1 ring-secondary/20 flex items-center justify-center">
                      <Package className="w-4 h-4 text-secondary" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground text-sm">Ordem de Produção</p>
                      <p className="text-[11px] text-muted-foreground">Fórmula / Matérias-primas</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <Button size="sm" variant="default" className="bg-secondary hover:bg-secondary/90 text-secondary-foreground col-span-1 rounded-lg h-9"
                      onClick={() => openPreviewInTab('op')}
                      disabled={!!generating || !selectedBatchId}
                      data-testid="op-preview-btn">
                      {generating === 'op-preview' ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Ver'}
                    </Button>
                    <Button size="sm" variant="outline" className="border-border rounded-lg h-9 col-span-1 text-xs"
                      onClick={() => downloadFile('op', 'pdf')}
                      disabled={!!generating || !selectedBatchId}
                      data-testid="op-pdf-btn">
                      {generating === 'op-pdf' ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Download className="w-3 h-3 mr-1" /> PDF</>}
                    </Button>
                    <Button size="sm" variant="outline" className="border-border rounded-lg h-9 col-span-1 text-xs"
                      onClick={() => downloadFile('op', 'native')}
                      disabled={!!generating || !selectedBatchId}
                      data-testid="op-xls-btn">
                      {generating === 'op-native' ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Download className="w-3 h-3 mr-1" /> XLS</>}
                    </Button>
                  </div>
                </Card>
              </div>

              <p className="text-[11px] text-muted-foreground text-center pt-1">
                Para imprimir, clique em <span className="font-semibold text-foreground">Ver</span> e use Ctrl+P no PDF aberto.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
