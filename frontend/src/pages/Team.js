import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Users, Search } from 'lucide-react';

export const Team = () => {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [memberHistory, setMemberHistory] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const isMountedRef = React.useRef(true);
  const [formData, setFormData] = useState({ name: '', role: '' });
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    isMountedRef.current = true;
    fetchMembers();
    
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchMembers = async () => {
    try {
      const response = await api.get('/team');
      if (isMountedRef.current) {
        setMembers(response.data);
      }
    } catch (error) {
      if (isMountedRef.current) {
        toast.error('Erro ao carregar equipe');
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
      if (selectedMember) {
        await api.put(`/team/${selectedMember.id}`, formData);
      } else {
        await api.post('/team', formData);
      }
      
      if (isMountedRef.current) {
        const successMessage = selectedMember ? 'Membro atualizado!' : 'Membro adicionado!';
        setDialogOpen(false);
        resetForm();
        await fetchMembers();
        toast.success(successMessage);
      }
    } catch (error) {
      if (isMountedRef.current) {
        toast.error('Erro ao salvar');
      }
    } finally {
      if (isMountedRef.current) {
        setSubmitting(false);
      }
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Deseja mover este membro para a lixeira?')) return;
    try {
      await api.delete(`/team/${id}`);
      if (isMountedRef.current) {
        await fetchMembers();
        toast.success('Membro movido para lixeira');
      }
    } catch (error) {
      if (isMountedRef.current) {
        toast.error('Erro ao excluir');
      }
    }
  };

  const handleEdit = (member) => {
    setSelectedMember(member);
    setFormData({ name: member.name, role: member.role });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setSelectedMember(null);
    setFormData({ name: '', role: '' });
  };

  const handleViewHistory = async (member) => {
    setSelectedMember(member);
    setHistoryDialogOpen(true);
    setLoadingHistory(true);
    
    try {
      const response = await api.get(`/team/${member.id}/history`);
      if (isMountedRef.current) {
        setMemberHistory(response.data);
      }
    } catch (error) {
      if (isMountedRef.current) {
        toast.error('Erro ao carregar histórico');
      }
    } finally {
      if (isMountedRef.current) {
        setLoadingHistory(false);
      }
    }
  };

  // Filtrar membros pela pesquisa
  const filteredMembers = members.filter(member => 
    member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (member.role && member.role.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-2">Equipe</h1>
          <p className="text-lg text-muted-foreground">Gerencie os membros da equipe</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button data-testid="create-member-button" className="bg-primary hover:bg-primary/90 glow-primary">
              <Plus className="w-4 h-4 mr-2" />
              Novo Membro
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground">{selectedMember ? 'Editar' : 'Novo'} Membro</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label className="text-foreground">Nome</Label>
                <Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="bg-input border-border text-foreground" required />
              </div>
              <div>
                <Label className="text-foreground">Cargo/Função</Label>
                <Input value={formData.role} onChange={(e) => setFormData({...formData, role: e.target.value})} className="bg-input border-border text-foreground" required placeholder="Ex: Operador, Pesador, Envasador" />
              </div>
              <Button type="submit" disabled={submitting} className="w-full bg-primary hover:bg-primary/90">Salvar</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div>Carregando...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {members.map(member => (
            <Card key={member.id} data-testid={`member-card-${member.id}`} className="p-6  border hover:border-primary/50 transition-all">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-4 flex-1 cursor-pointer" onClick={() => handleViewHistory(member)}>
                  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                    <Users className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-foreground mb-1 hover:text-primary transition-colors">{member.name}</h3>
                    <p className="text-sm text-muted-foreground">{member.role}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="icon" variant="ghost" onClick={() => handleEdit(member)} className="text-muted-foreground hover:text-foreground">
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => handleDelete(member.id)} className="text-red-400 hover:text-red-300">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleViewHistory(member)}
                className="w-full border-border text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                Ver Histórico de Envasamento
              </Button>
            </Card>
          ))}
        </div>
      )}

      {/* History Dialog */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="bg-card border-border max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              Histórico de Envasamento - {selectedMember?.name}
            </DialogTitle>
          </DialogHeader>
          
          {loadingHistory ? (
            <div className="text-foreground p-8 text-center">Carregando histórico...</div>
          ) : memberHistory ? (
            <div className="space-y-6">
              {/* Summary */}
              <div className="grid grid-cols-2 gap-4">
                <Card className="p-4  border">
                  <p className="text-sm text-muted-foreground mb-1">Total Envasado</p>
                  <p className="text-3xl font-bold text-primary">{memberHistory.total_liters_bottled.toFixed(1)}L</p>
                </Card>
                <Card className="p-4  border">
                  <p className="text-sm text-muted-foreground mb-1">Operações</p>
                  <p className="text-3xl font-bold text-foreground">{memberHistory.total_operations}</p>
                </Card>
              </div>

              {/* History List */}
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-foreground">Histórico Detalhado</h3>
                {memberHistory.history.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">Nenhuma operação de envasamento registrada</p>
                ) : (
                  memberHistory.history.map((item) => (
                    <Card key={item.id} className="p-4  border">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-foreground font-semibold">{item.product_name}</p>
                          <p className="text-sm text-muted-foreground">Lote: {item.batch_number}</p>
                          <p className="text-xs text-muted-foreground/70">
                            {new Date(item.date).toLocaleString('pt-BR')}
                          </p>
                          <div className="mt-2 flex gap-4 text-sm text-muted-foreground">
                            <span>1L: {item.one_liter}</span>
                            <span>2L: {item.two_liter}</span>
                            <span>5L: {item.five_liter}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-primary">{item.total_liters}L</p>
                        </div>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};
