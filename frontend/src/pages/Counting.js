import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';

export const Counting = () => {
  const [batches, setBatches] = useState([]);
  const [products, setProducts] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [countings, setCountings] = useState([]);
  const [formData, setFormData] = useState({
    one_liter: 0,
    two_liter: 0,
    five_liter: 0,
    operator: ''
  });

  useEffect(() => {
    fetchBatches();
    fetchProducts();
    fetchTeamMembers();
  }, []);

  useEffect(() => {
    if (selectedBatch) {
      fetchCountings(selectedBatch.id);
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
    try {
      await api.post(`/counting/${selectedBatch.id}`, formData);
      toast.success('Contagem registrada!');
      setFormData({ one_liter: 0, two_liter: 0, five_liter: 0, operator: '' });
      fetchCountings(selectedBatch.id);
      fetchBatches();
    } catch (error) {
      toast.error('Erro ao registrar contagem');
    }
  };

  const getProductName = (id) => products.find(p => p.id === id)?.name || 'N/A';
  const totalCount = countings.reduce((sum, c) => sum + c.total, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-2">Contagem / Envase</h1>
        <p className="text-lg text-slate-300">Registre as quantidades envasadas</p>
      </div>

      {/* Batch Selection */}
      <Card className="p-6 glass-effect border-white/5">
        <Label className="text-white text-lg mb-3 block">Selecione o Lote em Aberto</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {batches.map(batch => (
            <button
              key={batch.id}
              data-testid={`batch-select-${batch.id}`}
              onClick={() => setSelectedBatch(batch)}
              className={`p-4 rounded-lg border-2 transition-smooth text-left ${
                selectedBatch?.id === batch.id
                  ? 'border-primary bg-primary/10'
                  : 'border-slate-700 hover:border-slate-600 bg-slate-900/30'
              }`}
            >
              <p className="text-white font-bold mb-1">{getProductName(batch.product_id)}</p>
              <p className="text-sm text-slate-400">Lote: {batch.batch_number}</p>
              <p className="text-sm text-slate-400">Planejado: {batch.planned_liters}L</p>
              <p className="text-sm text-slate-400">Envasado: {batch.total_bottled}L</p>
            </button>
          ))}
        </div>
      </Card>

      {selectedBatch && (
        <>
          {/* Progress */}
          <Card className="p-6 glass-effect border-white/5">
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-slate-400">Progresso do Lote</p>
                <p className="text-white font-bold">
                  {selectedBatch.total_bottled.toFixed(1)} / {selectedBatch.planned_liters} L
                </p>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-4 overflow-hidden">
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
          <Card className="p-6 glass-effect border-white/5">
            <h2 className="text-2xl font-bold text-white mb-6">Registrar Contagem</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label className="text-white text-lg">1 Litro</Label>
                  <Input
                    type="number"
                    data-testid="one-liter-input"
                    value={formData.one_liter}
                    onChange={(e) => setFormData({...formData, one_liter: parseInt(e.target.value) || 0})}
                    className="h-14 text-xl bg-slate-900/50 border-slate-700 text-white text-center"
                    min="0"
                  />
                  <p className="text-center text-slate-400 text-sm">Total: {formData.one_liter * 1}L</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-white text-lg">2 Litros</Label>
                  <Input
                    type="number"
                    data-testid="two-liter-input"
                    value={formData.two_liter}
                    onChange={(e) => setFormData({...formData, two_liter: parseInt(e.target.value) || 0})}
                    className="h-14 text-xl bg-slate-900/50 border-slate-700 text-white text-center"
                    min="0"
                  />
                  <p className="text-center text-slate-400 text-sm">Total: {formData.two_liter * 2}L</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-white text-lg">5 Litros</Label>
                  <Input
                    type="number"
                    data-testid="five-liter-input"
                    value={formData.five_liter}
                    onChange={(e) => setFormData({...formData, five_liter: parseInt(e.target.value) || 0})}
                    className="h-14 text-xl bg-slate-900/50 border-slate-700 text-white text-center"
                    min="0"
                  />
                  <p className="text-center text-slate-400 text-sm">Total: {formData.five_liter * 5}L</p>
                </div>
              </div>
              
              <div className="p-4 rounded-lg bg-primary/10 border border-primary/30">
                <p className="text-center text-white text-2xl font-bold">
                  Total desta Contagem: {(formData.one_liter * 1) + (formData.two_liter * 2) + (formData.five_liter * 5)}L
                </p>
              </div>

              <div>
                <Label className="text-white">Operador</Label>
                <Select value={formData.operator} onValueChange={(v) => setFormData({...formData, operator: v})}>
                  <SelectTrigger className="bg-slate-900/50 border-slate-700 text-white h-12">
                    <SelectValue placeholder="Quem fez o envase?" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700">
                    {teamMembers.map(m => (
                      <SelectItem key={m.id} value={m.name} className="text-white">{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button type="submit" data-testid="submit-counting-button" className="w-full h-14 text-lg bg-primary hover:bg-primary/90 glow-primary">
                <Plus className="w-5 h-5 mr-2" />
                Registrar Contagem
              </Button>
            </form>
          </Card>

          {/* History */}
          {countings.length > 0 && (
            <Card className="p-6 glass-effect border-white/5">
              <h3 className="text-xl font-bold text-white mb-4">Histórico de Contagens</h3>
              <div className="space-y-3">
                {countings.map((count) => (
                  <div key={count.id} className="p-4 rounded-lg bg-slate-900/30 border border-slate-700">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white">1L: {count.one_liter} | 2L: {count.two_liter} | 5L: {count.five_liter}</p>
                        <p className="text-sm text-slate-400">Operador: {count.operator}</p>
                      </div>
                      <p className="text-white font-bold">{count.total}L</p>
                    </div>
                  </div>
                ))}
                <div className="p-4 rounded-lg bg-primary/10 border border-primary/30">
                  <p className="text-white font-bold text-lg">Total Acumulado: {totalCount}L</p>
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
};
