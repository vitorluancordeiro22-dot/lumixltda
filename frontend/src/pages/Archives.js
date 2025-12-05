import React, { useEffect, useState, useRef } from 'react';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { Archive, Package, Boxes, Calendar } from 'lucide-react';

export const Archives = () => {
  const [months, setMonths] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [productBatches, setProductBatches] = useState([]);
  const [rawMaterialBatches, setRawMaterialBatches] = useState([]);
  const [products, setProducts] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [archiving, setArchiving] = useState(false);
  const isMountedRef = useRef(true);

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

  const getProductName = (id) => products.find(p => p.id === id)?.name || 'N/A';
  const getRawMaterialName = (id) => rawMaterials.find(rm => rm.id === id)?.name || 'N/A';

  const formatBatchNumber = (number) => {
    if (!number || number.length < 7) return number;
    const year = number.substring(0, 2);
    const month = number.substring(2, 4);
    const seq = number.substring(4, 7);
    return `${month}/20${year} - #${seq}`;
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-2">Arquivos Mensais</h1>
          <p className="text-lg text-slate-300">Histórico de lotes finalizados por mês</p>
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
        <div className="text-white">Carregando...</div>
      ) : months.length === 0 ? (
        <Card className="p-12 glass-effect border-white/5 text-center">
          <Archive className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 text-lg mb-2">Nenhum arquivo mensal disponível</p>
          <p className="text-slate-500 text-sm">
            Clique em "Arquivar Finalizados" para arquivar lotes concluídos
          </p>
        </Card>
      ) : (
        <>
          {/* Month Selector */}
          <Card className="p-6 glass-effect border-white/5">
            <div className="flex items-center gap-4">
              <Calendar className="w-6 h-6 text-primary" />
              <div className="flex-1">
                <p className="text-sm text-slate-400 mb-2">Selecionar Mês:</p>
                <Select 
                  value={selectedMonth ? `${selectedMonth.year}-${selectedMonth.month}` : ''}
                  onValueChange={(value) => {
                    const [year, month] = value.split('-');
                    setSelectedMonth({ year: parseInt(year), month: parseInt(month), month_name: months.find(m => m.year === parseInt(year) && m.month === parseInt(month))?.month_name });
                  }}
                >
                  <SelectTrigger className="bg-slate-900/50 border-slate-700 text-white h-12 text-lg">
                    <SelectValue placeholder="Selecione o mês" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700">
                    {months.map((m) => (
                      <SelectItem key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`} className="text-white">
                        {m.month_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>

          {selectedMonth && (
            <Tabs defaultValue="products" className="space-y-6">
              <TabsList className="bg-slate-800 border border-slate-700">
                <TabsTrigger value="products" className="data-[state=active]:bg-primary">
                  <Package className="w-4 h-4 mr-2" />
                  Produtos ({productBatches.length})
                </TabsTrigger>
                <TabsTrigger value="materials" className="data-[state=active]:bg-primary">
                  <Boxes className="w-4 h-4 mr-2" />
                  Matérias-Primas ({rawMaterialBatches.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="products" className="space-y-4">
                {productBatches.length === 0 ? (
                  <Card className="p-12 glass-effect border-white/5 text-center">
                    <Package className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-400">Nenhum produto arquivado neste mês</p>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {productBatches.map(batch => (
                      <Card key={batch.id} className="p-6 glass-effect border-white/5">
                        <div className="mb-4">
                          <Badge className="bg-emerald-600 mb-2">Finalizado</Badge>
                          <h3 className="text-xl font-bold text-white mb-1">{getProductName(batch.product_id)}</h3>
                          <p className="text-sm text-slate-400">Lote: {batch.batch_number}</p>
                          <p className="text-xs text-slate-500">{formatBatchNumber(batch.batch_number)}</p>
                        </div>
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center gap-2 text-slate-400">
                            <Calendar className="w-4 h-4" />
                            {new Date(batch.date).toLocaleDateString('pt-BR')}
                          </div>
                          <div className="p-3 rounded-lg bg-slate-800/50">
                            <p className="text-xs text-slate-400">Planejado / Envasado</p>
                            <p className="text-lg font-bold text-white">
                              {batch.planned_liters}L / {batch.total_bottled}L
                            </p>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="materials" className="space-y-4">
                {rawMaterialBatches.length === 0 ? (
                  <Card className="p-12 glass-effect border-white/5 text-center">
                    <Boxes className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-400">Nenhuma matéria-prima arquivada neste mês</p>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {rawMaterialBatches.map(batch => (
                      <Card key={batch.id} className="p-6 glass-effect border-white/5">
                        <div className="mb-4">
                          <Badge className="bg-emerald-600 mb-2">Finalizado</Badge>
                          <h3 className="text-xl font-bold text-white mb-1">{getRawMaterialName(batch.raw_material_id)}</h3>
                          <p className="text-sm text-slate-400">Lote: {batch.batch_number}</p>
                          <p className="text-xs text-slate-500">{formatBatchNumber(batch.batch_number)}</p>
                        </div>
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center gap-2 text-slate-400">
                            <Calendar className="w-4 h-4" />
                            {new Date(batch.date).toLocaleDateString('pt-BR')}
                          </div>
                          <div className="p-3 rounded-lg bg-slate-800/50">
                            <p className="text-xs text-slate-400">Quantidade</p>
                            <p className="text-lg font-bold text-white">{batch.quantity}</p>
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
