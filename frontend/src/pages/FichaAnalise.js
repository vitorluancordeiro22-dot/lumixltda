import React, { useEffect, useState, useCallback } from 'react';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import DocumentationButton from '../components/DocumentationButton';
import { toast } from 'sonner';
import {
  FolderPlus, Folder, Plus, ArrowLeft, FlaskConical, Pencil, Trash2,
  Save, X, ClipboardCopy, Package, Boxes, FileText, ChevronRight
} from 'lucide-react';

const DEFAULT_FIELDS = [
  { name: 'Aspecto', order: 0, spec: '', quick_answer: true },
  { name: 'Cor', order: 1, spec: '', quick_answer: true },
  { name: 'Odor', order: 2, spec: '', quick_answer: true },
  { name: 'pH', order: 3, spec: '', quick_answer: false },
  { name: 'Viscosidade', order: 4, spec: '', quick_answer: false },
  { name: 'Densidade gm/3', order: 5, spec: '', quick_answer: false },
];

// Soma N dias a uma data "YYYY-MM-DD" sem cair em problemas de fuso horário.
const addDaysISO = (isoDate, days) => {
  if (!isoDate) return '';
  const parts = String(isoDate).split('T')[0].split('-');
  if (parts.length !== 3) return isoDate;
  const [y, m, d] = parts.map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
};

export default function FichaAnalise() {
  const [activeTab, setActiveTab] = useState('produto');
  const [view, setView] = useState('categories'); // categories | items | analises | new_analise | edit_fields
  const [categories, setCategories] = useState([]);
  const [allItems, setAllItems] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [analises, setAnalises] = useState([]);
  const [fields, setFields] = useState(DEFAULT_FIELDS);
  const [editingFields, setEditingFields] = useState([]);
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [results, setResults] = useState({});
  const [specs, setSpecs] = useState({});
  const [newCatName, setNewCatName] = useState('');
  const [showNewCat, setShowNewCat] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchAddItem, setSearchAddItem] = useState('');
  const [analiseStatus, setAnaliseStatus] = useState('aprovado');
  const [analiseDate, setAnaliseDate] = useState(() => new Date().toISOString().split('T')[0]);

  const itemType = activeTab === 'produto' ? 'produto' : 'materia_prima';

  const fetchCategories = useCallback(async () => {
    try {
      const res = await api.get(`/analise-categories?type=${itemType}`);
      setCategories(res.data);
    } catch { toast.error('Erro ao carregar categorias'); }
  }, [itemType]);

  const fetchAllItems = useCallback(async () => {
    try {
      if (itemType === 'produto') {
        const res = await api.get('/products');
        setAllItems(res.data);
      } else {
        const res = await api.get('/raw-materials');
        setAllItems(res.data);
      }
    } catch { toast.error('Erro ao carregar itens'); }
  }, [itemType]);

  useEffect(() => {
    setView('categories');
    setSelectedCategory(null);
    setSelectedItem(null);
    fetchCategories();
    fetchAllItems();
  }, [activeTab, fetchCategories, fetchAllItems]);

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      await api.post('/analise-categories', { name: newCatName.trim(), type: itemType });
      setNewCatName('');
      setShowNewCat(false);
      fetchCategories();
      toast.success('Categoria criada');
    } catch { toast.error('Erro ao criar categoria'); }
  };

  const handleDeleteCategory = async (catId) => {
    if (!window.confirm('Remover esta categoria?')) return;
    try {
      await api.delete(`/analise-categories/${catId}`);
      fetchCategories();
      toast.success('Categoria removida');
    } catch { toast.error('Erro'); }
  };

  const handleAddItem = async (itemId) => {
    try {
      await api.post(`/analise-categories/${selectedCategory.id}/add-item`, { item_id: itemId });
      fetchCategories();
      setShowAddItem(false);
      toast.success('Item adicionado');
    } catch { toast.error('Erro'); }
  };

  const handleRemoveItem = async (itemId) => {
    try {
      await api.post(`/analise-categories/${selectedCategory.id}/remove-item`, { item_id: itemId });
      const updated = { ...selectedCategory, items: selectedCategory.items.filter(i => i !== itemId) };
      setSelectedCategory(updated);
      fetchCategories();
    } catch { toast.error('Erro'); }
  };

  const openItem = async (item) => {
    setSelectedItem(item);
    setView('analises');
    setLoading(true);
    try {
      const [analiseRes, fieldsRes, batchRes] = await Promise.all([
        api.get(`/analises?item_id=${item.id}&item_type=${itemType}`),
        api.get(`/analise-fields/${item.id}`),
        api.get(`/analise-batches/${itemType}/${item.id}`)
      ]);
      setAnalises(analiseRes.data);
      setFields(fieldsRes.data.fields || DEFAULT_FIELDS);
      setBatches(batchRes.data);
    } catch { toast.error('Erro ao carregar dados'); }
    setLoading(false);
  };

  const startNewAnalise = () => {
    setSelectedBatch(null);
    setAnaliseStatus('aprovado');
    setAnaliseDate(new Date().toISOString().split('T')[0]);
    const newResults = {};
    const newSpecs = {};
    fields.forEach(f => {
      newResults[f.name] = '';
      newSpecs[f.name] = f.spec || ''; // Pré-preencher especificações fixas
    });
    setResults(newResults);
    setSpecs(newSpecs);
    setView('new_analise');
  };

  // Quando o lote é selecionado, a Data da Ficha vira "Data do Lote + 1 dia"
  // (a análise física é concluída no dia seguinte à produção, independentemente
  // de quando o usuário registrar no sistema).
  useEffect(() => {
    if (selectedBatch && selectedBatch.date) {
      const next = addDaysISO(selectedBatch.date, 1);
      if (next) setAnaliseDate(next);
    }
  }, [selectedBatch]);

  const handleSaveAnalise = async () => {
    if (!selectedBatch) { toast.error('Selecione um lote'); return; }
    try {
      const payload = {
        item_id: selectedItem.id,
        item_type: itemType,
        item_name: selectedItem.name,
        batch_id: selectedBatch.id,
        batch_number: selectedBatch.batch_number,
        date: analiseDate,
        results,
        specifications: specs,
        status: analiseStatus,
        raw_materials_used: selectedBatch.raw_materials_used || []
      };
      await api.post('/analises', payload);
      toast.success('Análise registrada');
      openItem(selectedItem);
    } catch { toast.error('Erro ao salvar'); }
  };

  const handleSaveFields = async () => {
    try {
      await api.put(`/analise-fields/${selectedItem.id}`, { fields: editingFields });
      setFields(editingFields);
      setView('analises');
      toast.success('Campos salvos');
    } catch { toast.error('Erro ao salvar campos'); }
  };

  const getItemName = (itemId) => {
    const item = allItems.find(i => i.id === itemId);
    return item ? item.name : itemId;
  };

  const copyText = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado!');
  };

  const getCategoryItems = (cat) => {
    return (cat.items || []).map(itemId => allItems.find(i => i.id === itemId)).filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  };

  const availableItemsForCategory = () => {
    const usedIds = selectedCategory?.items || [];
    let items = allItems.filter(i => !usedIds.includes(i.id));
    if (searchAddItem.trim()) {
      const search = searchAddItem.toLowerCase();
      items = items.filter(i => i.name.toLowerCase().includes(search));
    }
    return items.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  };

  // ====== RENDER ======

  // Categories View
  const renderCategories = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="outline" className="border-border" onClick={() => setShowNewCat(true)} data-testid="new-category-btn">
          <FolderPlus className="w-4 h-4 mr-2" /> Nova Categoria
        </Button>
      </div>

      {showNewCat && (
        <Card className="p-4 bg-card border-border flex gap-3 items-end">
          <div className="flex-1">
            <Label className="text-foreground text-sm">Nome da Categoria</Label>
            <Input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="Ex: Desinfetantes" className="bg-input border-border text-foreground mt-1" autoFocus />
          </div>
          <Button onClick={handleCreateCategory} data-testid="save-category-btn"><Save className="w-4 h-4 mr-1" /> Salvar</Button>
          <Button variant="ghost" onClick={() => { setShowNewCat(false); setNewCatName(''); }}><X className="w-4 h-4" /></Button>
        </Card>
      )}

      {categories.length === 0 ? (
        <Card className="p-8 text-center bg-card border-border">
          <Folder className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Nenhuma categoria criada. Crie uma para organizar seus {activeTab === 'produto' ? 'produtos' : 'matérias-primas'}.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map(cat => {
            const items = getCategoryItems(cat);
            return (
              <Card key={cat.id} className="bg-card border-border hover:border-primary/50 transition-colors cursor-pointer group" onClick={() => { setSelectedCategory(cat); setView('items'); }} data-testid={`category-${cat.id}`}>
                <div className="p-5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Folder className="w-5 h-5 text-primary" />
                      <h3 className="font-bold text-foreground">{cat.name}</h3>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100" onClick={e => { e.stopPropagation(); handleDeleteCategory(cat.id); }}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">{items.length} {items.length === 1 ? 'item' : 'itens'}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {items.slice(0, 4).map(item => (
                      <span key={item.id} className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground">{item.name}</span>
                    ))}
                    {items.length > 4 && <span className="text-xs text-muted-foreground">+{items.length - 4}</span>}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );

  // Items View (inside a category)
  const renderItems = () => {
    const items = getCategoryItems(selectedCategory);
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => { setView('categories'); setSelectedCategory(null); }}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
          </Button>
          <Folder className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground">{selectedCategory.name}</h2>
          <Button variant="outline" size="sm" className="border-border ml-auto" onClick={() => setShowAddItem(true)} data-testid="add-item-btn">
            <Plus className="w-4 h-4 mr-1" /> Adicionar {activeTab === 'produto' ? 'Produto' : 'Matéria-Prima'}
          </Button>
        </div>

        {items.length === 0 ? (
          <Card className="p-8 text-center bg-card border-border">
            <p className="text-muted-foreground">Nenhum item nesta categoria. Adicione {activeTab === 'produto' ? 'produtos' : 'matérias-primas'}.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map(item => (
              <Card key={item.id} className="bg-card border-border hover:border-primary/50 transition-colors cursor-pointer group" onClick={() => openItem(item)} data-testid={`item-${item.id}`}>
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {activeTab === 'produto' ? <Package className="w-5 h-5 text-primary" /> : <Boxes className="w-5 h-5 text-primary" />}
                    <span className="font-semibold text-foreground">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100" onClick={e => { e.stopPropagation(); handleRemoveItem(item.id); }}>
                      <X className="w-3 h-3" />
                    </Button>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Dialog para adicionar item */}
        <Dialog open={showAddItem} onOpenChange={(open) => { setShowAddItem(open); if (!open) setSearchAddItem(''); }}>
          <DialogContent className="bg-card border-border max-h-[70vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-foreground">Adicionar {activeTab === 'produto' ? 'Produto' : 'Matéria-Prima'}</DialogTitle>
            </DialogHeader>
            <Input
              placeholder="Pesquisar..."
              value={searchAddItem}
              onChange={e => setSearchAddItem(e.target.value)}
              className="bg-input border-border text-foreground mb-2"
              autoFocus
              data-testid="search-add-item"
            />
            <div className="space-y-2 max-h-[40vh] overflow-y-auto">
              {availableItemsForCategory().length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {searchAddItem ? 'Nenhum resultado encontrado.' : 'Todos os itens já foram adicionados.'}
                </p>
              ) : (
                availableItemsForCategory().map(item => (
                  <Button key={item.id} variant="outline" className="w-full justify-start border-border text-foreground" onClick={() => handleAddItem(item.id)}>
                    {activeTab === 'produto' ? <Package className="w-4 h-4 mr-2" /> : <Boxes className="w-4 h-4 mr-2" />}
                    {item.name}
                  </Button>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  };

  // Analises History View
  const renderAnalises = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" onClick={() => setView('items')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
        </Button>
        <div className="flex items-center gap-2">
          {activeTab === 'produto' ? <Package className="w-5 h-5 text-primary" /> : <Boxes className="w-5 h-5 text-primary" />}
          <h2 className="text-xl font-bold text-foreground">{selectedItem?.name}</h2>
        </div>
        <div className="ml-auto flex gap-2 flex-wrap">
          {activeTab === 'produto' && (
            <DocumentationButton productId={selectedItem?.id} productName={selectedItem?.name} />
          )}
          <Button variant="outline" size="sm" className="border-border" onClick={() => { setEditingFields([...fields]); setView('edit_fields'); }} data-testid="edit-fields-btn">
            <Pencil className="w-4 h-4 mr-1" /> Editar Campos
          </Button>
          <Button size="sm" onClick={startNewAnalise} data-testid="new-analise-btn">
            <Plus className="w-4 h-4 mr-1" /> Nova Análise
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>
      ) : analises.length === 0 ? (
        <Card className="p-8 text-center bg-card border-border">
          <FlaskConical className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Nenhuma análise registrada para este {activeTab === 'produto' ? 'produto' : 'matéria-prima'}.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {analises.map(a => (
            <Card key={a.id} className="bg-card border-border" data-testid={`analise-${a.id}`}>
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <FileText className="w-4 h-4 text-primary" />
                    <span className="font-bold text-foreground">Lote: {a.batch_number}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                      a.status === 'reprovado' 
                        ? 'bg-red-500/20 text-red-400' 
                        : 'bg-green-500/20 text-green-400'
                    }`}>
                      {a.status === 'reprovado' ? 'REPROVADO' : 'APROVADO'}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {a.date ? new Date(a.date + 'T00:00:00').toLocaleDateString('pt-BR') : new Date(a.created_at).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">por {a.created_by}</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {Object.entries(a.results || {}).map(([key, val]) => (
                    <div key={key} className="bg-muted/30 rounded px-3 py-2">
                      <span className="text-xs text-muted-foreground block">{key}</span>
                      <span className="text-sm font-semibold text-foreground">{val || '-'}</span>
                      {a.specifications?.[key] && (
                        <span className="text-xs text-muted-foreground block">Espec: {a.specifications[key]}</span>
                      )}
                    </div>
                  ))}
                </div>
                {a.raw_materials_used && a.raw_materials_used.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <span className="text-xs font-semibold text-muted-foreground">Matérias-Primas:</span>
                    <div className="mt-1 space-y-1">
                      {a.raw_materials_used.map((rm, i) => (
                        <div key={i} className="text-xs text-muted-foreground flex items-center gap-2">
                          <span className="text-foreground font-medium">{rm.raw_material_name}</span>
                          {rm.batches_consumed?.map((b, j) => (
                            <span key={j} className="bg-muted px-2 py-0.5 rounded flex items-center gap-1">
                              Lote: {b.batch_number}
                              <button onClick={() => copyText(b.batch_number)} className="hover:text-primary"><ClipboardCopy className="w-3 h-3" /></button>
                              {b.expiry_date && (
                                <>
                                  | Val: {new Date(b.expiry_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                                  <button onClick={() => copyText(new Date(b.expiry_date + 'T00:00:00').toLocaleDateString('pt-BR'))} className="hover:text-primary"><ClipboardCopy className="w-3 h-3" /></button>
                                </>
                              )}
                            </span>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  // New Analise Form
  const renderNewAnalise = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" onClick={() => setView('analises')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
        </Button>
        <h2 className="text-xl font-bold text-foreground">Nova Análise — {selectedItem?.name}</h2>
      </div>

      {/* Seletor de Lote */}
      <Card className="p-4 bg-card border-border">
        <Label className="text-foreground font-semibold text-sm">Selecione o Lote</Label>
        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
          {batches.length === 0 ? (
            <p className="text-sm text-muted-foreground col-span-full">Nenhum lote encontrado para este item.</p>
          ) : (
            batches.map(b => (
              <button
                key={b.id}
                onClick={() => setSelectedBatch(b)}
                className={`text-left p-3 rounded-lg border transition-all text-sm ${
                  selectedBatch?.id === b.id
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border bg-muted/20 text-muted-foreground hover:border-primary/50'
                }`}
                data-testid={`batch-option-${b.id}`}
              >
                <span className="font-mono font-bold block">{b.batch_number}</span>
                <span className="text-xs">{b.status} — {b.date ? new Date(b.date + 'T00:00:00').toLocaleDateString('pt-BR') : ''}</span>
              </button>
            ))
          )}
        </div>
      </Card>

      {/* MP do lote selecionado (se produto) */}
      {selectedBatch?.raw_materials_used && selectedBatch.raw_materials_used.length > 0 && (
        <Card className="p-4 bg-card border-border">
          <Label className="text-foreground font-semibold text-sm">Matérias-Primas do Lote</Label>
          <div className="mt-2 space-y-2">
            {selectedBatch.raw_materials_used.map((rm, i) => (
              <div key={i} className="flex items-center gap-2 text-sm bg-muted/30 rounded px-3 py-2">
                <span className="font-medium text-foreground">{rm.raw_material_name}</span>
                <span className="text-muted-foreground">({rm.quantity_needed} {rm.unit})</span>
                {rm.batches_consumed?.map((b, j) => (
                  <span key={j} className="flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded">
                    Lote: {b.batch_number}
                    <button onClick={() => copyText(b.batch_number)} className="hover:text-primary"><ClipboardCopy className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Data da Ficha */}
      <Card className="p-4 bg-card border-border">
        <Label className="text-foreground font-semibold text-sm">Data da Ficha</Label>
        <Input
          type="date"
          value={analiseDate}
          onChange={e => setAnaliseDate(e.target.value)}
          className="bg-input border-border text-foreground mt-2 w-48"
          data-testid="analise-date"
        />
      </Card>

      {/* Campos de Análise */}
      <Card className="p-4 bg-card border-border">
        <Label className="text-foreground font-semibold text-sm">Campos de Análise</Label>
        <div className="mt-2 mb-3 grid grid-cols-3 gap-3 text-xs text-muted-foreground font-semibold">
          <span>Campo</span>
          <span className="text-center">Especificação</span>
          <span className="text-center">Resultado</span>
        </div>
        <div className="space-y-3">
          {fields.map((field, idx) => (
            <div key={idx} className="grid grid-cols-3 gap-3 items-center">
              <Label className="text-sm text-foreground font-medium">{field.name}</Label>
              <div>
                <Input
                  placeholder="Especificação"
                  value={specs[field.name] || ''}
                  readOnly
                  className="bg-muted/50 border-border text-muted-foreground text-sm cursor-default"
                />
              </div>
              <div>
                {field.quick_answer ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setResults(prev => ({ ...prev, [field.name]: 'OK' }))}
                      className={`flex-1 py-2 px-3 rounded-md text-xs font-bold transition-all border ${
                        results[field.name] === 'OK'
                          ? 'border-green-500 bg-green-500/20 text-green-400'
                          : 'border-border bg-muted/20 text-muted-foreground hover:border-green-500/50'
                      }`}
                      data-testid={`quick-ok-${field.name}`}
                    >
                      OK
                    </button>
                    <button
                      type="button"
                      onClick={() => setResults(prev => ({ ...prev, [field.name]: 'REPROVADO' }))}
                      className={`flex-1 py-2 px-3 rounded-md text-xs font-bold transition-all border ${
                        results[field.name] === 'REPROVADO'
                          ? 'border-red-500 bg-red-500/20 text-red-400'
                          : 'border-border bg-muted/20 text-muted-foreground hover:border-red-500/50'
                      }`}
                      data-testid={`quick-reprovado-${field.name}`}
                    >
                      REPROVADO
                    </button>
                  </div>
                ) : (
                  <Input
                    placeholder="Resultado"
                    value={results[field.name] || ''}
                    onChange={e => setResults(prev => ({ ...prev, [field.name]: e.target.value }))}
                    className="bg-input border-border text-foreground text-sm"
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Status Aprovado/Reprovado */}
      <Card className="p-4 bg-card border-border">
        <Label className="text-foreground font-semibold text-sm mb-3 block">Resultado da Análise</Label>
        <div className="flex gap-3">
          <button
            onClick={() => setAnaliseStatus('aprovado')}
            className={`flex-1 py-3 px-4 rounded-lg text-sm font-bold transition-all border-2 ${
              analiseStatus === 'aprovado'
                ? 'border-green-500 bg-green-500/20 text-green-400'
                : 'border-border bg-muted/20 text-muted-foreground hover:border-green-500/50'
            }`}
            data-testid="status-aprovado"
          >
            APROVADO
          </button>
          <button
            onClick={() => setAnaliseStatus('reprovado')}
            className={`flex-1 py-3 px-4 rounded-lg text-sm font-bold transition-all border-2 ${
              analiseStatus === 'reprovado'
                ? 'border-red-500 bg-red-500/20 text-red-400'
                : 'border-border bg-muted/20 text-muted-foreground hover:border-red-500/50'
            }`}
            data-testid="status-reprovado"
          >
            REPROVADO
          </button>
        </div>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="outline" className="border-border" onClick={() => setView('analises')}>Cancelar</Button>
        <Button onClick={handleSaveAnalise} data-testid="save-analise-btn">
          <Save className="w-4 h-4 mr-1" /> Registrar Análise
        </Button>
      </div>
    </div>
  );

  // Edit Fields View
  const renderEditFields = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" onClick={() => setView('analises')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Cancelar
        </Button>
        <h2 className="text-xl font-bold text-foreground">Editar Campos — {selectedItem?.name}</h2>
      </div>

      <Card className="p-4 bg-card border-border space-y-3">
        <p className="text-sm text-muted-foreground">
          Adicione, remova ou renomeie os campos de análise. As especificações ficam fixas para este produto.
          Marque <span className="text-foreground font-semibold">"Resposta Rápida"</span> em campos cuja resposta é sempre <span className="text-green-400 font-semibold">OK</span> ou <span className="text-red-400 font-semibold">REPROVADO</span> (ex: Cor, Odor, Aspecto) — assim você só clica em vez de digitar.
        </p>
        <div className="grid grid-cols-[30px_1fr_1fr_110px_40px] gap-2 text-xs text-muted-foreground font-semibold mb-1">
          <span></span>
          <span>Nome do Campo</span>
          <span>Especificação Fixa</span>
          <span className="text-center">Resposta Rápida</span>
          <span></span>
        </div>
        {editingFields.map((field, idx) => (
          <div key={idx} className="grid grid-cols-[30px_1fr_1fr_110px_40px] gap-2 items-center">
            <span className="text-sm text-muted-foreground">{idx + 1}.</span>
            <Input
              value={field.name}
              onChange={e => {
                const updated = [...editingFields];
                updated[idx].name = e.target.value;
                setEditingFields(updated);
              }}
              placeholder="Nome do campo"
              className="bg-input border-border text-foreground"
            />
            <Input
              value={field.spec || ''}
              onChange={e => {
                const updated = [...editingFields];
                updated[idx].spec = e.target.value;
                setEditingFields(updated);
              }}
              placeholder="Ex: ATÉ 11,40"
              className="bg-input border-border text-foreground"
            />
            <button
              type="button"
              onClick={() => {
                const updated = [...editingFields];
                updated[idx].quick_answer = !updated[idx].quick_answer;
                setEditingFields(updated);
              }}
              className={`py-2 px-2 rounded-md text-xs font-bold transition-all border ${
                field.quick_answer
                  ? 'border-primary bg-primary/20 text-primary'
                  : 'border-border bg-muted/20 text-muted-foreground hover:border-primary/50'
              }`}
              data-testid={`toggle-quick-${idx}`}
            >
              {field.quick_answer ? 'OK / REPROV.' : 'TEXTO LIVRE'}
            </button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingFields(editingFields.filter((_, i) => i !== idx))}>
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" className="border-border" onClick={() => setEditingFields([...editingFields, { name: '', order: editingFields.length, spec: '', quick_answer: false }])}>
          <Plus className="w-4 h-4 mr-1" /> Adicionar Campo
        </Button>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="outline" className="border-border" onClick={() => setView('analises')}>Cancelar</Button>
        <Button onClick={handleSaveFields} data-testid="save-fields-btn">
          <Save className="w-4 h-4 mr-1" /> Salvar Campos
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6" data-testid="ficha-analise-page">
      <div>
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-2">Ficha de Análise</h1>
        <p className="text-lg text-muted-foreground">Registre e consulte análises de produtos e matérias-primas</p>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-2 bg-muted/40 p-1 rounded-lg w-fit" data-testid="analise-tab-switcher">
        <button
          onClick={() => setActiveTab('produto')}
          className={`flex items-center gap-2 py-2 px-4 rounded-md text-sm font-medium transition-all ${
            activeTab === 'produto' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Package className="w-4 h-4" /> Produtos
        </button>
        <button
          onClick={() => setActiveTab('materia_prima')}
          className={`flex items-center gap-2 py-2 px-4 rounded-md text-sm font-medium transition-all ${
            activeTab === 'materia_prima' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Boxes className="w-4 h-4" /> Matérias-Primas
        </button>
      </div>

      {/* Content */}
      {view === 'categories' && renderCategories()}
      {view === 'items' && renderItems()}
      {view === 'analises' && renderAnalises()}
      {view === 'new_analise' && renderNewAnalise()}
      {view === 'edit_fields' && renderEditFields()}
    </div>
  );
}
