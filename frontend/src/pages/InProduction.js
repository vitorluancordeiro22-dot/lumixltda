import React, { useEffect, useState, useRef } from 'react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../components/ui/alert-dialog';
import { toast } from 'sonner';
import { Factory, Package, Calendar, Search, CheckCircle, Clock } from 'lucide-react';

export const InProduction = () => {
  const { user } = useAuth();
  const [batches, setBatches] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [releasing, setReleasing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const isMountedRef = useRef(true);

  // Emails autorizados para liberar lotes
  const authorizedEmails = [
  'laboratoriolumix@outlook.com',
  'luan_ssss@hotmail.com'
];
  const canRelease = authorizedEmails.includes(user?.email);

  useEffect(() => {
    isMountedRef.current = true;
    fetchData();
    
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchData = async () => {
    try {
      const [batchesRes, productsRes] = await Promise.all([
        api.get('/product-batches/in-production'),
        api.get('/products')
      ]);
      
      if (isMountedRef.current) {
        setBatches(batchesRes.data);
        setProducts(productsRes.data);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Erro ao carregar lotes em produção');
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const getProductName = (productId) => {
    const product = products.find(p => p.id === productId);
    return product?.name || 'Produto desconhecido';
  };

  const handleReleaseForBottling = async (batch) => {
    setReleasing(true);
    try {
      const response = await api.post(`/product-batches/${batch.id}/ready-for-bottling`);
      
      if (isMountedRef.current) {
        toast.success(`Lote ${response.data.batch_number} liberado para envase!`);
        await fetchData();
      }
    } catch (error) {
      if (isMountedRef.current) {
        toast.error(error.response?.data?.detail || 'Erro ao liberar lote');
      }
    } finally {
      if (isMountedRef.current) {
        setReleasing(false);
      }
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('pt-BR');
  };

  // Filtrar lotes pela pesquisa
  const filteredBatches = batches.filter(batch => {
    const productName = getProductName(batch.product_id).toLowerCase();
    const batchNumber = batch.batch_number?.toLowerCase() || '';
    const search = searchTerm.toLowerCase();
    return productName.includes(search) || batchNumber.includes(search);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-2">Em Produção</h1>
          <p className="text-lg text-muted-foreground">
            Lotes aguardando liberação para envase
          </p>
        </div>
        <Badge className="bg-amber-500 text-white px-4 py-2 text-lg">
          <Factory className="w-5 h-5 mr-2" />
          {batches.length} lote(s) em produção
        </Badge>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <Input
          placeholder="Pesquisar por produto ou lote..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 h-12 bg-input border-border text-foreground"
        />
      </div>

      {/* Info Card para usuários não autorizados */}
      {!canRelease && (
        <Card className="p-4 border-amber-300 bg-amber-50">
          <p className="text-amber-800 text-sm">
            <strong>Atenção:</strong> Apenas usuários autorizados podem liberar lotes para envase.
          </p>
        </Card>
      )}

      {/* Lista de Lotes */}
      {filteredBatches.length === 0 ? (
        <Card className="p-12 border text-center">
          <Factory className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-foreground mb-2">
            {searchTerm ? 'Nenhum lote encontrado' : 'Nenhum lote em produção'}
          </h3>
          <p className="text-muted-foreground">
            {searchTerm 
              ? 'Tente outro termo de pesquisa' 
              : 'Todos os lotes foram liberados para envase ou não há lotes criados'}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredBatches.map(batch => (
            <Card key={batch.id} className="p-6 border hover:shadow-lg transition-shadow">
              {/* Header do Card */}
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-xs text-muted-foreground">Lote</p>
                  <p className="text-3xl font-bold text-primary">{batch.batch_number}</p>
                </div>
                <Badge className="bg-amber-500">
                  <Clock className="w-3 h-3 mr-1" />
                  Em Produção
                </Badge>
              </div>

              {/* Info do Produto */}
              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-muted-foreground" />
                  <span className="font-semibold text-foreground">{getProductName(batch.product_id)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">{formatDate(batch.date)}</span>
                </div>
                <div className="p-3 rounded-lg bg-muted">
                  <p className="text-sm text-muted-foreground">Litragem Planejada</p>
                  <p className="text-xl font-bold text-foreground">{batch.planned_liters} {batch.unit}</p>
                </div>
              </div>

              {/* Botão de Liberação */}
              {canRelease ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button 
                      className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white text-lg"
                      disabled={releasing}
                    >
                      <CheckCircle className="w-5 h-5 mr-2" />
                      Pronto para Envase
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-emerald-600" />
                        Liberar Lote para Envase
                      </AlertDialogTitle>
                      <AlertDialogDescription asChild>
                        <div className="space-y-3">
                          <p>Você está prestes a liberar o lote <strong>{batch.batch_number}</strong> para envase.</p>
                          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                            <p className="font-semibold text-emerald-800">Produto:</p>
                            <p className="text-emerald-700">{getProductName(batch.product_id)}</p>
                            <p className="text-sm text-emerald-600 mt-1">
                              {batch.planned_liters} {batch.unit} planejados
                            </p>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Após a liberação, o lote aparecerá na aba de <strong>Contagem</strong> para registro de envase.
                          </p>
                        </div>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={() => handleReleaseForBottling(batch)}
                        className="bg-emerald-600 hover:bg-emerald-700"
                      >
                        Sim, Liberar para Envase
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : (
                <div className="p-3 rounded-lg bg-muted text-center">
                  <p className="text-sm text-muted-foreground">
                    Aguardando liberação pelo laboratório
                  </p>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
