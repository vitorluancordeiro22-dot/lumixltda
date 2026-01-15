import React, { useEffect, useState, useRef } from 'react';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { FlaskConical, Check, Clock, User } from 'lucide-react';

const formatDateBR = (dateStr) => {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  return date.toLocaleDateString('pt-BR');
};

const getMonthName = (month) => {
  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  return months[month - 1] || '';
};

export const Samples = () => {
  const [samples, setSamples] = useState([]);
  const [products, setProducts] = useState([]);
  const [batches, setBatches] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [collectDialogOpen, setCollectDialogOpen] = useState(false);
  const [selectedSample, setSelectedSample] = useState(null);
  const [collectedBy, setCollectedBy] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    fetchData();
    return () => { isMountedRef.current = false; };
  }, []);

  const fetchData = async () => {
    try {
      const [samplesRes, productsRes, batchesRes, teamRes] = await Promise.all([
        api.get('/samples'),
        api.get('/products'),
        api.get('/product-batches'),
        api.get('/team')
      ]);
      if (isMountedRef.current) {
        setSamples(samplesRes.data);
        setProducts(productsRes.data);
        setBatches(batchesRes.data);
        setTeamMembers(teamRes.data);
      }
    } catch (error) {
      toast.error('Erro ao carregar dados');
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  };

  const getProductName = (id) => products.find(p => p.id === id)?.name || 'N/A';
  const getBatchNumber = (id) => batches.find(b => b.id === id)?.batch_number || 'N/A';

  const pendingSamples = samples.filter(s => s.status === 'pendente');
  const collectedSamples = samples.filter(s => s.status === 'retirado');

  const handleOpenCollect = (sample) => {
    setSelectedSample(sample);
    setCollectedBy('');
    setCollectDialogOpen(true);
  };

  const handleCollect = async () => {
    if (!selectedSample || !collectedBy) {
      toast.error('Selecione quem retirou a amostra');
      return;
    }
    setSubmitting(true);
    try {
      await api.put(`/samples/${selectedSample.id}/collect?collected_by=${encodeURIComponent(collectedBy)}`);
      toast.success('Amostra marcada como retirada!');
      setCollectDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error('Erro ao registrar retirada');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-2">Amostras</h1>
        <p className="text-lg text-muted-foreground">Controle de amostras mensais de produtos</p>
      </div>

      {loading ? (
        <div className="text-center py-12">Carregando...</div>
      ) : (
        <div className="space-y-8">
          {/* Amostras Pendentes */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-6 h-6 text-amber-500" />
              <h2 className="text-2xl font-bold text-foreground">Amostras Pendentes</h2>
              <Badge className="bg-amber-500">{pendingSamples.length}</Badge>
            </div>

            {pendingSamples.length === 0 ? (
              <Card className="p-8 text-center border">
                <FlaskConical className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Nenhuma amostra pendente</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {pendingSamples.map(sample => (
                  <Card key={sample.id} className="p-6 border shadow-sm hover:border-amber-500/50 transition-all">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-xl font-bold text-foreground">{getProductName(sample.product_id)}</h3>
                        <p className="text-sm text-muted-foreground">Lote: {getBatchNumber(sample.product_batch_id)}</p>
                      </div>
                      <FlaskConical className="w-8 h-8 text-amber-500" />
                    </div>
                    <div className="space-y-2 mb-4">
                      <p className="text-sm text-muted-foreground">
                        Mês: <span className="text-foreground font-medium">{getMonthName(sample.month)} {sample.year}</span>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Solicitado em: <span className="text-foreground">{formatDateBR(sample.requested_at)}</span>
                      </p>
                    </div>
                    <Button 
                      className="w-full bg-amber-600 hover:bg-amber-700"
                      onClick={() => handleOpenCollect(sample)}
                    >
                      <Check className="w-4 h-4 mr-2" />
                      Confirmar Retirada
                    </Button>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Registro de Amostras */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Check className="w-6 h-6 text-green-500" />
              <h2 className="text-2xl font-bold text-foreground">Registro de Amostras</h2>
              <Badge className="bg-green-500">{collectedSamples.length}</Badge>
            </div>

            {collectedSamples.length === 0 ? (
              <Card className="p-8 text-center border">
                <FlaskConical className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Nenhuma amostra retirada ainda</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {collectedSamples.map(sample => (
                  <Card key={sample.id} className="p-6 border shadow-sm bg-green-50/50">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-xl font-bold text-foreground">{getProductName(sample.product_id)}</h3>
                        <p className="text-sm text-muted-foreground">Lote: {getBatchNumber(sample.product_batch_id)}</p>
                      </div>
                      <Badge className="bg-green-500">Retirado</Badge>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        Mês: <span className="text-foreground font-medium">{getMonthName(sample.month)} {sample.year}</span>
                      </p>
                      <div className="p-3 rounded-lg bg-green-100/50 border border-green-200">
                        <p className="text-xs text-muted-foreground mb-1">Retirado por:</p>
                        <p className="font-semibold text-foreground flex items-center gap-2">
                          <User className="w-4 h-4" />
                          {sample.collected_by}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Em: {formatDateBR(sample.collected_at)}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dialog de Confirmação */}
      <Dialog open={collectDialogOpen} onOpenChange={setCollectDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Confirmar Retirada de Amostra</DialogTitle>
          </DialogHeader>
          {selectedSample && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Produto:</p>
                <p className="font-bold text-foreground">{getProductName(selectedSample.product_id)}</p>
                <p className="text-sm text-muted-foreground mt-2">Lote: {getBatchNumber(selectedSample.product_batch_id)}</p>
              </div>
              <div>
                <p className="text-sm text-foreground mb-2">Quem retirou a amostra?</p>
                <Select value={collectedBy} onValueChange={setCollectedBy}>
                  <SelectTrigger className="bg-input border-border text-foreground">
                    <SelectValue placeholder="Selecione o responsável" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {teamMembers.map(m => (
                      <SelectItem key={m.id} value={m.name} className="text-foreground">{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button 
                className="w-full bg-green-600 hover:bg-green-700" 
                onClick={handleCollect}
                disabled={submitting || !collectedBy}
              >
                <Check className="w-4 h-4 mr-2" />
                {submitting ? 'Salvando...' : 'Confirmar Retirada'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
