import React, { useEffect, useState, useRef } from 'react';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Truck, Phone, Mail, MapPin, Search } from 'lucide-react';

export const Suppliers = () => {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const isMountedRef = useRef(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    contact: '',
    phone: '',
    email: '',
    address: ''
  });

  useEffect(() => {
    isMountedRef.current = true;
    fetchSuppliers();
    
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchSuppliers = async () => {
    try {
      const response = await api.get('/suppliers');
      if (isMountedRef.current) {
        setSuppliers(response.data);
      }
    } catch (error) {
      if (isMountedRef.current) {
        toast.error('Erro ao carregar fornecedores');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    
    setSubmitting(true);
    try {
      if (selectedSupplier) {
        await api.put(`/suppliers/${selectedSupplier.id}`, formData);
      } else {
        await api.post('/suppliers', formData);
      }
      
      if (isMountedRef.current) {
        const successMessage = selectedSupplier ? 'Fornecedor atualizado!' : 'Fornecedor criado!';
        setDialogOpen(false);
        resetForm();
        await fetchSuppliers();
        toast.success(successMessage);
      }
    } catch (error) {
      if (isMountedRef.current) {
        toast.error('Erro ao salvar fornecedor');
      }
    } finally {
      if (isMountedRef.current) {
        setSubmitting(false);
      }
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Deseja mover este fornecedor para a lixeira?')) return;
    try {
      await api.delete(`/suppliers/${id}`);
      if (isMountedRef.current) {
        await fetchSuppliers();
        toast.success('Fornecedor movido para lixeira');
      }
    } catch (error) {
      if (isMountedRef.current) {
        toast.error('Erro ao excluir');
      }
    }
  };

  const handleEdit = (supplier) => {
    setSelectedSupplier(supplier);
    setFormData({
      name: supplier.name,
      contact: supplier.contact || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      address: supplier.address || ''
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setSelectedSupplier(null);
    setFormData({
      name: '',
      contact: '',
      phone: '',
      email: '',
      address: ''
    });
  };

  // Filtrar fornecedores pela pesquisa
  const filteredSuppliers = suppliers.filter(supplier => 
    supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (supplier.contact && supplier.contact.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-2">Fornecedores</h1>
          <p className="text-lg text-muted-foreground">Gerencie seus fornecedores de matérias-primas</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button data-testid="create-supplier-button" className="bg-primary hover:bg-primary/90 glow-primary">
              <Plus className="w-4 h-4 mr-2" />
              Novo Fornecedor
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground">{selectedSupplier ? 'Editar' : 'Novo'} Fornecedor</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label className="text-foreground">Nome da Empresa *</Label>
                <Input 
                  value={formData.name} 
                  onChange={(e) => setFormData({...formData, name: e.target.value})} 
                  className="bg-input border-border text-foreground" 
                  required 
                  placeholder="Ex: Distribuidora ABC"
                />
              </div>
              <div>
                <Label className="text-foreground">Pessoa de Contato</Label>
                <Input 
                  value={formData.contact} 
                  onChange={(e) => setFormData({...formData, contact: e.target.value})} 
                  className="bg-input border-border text-foreground"
                  placeholder="Ex: João Silva"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-foreground">Telefone</Label>
                  <Input 
                    value={formData.phone} 
                    onChange={(e) => setFormData({...formData, phone: e.target.value})} 
                    className="bg-input border-border text-foreground"
                    placeholder="(00) 00000-0000"
                  />
                </div>
                <div>
                  <Label className="text-foreground">Email</Label>
                  <Input 
                    type="email"
                    value={formData.email} 
                    onChange={(e) => setFormData({...formData, email: e.target.value})} 
                    className="bg-input border-border text-foreground"
                    placeholder="contato@empresa.com"
                  />
                </div>
              </div>
              <div>
                <Label className="text-foreground">Endereço</Label>
                <Input 
                  value={formData.address} 
                  onChange={(e) => setFormData({...formData, address: e.target.value})} 
                  className="bg-input border-border text-foreground"
                  placeholder="Rua, número, cidade"
                />
              </div>
              <Button type="submit" disabled={submitting} className="w-full bg-primary hover:bg-primary/90">
                Salvar
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Campo de Pesquisa */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
        <Input
          type="text"
          placeholder="Pesquisar fornecedores..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 h-12 bg-input border-border text-foreground"
        />
      </div>

      {loading ? (
        <div className="text-foreground">Carregando...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredSuppliers.map(supplier => (
            <Card key={supplier.id} data-testid={`supplier-card-${supplier.id}`} className="p-6 border shadow-sm hover:border-primary/50 hover:shadow-md transition-all">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-3 flex-1">
                  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <Truck className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-bold text-foreground mb-1 truncate">{supplier.name}</h3>
                    {supplier.contact && (
                      <p className="text-sm text-muted-foreground truncate">{supplier.contact}</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <Button size="icon" variant="ghost" onClick={() => handleEdit(supplier)} className="text-muted-foreground hover:text-foreground">
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => handleDelete(supplier.id)} className="text-red-600 hover:text-red-500 hover:bg-red-50">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                {supplier.phone && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="w-4 h-4" />
                    <span className="truncate">{supplier.phone}</span>
                  </div>
                )}
                {supplier.email && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="w-4 h-4" />
                    <span className="truncate">{supplier.email}</span>
                  </div>
                )}
                {supplier.address && (
                  <div className="flex items-start gap-2 text-muted-foreground">
                    <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span className="line-clamp-2">{supplier.address}</span>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
