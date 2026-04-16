import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { toast } from 'sonner';
import { ClipboardCopy, X, FlaskConical, Package, Calendar, Hash } from 'lucide-react';

export default function FichasAnalise() {
  const [fichas, setFichas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [closingId, setClosingId] = useState(null);

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

  const handleClose = async (fichaId) => {
    setClosingId(fichaId);
    try {
      await api.put(`/fichas-analise/${fichaId}/close`);
      toast.success('Ficha fechada com sucesso');
      setFichas(prev => prev.filter(f => f.id !== fichaId));
    } catch {
      toast.error('Erro ao fechar ficha');
    } finally {
      setClosingId(null);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado!');
  };

  const monthNames = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

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
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-2">Fichas de Análises</h1>
        <p className="text-lg text-muted-foreground">Controle de qualidade — primeiro lote de cada produto no mês</p>
      </div>

      {fichas.length === 0 ? (
        <Card className="bg-card border-border p-8 text-center">
          <FlaskConical className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-lg">Nenhuma ficha de análise aberta no momento.</p>
          <p className="text-muted-foreground text-sm mt-1">As fichas são criadas automaticamente ao soltar o primeiro lote de cada produto no mês.</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {fichas.map(ficha => (
            <Card key={ficha.id} className="bg-card border-border overflow-hidden" data-testid={`ficha-${ficha.id}`}>
              {/* Header */}
              <div className="bg-muted/50 px-6 py-4 flex items-center justify-between border-b border-border">
                <div className="flex items-center gap-3">
                  <Package className="w-5 h-5 text-primary" />
                  <div>
                    <h2 className="text-xl font-bold text-foreground">{ficha.product_name}</h2>
                    <p className="text-sm text-muted-foreground">
                      {monthNames[ficha.month]} {ficha.year} — Lote: <span className="font-mono font-semibold">{ficha.batch_number}</span>
                    </p>
                  </div>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleClose(ficha.id)}
                  disabled={closingId === ficha.id}
                  data-testid={`close-ficha-${ficha.id}`}
                >
                  <X className="w-4 h-4 mr-1" />
                  {closingId === ficha.id ? 'Fechando...' : 'Fechar Ficha'}
                </Button>
              </div>

              {/* Info */}
              <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-4 border-b border-border bg-muted/20">
                <div>
                  <span className="text-xs text-muted-foreground block">Data</span>
                  <span className="text-sm font-semibold text-foreground">
                    {ficha.date ? new Date(ficha.date + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Quantidade Planejada</span>
                  <span className="text-sm font-semibold text-foreground">
                    {ficha.planned_liters} {ficha.unit}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Receita Base</span>
                  <span className="text-sm font-semibold text-foreground">
                    {ficha.expected_liters} {ficha.unit}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Lote do Produto</span>
                  <span className="text-sm font-mono font-semibold text-foreground">{ficha.batch_number}</span>
                </div>
              </div>

              {/* Recipe / Raw Materials */}
              <div className="px-6 py-4">
                <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                  <FlaskConical className="w-4 h-4" />
                  Receita — Matérias-Primas Utilizadas
                </h3>

                {(!ficha.recipes || ficha.recipes.length === 0) ? (
                  <p className="text-sm text-muted-foreground">Nenhuma matéria-prima registrada na receita.</p>
                ) : (
                  <div className="space-y-3">
                    {ficha.recipes.map((recipe, idx) => (
                      <div key={idx} className="border border-border rounded-lg p-4 bg-background">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-foreground">{recipe.raw_material_name}</span>
                          <span className="text-sm text-muted-foreground">
                            {recipe.quantity_needed} {recipe.unit}
                          </span>
                        </div>

                        {recipe.batches_consumed && recipe.batches_consumed.length > 0 ? (
                          <div className="ml-2 space-y-2">
                            {recipe.batches_consumed.map((batch, bIdx) => (
                              <div key={bIdx} className="flex flex-wrap items-center gap-3 text-sm bg-muted/30 rounded px-3 py-2">
                                <div className="flex items-center gap-1">
                                  <Hash className="w-3 h-3 text-muted-foreground" />
                                  <span className="text-muted-foreground">Lote MP:</span>
                                  <span className="font-mono font-semibold text-foreground">{batch.batch_number || '-'}</span>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 ml-1"
                                    onClick={() => copyToClipboard(batch.batch_number || '')}
                                    data-testid={`copy-batch-${batch.batch_id}`}
                                  >
                                    <ClipboardCopy className="w-3 h-3" />
                                  </Button>
                                </div>

                                {batch.supplier_batch_number && (
                                  <div className="flex items-center gap-1">
                                    <span className="text-muted-foreground">Lote Forn.:</span>
                                    <span className="font-mono text-foreground">{batch.supplier_batch_number}</span>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 ml-1"
                                      onClick={() => copyToClipboard(batch.supplier_batch_number)}
                                    >
                                      <ClipboardCopy className="w-3 h-3" />
                                    </Button>
                                  </div>
                                )}

                                <div className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3 text-muted-foreground" />
                                  <span className="text-muted-foreground">Validade:</span>
                                  <span className="font-semibold text-foreground">
                                    {batch.expiry_date
                                      ? new Date(batch.expiry_date + 'T00:00:00').toLocaleDateString('pt-BR')
                                      : 'Não informada'}
                                  </span>
                                  {batch.expiry_date && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 ml-1"
                                      onClick={() => copyToClipboard(
                                        new Date(batch.expiry_date + 'T00:00:00').toLocaleDateString('pt-BR')
                                      )}
                                    >
                                      <ClipboardCopy className="w-3 h-3" />
                                    </Button>
                                  )}
                                </div>

                                <span className="text-muted-foreground">
                                  Usado: <span className="text-foreground font-semibold">{batch.quantity_used} {recipe.unit}</span>
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground ml-2">Sem detalhes de lote disponíveis</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
