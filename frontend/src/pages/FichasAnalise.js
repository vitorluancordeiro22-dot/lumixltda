import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { toast } from 'sonner';
import { ClipboardCopy, X, FlaskConical, Package, Calendar, Hash, ChevronDown, ChevronRight } from 'lucide-react';

export default function FichasAnalise() {
  const [fichas, setFichas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [closingId, setClosingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const fetchFichas = async () => {
    try {
      const response = await api.get('/fichas-analise?status=aberta');
      setFichas(response.data);
    } catch (err) {
      if (err.response?.status === 403) {
        toast.error('Acesso restrito');
      } else {
        toast.error('Erro ao carregar fichas');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchFichas(); }, []);

  const handleClose = async (fichaId, e) => {
    e.stopPropagation();
    setClosingId(fichaId);
    try {
      await api.put(`/fichas-analise/${fichaId}/close`);
      toast.success('Ordem fechada com sucesso');
      setFichas(prev => prev.filter(f => f.id !== fichaId));
    } catch {
      toast.error('Erro ao fechar ordem');
    } finally {
      setClosingId(null);
    }
  };

  const copyToClipboard = (text, e) => {
    e?.stopPropagation();
    navigator.clipboard.writeText(text);
    toast.success('Copiado!');
  };

  // Calcular numeração OP do dia
  // Usa op_number do backend se disponível, senão calcula localmente
  const getOpNumber = (ficha) => {
    if (ficha.op_number) return ficha.op_number;
    const sameDay = fichas
      .filter(f => f.date === ficha.date)
      .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
    return sameDay.findIndex(f => f.id === ficha.id) + 1;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="fichas-analise-page">
      <div>
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-2">Ordem de Produção</h1>
        <p className="text-lg text-muted-foreground">
          {fichas.length > 0
            ? `${fichas.length} ordem${fichas.length > 1 ? 'ns' : ''} aberta${fichas.length > 1 ? 's' : ''}`
            : 'Nenhuma ordem aberta'}
        </p>
      </div>

      {fichas.length === 0 ? (
        <Card className="bg-card border-border p-8 text-center">
          <FlaskConical className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-lg">Nenhuma ordem de produção aberta.</p>
          <p className="text-muted-foreground text-sm mt-1">As ordens são criadas automaticamente ao soltar o primeiro lote de cada produto no mês.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {fichas.map(ficha => {
            const opNum = getOpNumber(ficha);
            const isExpanded = expandedId === ficha.id;
            const dateStr = ficha.date ? new Date(ficha.date + 'T00:00:00').toLocaleDateString('pt-BR') : '-';

            return (
              <Card
                key={ficha.id}
                className="bg-card border-border overflow-hidden transition-all"
                data-testid={`ficha-${ficha.id}`}
              >
                {/* Compact Header - Always visible */}
                <div
                  className="px-4 py-3 flex items-center gap-4 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : ficha.id)}
                >
                  {isExpanded
                    ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  }

                  <span className="text-xs font-bold bg-primary/20 text-primary px-2 py-0.5 rounded flex-shrink-0">
                    OP {opNum}
                  </span>

                  <span className="font-bold text-foreground truncate">{ficha.product_name}</span>

                  <span className="text-sm text-muted-foreground flex-shrink-0 font-mono">{ficha.batch_number}</span>

                  <span className="text-sm text-muted-foreground flex-shrink-0">{dateStr}</span>

                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {ficha.planned_liters} {ficha.unit}
                  </span>

                  <div className="ml-auto flex-shrink-0">
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={(e) => handleClose(ficha.id, e)}
                      disabled={closingId === ficha.id}
                      data-testid={`close-ficha-${ficha.id}`}
                    >
                      <X className="w-3 h-3 mr-1" />
                      {closingId === ficha.id ? '...' : 'Fechar'}
                    </Button>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-t border-border">
                    {/* Info Grid */}
                    <div className="px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-3 bg-muted/10">
                      <div>
                        <span className="text-xs text-muted-foreground block">Data</span>
                        <span className="text-sm font-semibold text-foreground">{dateStr}</span>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground block">Quantidade</span>
                        <span className="text-sm font-semibold text-foreground">{ficha.planned_liters} {ficha.unit}</span>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground block">Receita Base</span>
                        <span className="text-sm font-semibold text-foreground">{ficha.expected_liters} {ficha.unit}</span>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground block">Lote</span>
                        <span className="text-sm font-mono font-semibold text-foreground">{ficha.batch_number}</span>
                      </div>
                    </div>

                    {/* Raw Materials */}
                    <div className="px-4 py-3">
                      <h3 className="text-sm font-bold text-foreground mb-2 flex items-center gap-2">
                        <FlaskConical className="w-4 h-4" />
                        Matérias-Primas Utilizadas
                      </h3>

                      {(!ficha.recipes || ficha.recipes.length === 0) ? (
                        <p className="text-sm text-muted-foreground">Nenhuma matéria-prima registrada.</p>
                      ) : (
                        <div className="space-y-2">
                          {ficha.recipes.map((recipe, idx) => (
                            <div key={idx} className="border border-border rounded-lg p-3 bg-background">
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-semibold text-foreground text-sm">{recipe.raw_material_name}</span>
                                <span className="text-xs text-muted-foreground">{recipe.quantity_needed} {recipe.unit}</span>
                              </div>

                              {recipe.batches_consumed && recipe.batches_consumed.length > 0 && (
                                <div className="space-y-1">
                                  {recipe.batches_consumed.map((batch, bIdx) => (
                                    <div key={bIdx} className="flex flex-wrap items-center gap-2 text-xs bg-muted/30 rounded px-2 py-1.5">
                                      <div className="flex items-center gap-1">
                                        <Hash className="w-3 h-3 text-muted-foreground" />
                                        <span className="text-muted-foreground">Lote:</span>
                                        <span className="font-mono font-semibold text-foreground">{batch.batch_number || '-'}</span>
                                        <button onClick={(e) => copyToClipboard(batch.batch_number || '', e)} className="hover:text-primary">
                                          <ClipboardCopy className="w-3 h-3" />
                                        </button>
                                      </div>

                                      {batch.supplier_batch_number && (
                                        <div className="flex items-center gap-1">
                                          <span className="text-muted-foreground">Forn.:</span>
                                          <span className="font-mono text-foreground">{batch.supplier_batch_number}</span>
                                          <button onClick={(e) => copyToClipboard(batch.supplier_batch_number, e)} className="hover:text-primary">
                                            <ClipboardCopy className="w-3 h-3" />
                                          </button>
                                        </div>
                                      )}

                                      <div className="flex items-center gap-1">
                                        <Calendar className="w-3 h-3 text-muted-foreground" />
                                        <span className="text-muted-foreground">Val.:</span>
                                        <span className="font-semibold text-foreground">
                                          {batch.expiry_date ? new Date(batch.expiry_date + 'T00:00:00').toLocaleDateString('pt-BR') : 'N/I'}
                                        </span>
                                        {batch.expiry_date && (
                                          <button onClick={(e) => copyToClipboard(new Date(batch.expiry_date + 'T00:00:00').toLocaleDateString('pt-BR'), e)} className="hover:text-primary">
                                            <ClipboardCopy className="w-3 h-3" />
                                          </button>
                                        )}
                                      </div>

                                      <span className="text-muted-foreground">
                                        Usado: <span className="text-foreground font-semibold">{batch.quantity_used}</span>
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
