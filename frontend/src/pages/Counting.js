import React, { useEffect, useState, useRef } from 'react';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { Plus, Search, Trophy } from 'lucide-react';

export const Counting = () => {
  const [batches, setBatches] = useState([]);
  const [products, setProducts] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [countings, setCountings] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [topOperator, setTopOperator] = useState(null);
  const isMountedRef = useRef(true);
  const formRef = useRef(null);
  
  const [formData, setFormData] = useState({
    // Volume (L/ml)
    half_liter: 0,
    one_liter: 0,
    two_liter: 0,
    five_liter: 0,
    // Peso (g/Kg)
    three_thirty_gram: 0,
    five_hundred_gram: 0,
    one_kg: 0,
    operator: ''
  });

  useEffect(() => {
    isMountedRef.current = true;
    fetchBatches();
    fetchProducts();
    fetchTeamMembers();
    fetchTopOperator();
    
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (selectedBatch && isMountedRef.current) {
      fetchCountings(selectedBatch.id);
      // Scroll automático para o formulário
      setTimeout(() => {
        formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [selectedBatch]);

  const fetchBatches = async () => {
    try {
      const response = await api.get('/product-batches');
      setBatches(response.data.filter(b => b.status === 'em_aberto'));
    } catch (error) {
      toast.error('Erro ao carregar lotes');
    }
  };

  const fetchProducts = async () => {
    try {
      const response = await api.get('/products');
      setProducts(response.data);
    } catch (error) {
      console.error('Error loading products:', error);
    }
  };

  const fetchTeamMembers = async () => {
    try {
      const response = await api.get('/team');
      setTeamMembers(response.data);
    } catch (error) {
      console.error('Error loading team:', error);
    }
  };

  const fetchTopOperator = async () => {
    try {
      const response = await api.get('/counting/top-operator/month');
      if (response.data) {
        setTopOperator(response.data);
      }
    } catch (error) {
      console.error('Error loading top operator:', error);
    }
  };

  const fetchCountings = async (batchId) => {
    try {
      const response = await api.get(`/counting/${batchId}`);
      setCountings(response.data);
    } catch (error) {
      console.error('Error loading countings:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedBatch) {
      toast.error('Selecione um lote');
      return;
    }
    if (submitting) return;
    
    setSubmitting(true);
    try {
      await api.post(`/counting/${selectedBatch.id}`, formData);
      
      if (isMountedRef.current) {
        setFormData({ 
          half_liter: 0, one_liter: 0, two_liter: 0, five_liter: 0,
          three_thirty_gram: 0, five_hundred_gram: 0, one_kg: 0,
          operator: '' 
        });
        fetchCountings(selectedBatch.id);
        await fetchBatches();
        toast.success('Contagem registrada!');
      }
    } catch (error) {
      if (isMountedRef.current) {
        toast.error('Erro ao registrar contagem');
      }
    } finally {
      if (isMountedRef.current) {
        setSubmitting(false);
      }
    }
  };

  const getProductName = (id) => products.find(p => p.id === id)?.name || 'N/A';
  const getProduct = (id) => products.find(p => p.id === id);
  
  // Verifica se o produto é medido por peso (Kg/g)
  const isWeightProduct = () => {
    if (!selectedBatch) return false;
    const product = getProduct(selectedBatch.product_id);
    if (!product) return false;
    const unit = (product.unit || '').toLowerCase();
    return unit.includes('kg') || unit.includes('quilo') || unit.includes('gram') || unit.includes('g');
  };

  // Calcula o total da contagem atual
  const calculateTotal = () => {
    if (isWeightProduct()) {
      return (formData.three_thirty_gram * 0.33) + (formData.five_hundred_gram * 0.5) + (formData.one_kg * 1);
    }
    return (formData.half_liter * 0.5) + (formData.one_liter * 1) + (formData.two_liter * 2) + (formData.five_liter * 5);
  };

  // Calcula total de uma contagem do histórico
  const getCountingDetails = (count) => {
    const volumeItems = [];
    const weightItems = [];
    
    if (count.half_liter > 0) volumeItems.push(`500ml: ${count.half_liter}`);
    if (count.one_liter > 0) volumeItems.push(`1L: ${count.one_liter}`);
    if (count.two_liter > 0) volumeItems.push(`2L: ${count.two_liter}`);
    if (count.five_liter > 0) volumeItems.push(`5L: ${count.five_liter}`);
    
    if (count.three_thirty_gram > 0) weightItems.push(`330g: ${count.three_thirty_gram}`);
    if (count.five_hundred_gram > 0) weightItems.push(`500g: ${count.five_hundred_gram}`);
    if (count.one_kg > 0) weightItems.push(`1Kg: ${count.one_kg}`);
    
    const allItems = [...volumeItems, ...weightItems];
    return allItems.length > 0 ? allItems.join(' | ') : 'Sem itens';
  };

  const totalCount = countings.reduce((sum, c) => sum + c.total, 0);
  const unitLabel = isWeightProduct() ? 'Kg' : 'L';

  // Filtra lotes pela pesquisa (nome do produto ou número do lote)
  const filteredBatches = batches.filter(batch => {
    const productName = getProductName(batch.product_id).toLowerCase();
    const batchNumber = batch.batch_number?.toLowerCase() || '';
    const search = searchTerm.toLowerCase();
    return productName.includes(search) || batchNumber.includes(search);
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-2">Contagem / Envase</h1>
        <p className="text-lg text-muted-foreground">Registre as quantidades envasadas</p>
      </div>

      {/* Batch Selection */}
      <Card className="p-6 border">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <Label className="text-foreground text-lg">Selecione o Lote em Aberto</Label>
          {/* Barra de Pesquisa */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              data-testid="search-batches"
              placeholder="Buscar por produto ou lote..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        
        {filteredBatches.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            {searchTerm ? 'Nenhum lote encontrado para essa busca.' : 'Nenhum lote em aberto.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredBatches.map(batch => {
            const product = getProduct(batch.product_id);
            const unit = product?.unit || 'L';
            const isWeight = unit.toLowerCase().includes('kg') || unit.toLowerCase().includes('g');
            
            return (
              <button
                key={batch.id}
                data-testid={`batch-select-${batch.id}`}
                onClick={() => setSelectedBatch(batch)}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  selectedBatch?.id === batch.id
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/30 bg-muted/50'
                }`}
              >
                <p className="text-foreground font-bold mb-1">{getProductName(batch.product_id)}</p>
                <p className="text-sm text-muted-foreground">Lote: {batch.batch_number}</p>
                <p className="text-sm text-muted-foreground">
                  Planejado: {batch.planned_liters}{isWeight ? 'Kg' : 'L'}
                </p>
                <p className="text-sm text-muted-foreground">
                  Envasado: {batch.total_bottled}{isWeight ? 'Kg' : 'L'}
                </p>
                <Badge variant="outline" className="mt-2 text-xs">
                  {isWeight ? 'Peso (Kg)' : 'Volume (L)'}
                </Badge>
              </button>
            );
          })}
          </div>
        )}
      </Card>

      {selectedBatch && (
        <>
          {/* Progress */}
          <Card className="p-6 border">
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-muted-foreground">Progresso do Lote</p>
                <p className="text-foreground font-bold">
                  {selectedBatch.total_bottled.toFixed(1)} / {selectedBatch.planned_liters} {unitLabel}
                </p>
              </div>
              <div className="w-full bg-muted rounded-full h-4 overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${Math.min((selectedBatch.total_bottled / selectedBatch.planned_liters) * 100, 100)}%` }}
                />
              </div>
            </div>
            {selectedBatch.total_bottled >= selectedBatch.planned_liters && (
              <Badge className="bg-emerald-600">Lote Finalizado!</Badge>
            )}
          </Card>

          {/* Counting Form */}
          <Card ref={formRef} className="p-6 border">
            <h2 className="text-2xl font-bold text-foreground mb-6">Registrar Contagem</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              
              {/* Opções de VOLUME (L/ml) - Mostrar apenas para produtos de volume */}
              {!isWeightProduct() && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label className="text-foreground text-base font-semibold">500ml</Label>
                    <Input
                      type="number"
                      value={formData.half_liter}
                      onChange={(e) => setFormData({...formData, half_liter: parseInt(e.target.value) || 0})}
                      className="h-14 text-xl bg-input border-border text-foreground text-center"
                      min="0"
                    />
                    <p className="text-center text-muted-foreground text-sm">
                      Total: {(formData.half_liter * 0.5).toFixed(1)}L
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground text-base font-semibold">1 Litro</Label>
                    <Input
                      type="number"
                      data-testid="one-liter-input"
                      value={formData.one_liter}
                      onChange={(e) => setFormData({...formData, one_liter: parseInt(e.target.value) || 0})}
                      className="h-14 text-xl bg-input border-border text-foreground text-center"
                      min="0"
                    />
                    <p className="text-center text-muted-foreground text-sm">Total: {formData.one_liter}L</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground text-base font-semibold">2 Litros</Label>
                    <Input
                      type="number"
                      data-testid="two-liter-input"
                      value={formData.two_liter}
                      onChange={(e) => setFormData({...formData, two_liter: parseInt(e.target.value) || 0})}
                      className="h-14 text-xl bg-input border-border text-foreground text-center"
                      min="0"
                    />
                    <p className="text-center text-muted-foreground text-sm">Total: {formData.two_liter * 2}L</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground text-base font-semibold">5 Litros</Label>
                    <Input
                      type="number"
                      data-testid="five-liter-input"
                      value={formData.five_liter}
                      onChange={(e) => setFormData({...formData, five_liter: parseInt(e.target.value) || 0})}
                      className="h-14 text-xl bg-input border-border text-foreground text-center"
                      min="0"
                    />
                    <p className="text-center text-muted-foreground text-sm">Total: {formData.five_liter * 5}L</p>
                  </div>
                </div>
              )}

              {/* Opções de PESO (g/Kg) - Mostrar apenas para produtos de peso */}
              {isWeightProduct() && (
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-foreground text-base font-semibold">330g</Label>
                    <Input
                      type="number"
                      value={formData.three_thirty_gram}
                      onChange={(e) => setFormData({...formData, three_thirty_gram: parseInt(e.target.value) || 0})}
                      className="h-14 text-xl bg-input border-border text-foreground text-center"
                      min="0"
                    />
                    <p className="text-center text-muted-foreground text-sm">
                      Total: {(formData.three_thirty_gram * 0.33).toFixed(2)}Kg
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground text-base font-semibold">500g</Label>
                    <Input
                      type="number"
                      value={formData.five_hundred_gram}
                      onChange={(e) => setFormData({...formData, five_hundred_gram: parseInt(e.target.value) || 0})}
                      className="h-14 text-xl bg-input border-border text-foreground text-center"
                      min="0"
                    />
                    <p className="text-center text-muted-foreground text-sm">
                      Total: {(formData.five_hundred_gram * 0.5).toFixed(2)}Kg
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground text-base font-semibold">1 Kg</Label>
                    <Input
                      type="number"
                      value={formData.one_kg}
                      onChange={(e) => setFormData({...formData, one_kg: parseInt(e.target.value) || 0})}
                      className="h-14 text-xl bg-input border-border text-foreground text-center"
                      min="0"
                    />
                    <p className="text-center text-muted-foreground text-sm">Total: {formData.one_kg}Kg</p>
                  </div>
                </div>
              )}
              
              <div className="p-4 rounded-lg bg-primary/10 border border-primary/30">
                <p className="text-center text-foreground text-2xl font-bold">
                  Total desta Contagem: {calculateTotal().toFixed(2)}{unitLabel}
                </p>
              </div>

              <div>
                <Label className="text-foreground">Operador</Label>
                <Select value={formData.operator} onValueChange={(v) => setFormData({...formData, operator: v})}>
                  <SelectTrigger className="bg-input border-border text-foreground h-12">
                    <SelectValue placeholder="Quem fez o envase?" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {teamMembers.map(m => (
                      <SelectItem key={m.id} value={m.name} className="text-foreground">{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button type="submit" disabled={submitting} data-testid="submit-counting-button" className="w-full h-14 text-lg bg-primary hover:bg-primary/90 glow-primary">
                <Plus className="w-5 h-5 mr-2" />
                Registrar Contagem
              </Button>
            </form>
          </Card>

          {/* History */}
          {countings.length > 0 && (
            <Card className="p-6 border">
              <h3 className="text-xl font-bold text-foreground mb-4">Histórico de Contagens</h3>
              <div className="space-y-3">
                {countings.map((count) => (
                  <div key={count.id} className="p-4 rounded-lg bg-muted/50 border border-border">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-foreground text-sm">{getCountingDetails(count)}</p>
                        <p className="text-sm text-muted-foreground">Operador: {count.operator}</p>
                      </div>
                      <p className="text-foreground font-bold">{count.total.toFixed(2)}{unitLabel}</p>
                    </div>
                  </div>
                ))}
                <div className="p-4 rounded-lg bg-primary/10 border border-primary/30">
                  <p className="text-foreground font-bold text-lg">Total Acumulado: {totalCount.toFixed(2)}{unitLabel}</p>
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
};
