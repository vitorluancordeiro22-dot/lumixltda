import React, { useEffect, useState, useRef } from 'react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { toast } from 'sonner';
import { Archive, Package, Boxes, Calendar, Search, Pencil, X, History } from 'lucide-react';

export const Archives = () => {
  const { user } = useAuth();
  const [months, setMonths] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [productBatches, setProductBatches] = useState([]);
  const [rawMaterialBatches, setRawMaterialBatches] = useState([]);
  const [products, setProducts] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [archiving, setArchiving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [editingCounting, setEditingCounting] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const isMountedRef = useRef(true);

  // Verifica se é o usuário do laboratório
  const isLabUser = user?.email?.toLowerCase() === 'laboratoriolumix@outlook.com';

  useEffect(() => {
    isMountedRef.current = true;
    fetchData();

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (selectedMonth) {
      fetchArchiveData(selectedMonth.year, selectedMonth.month);
    }
  }, [selectedMonth]);

  const fetchData = async () => {
    try {
      const [monthsRes, prodsRes, rmsRes] = await Promise.all([
        api.get('/archive/months'),
        api.get('/products'),
        api.get('/raw-materials')
      ]);

      if (isMountedRef.current) {
        setMonths(monthsRes.data);
        setProducts(prodsRes.data);
        setRawMaterials(rmsRes.data);
        
        if (monthsRes.data.length > 0) {
          setSelectedMonth(monthsRes.data[0]);
        }
      }
    } catch (error) {
      if (isMountedRef.current) {
        toast.error('Erro ao carregar arquivos');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const fetchArchiveData = async (year, month) => {
    try {
      const [prodBatches, rmBatches] = await Promise.all([
        api.get(`/archive/products/${year}/${month}`),
        api.get(`/archive/raw-materials/${year}/${month}`)
      ]);

      if (isMountedRef.current) {
        setProductBatches(prodBatches.data);
        setRawMaterialBatches(rmBatches.data);
      }
    } catch (error) {
      if (isMountedRef.current) {
        toast.error('Erro ao carregar dados do arquivo');
      }
    }
  };

  const handleAutoArchive = async () => {
    if (!window.confirm('Deseja arquivar automaticamente todos os lotes finalizados de meses anteriores?')) return;
    
    setArchiving(true);
    try {
      const response = await api.post('/archive/auto-archive-month');
      
      if (isMountedRef.current) {
        await fetchData();
        toast.success(`Arquivado: ${response.data.archived_products} produtos e ${response.data.archived_materials} matérias-primas`);
      }
    } catch (error) {
      if (isMountedRef.current) {
        toast.error('Erro ao arquivar');
      }
    } finally {
      if (isMountedRef.current) {
        setArchiving(false);
      }
    }
  };

  const handleEditCounting = (counting) => {
    setEditingCounting(counting);
    setEditForm({
      half_liter: counting.half_liter || 0,
      one_liter: counting.one_liter || 0,
      two_liter: counting.two_liter || 0,
      five_liter: counting.five_liter || 0,
      three_thirty_gram: counting.three_thirty_gram || 0,
      five_hundred_gram: counting.five_hundred_gram || 0,
      one_kg: counting.one_kg || 0,
      operator: counting.operator || ''
    });
  };

  const handleSaveEdit = async () => {
    if (!selectedBatch || !editingCounting) return;
    
    setSaving(true);
    try {
      await api.put(`/archive/counting/${selectedBatch.id}/${editingCounting.id}`, editForm);
      
      toast.success('Contagem atualizada com sucesso!');
      setEditingCounting(null);
      
      // Recarregar dados do arquivo
      if (selectedMonth) {
        await fetchArchiveData(selectedMonth.year, selectedMonth.month);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao atualizar contagem');
    } finally {
      setSaving(false);
    }
  };

  const getProductName = (id) => products.find(p => p.id === id)?.name || 'N/A';
  const getRawMaterialName = (id) => rawMaterials.find(rm => rm.id === id)?.name || 'N/A';

  const formatBatchNumber = (number) => {
    if (!number || number.length < 7) return number;
    const year = number.substring(0, 2);
    const month = number.substring(2, 4);
    const seq = number.substring(4, 7);
    return `${month}/20${year} - #${seq}`;
  };

  // Filtrar lotes de produtos pela pesquisa
  const filteredProductBatches = productBatches.filter(batch => {
    const productName = getProductName(batch.product_id).toLowerCase();
    const batchNumber = batch.batch_number?.toLowerCase() || '';
    const search = searchTerm.toLowerCase();
    return productName.includes(search) || batchNumber.includes(search);
  });

  // Filtrar lotes de matérias-primas pela pesquisa
  const filteredRawMaterialBatches = rawMaterialBatches.filter(batch => {
    const rmName = getRawMaterialName(batch.raw_material_id).toLowerCase();
    const batchNumber = batch.batch_number?.toLowerCase() || '';
    const search = searchTerm.toLowerCase();
    return rmName.includes(search) || batchNumber.includes(search);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-2">Arquivos Mensais</h1>
          <p className="text-lg text-muted-foreground">Histórico de lotes finalizados por mês</p>
        </div>
        <Button 
          onClick={handleAutoArchive}
          disabled={archiving}
          className="bg-amber-600 hover:bg-amber-700"
        >
          <Archive className="w-4 h-4 mr-2" />
          {archiving ? 'Arquivando...' : 'Arquivar Finalizados'}
        </Button>
      </div>

      {loading ? (
        <div className="text-foreground">Carregando...</div>
      ) : months.length === 0 ? (
        <Card className="p-12  border text-center">
          <Archive className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground text-lg mb-2">Nenhum arquivo mensal disponível</p>
          <p className="text-muted-foreground/70 text-sm">
            Clique em &ldquo;Arquivar Finalizados&rdquo; para arquivar lotes concluídos
          </p>
        </Card>
      ) : (
        <>
          {/* Month Selector */}
          <Card className="p-6  border">
            <div className="flex items-center gap-4">
              <Calendar className="w-6 h-6 text-primary" />
              <div className="flex-1">
                <p className="text-sm text-muted-foreground mb-2">Selecionar Mês:</p>
                <Select 
                  value={selectedMonth ? `${selectedMonth.year}-${selectedMonth.month}` : ''}
                  onValueChange={(value) => {
                    const [year, month] = value.split('-');
                    setSelectedMonth({ year: parseInt(year), month: parseInt(month), month_name: months.find(m => m.year === parseInt(year) && m.month === parseInt(month))?.month_name });
                  }}
                >
                  <SelectTrigger className="bg-input border-border text-foreground h-12 text-lg">
                    <SelectValue placeholder="Selecione o mês" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {months.map((m) => (
                      <SelectItem key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`} className="text-foreground">
                        {m.month_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>

          {/* Campo de Pesquisa */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
            <Input
              type="text"
              placeholder="Pesquisar lotes arquivados por nome ou número..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 h-12 bg-input border-border text-foreground"
            />
          </div>

          {selectedMonth && (
            <Tabs defaultValue="products" className="space-y-6">
              <TabsList className="bg-muted border border-border">
                <TabsTrigger value="products" className="data-[state=active]:bg-primary">
                  <Package className="w-4 h-4 mr-2" />
                  Produtos ({filteredProductBatches.length})
                </TabsTrigger>
                <TabsTrigger value="materials" className="data-[state=active]:bg-primary">
                  <Boxes className="w-4 h-4 mr-2" />
                  Matérias-Primas ({filteredRawMaterialBatches.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="products" className="space-y-4">
                {filteredProductBatches.length === 0 ? (
                  <Card className="p-12  border text-center">
                    <Package className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">
                      {searchTerm ? `Nenhum produto encontrado para "${searchTerm}"` : 'Nenhum produto arquivado neste mês'}
                    </p>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredProductBatches.map(batch => (
                      <Card key={batch.id} className="p-6  border">
                        <div className="mb-4">
                          <Badge className="bg-emerald-600 mb-2">Finalizado</Badge>
                          <h3 className="text-xl font-bold text-foreground mb-1">{getProductName(batch.product_id)}</h3>
                          <p className="text-sm text-muted-foreground">Lote: {batch.batch_number}</p>
                          <p className="text-xs text-muted-foreground/70">{formatBatchNumber(batch.batch_number)}</p>
                        </div>
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Calendar className="w-4 h-4" />
                            {new Date(batch.date).toLocaleDateString('pt-BR')}
                          </div>
                          <div className="p-3 rounded-lg bg-muted">
                            <p className="text-xs text-muted-foreground">Planejado / Envasado</p>
                            <p className="text-lg font-bold text-foreground">
                              {batch.planned_liters}L / {batch.total_bottled?.toFixed(1) || 0}L
                            </p>
                          </div>
                          {batch.operators && batch.operators.length > 0 && (
                            <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
                              <p className="text-xs text-muted-foreground mb-1">Operadores do Envase:</p>
                              <p className="text-sm font-semibold text-foreground">{batch.operators.join(', ')}</p>
                            </div>
                          )}
                          {/* Botão para ver histórico de contagens */}
                          {batch.countings_history && batch.countings_history.length > 0 && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full mt-2"
                              onClick={() => setSelectedBatch(batch)}
                            >
                              <History className="w-4 h-4 mr-2" />
                              Ver Contagens ({batch.countings_history.length})
                            </Button>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="materials" className="space-y-4">
                {filteredRawMaterialBatches.length === 0 ? (
                  <Card className="p-12  border text-center">
                    <Boxes className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">
                      {searchTerm ? `Nenhuma matéria-prima encontrada para "${searchTerm}"` : 'Nenhuma matéria-prima arquivada neste mês'}
                    </p>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredRawMaterialBatches.map(batch => (
                      <Card key={batch.id} className="p-6  border">
                        <div className="mb-4">
                          <Badge className="bg-emerald-600 mb-2">Finalizado</Badge>
                          <h3 className="text-xl font-bold text-foreground mb-1">{getRawMaterialName(batch.raw_material_id)}</h3>
                          <p className="text-sm text-muted-foreground">Lote: {batch.batch_number}</p>
                          <p className="text-xs text-muted-foreground/70">{formatBatchNumber(batch.batch_number)}</p>
                        </div>
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Calendar className="w-4 h-4" />
                            {new Date(batch.date).toLocaleDateString('pt-BR')}
                          </div>
                          <div className="p-3 rounded-lg bg-muted">
                            <p className="text-xs text-muted-foreground">Quantidade</p>
                            <p className="text-lg font-bold text-foreground">{batch.quantity}</p>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </>
      )}
    </div>
  );
};
