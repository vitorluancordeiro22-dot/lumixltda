import React, { useEffect, useState, useRef } from 'react';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { toast } from 'sonner';
import { 
  FolderPlus, FileText, Upload, Download, Trash2, 
  Folder, FolderOpen, ChevronRight, FileCheck, Home, ArrowLeft
} from 'lucide-react';

export const Laudos = () => {
  const [allFolders, setAllFolders] = useState([]); // Todas as pastas
  const [files, setFiles] = useState([]);
  const [currentFolderId, setCurrentFolderId] = useState(null); // null = raiz
  const [loading, setLoading] = useState(true);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [uploadNotes, setUploadNotes] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    fetchFolders();

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (currentFolderId) {
      fetchFiles(currentFolderId);
    } else {
      setFiles([]);
    }
  }, [currentFolderId]);

  const fetchFolders = async () => {
    try {
      const response = await api.get('/laudos/folders');
      if (isMountedRef.current) {
        setAllFolders(response.data);
      }
    } catch (error) {
      console.error('Error loading folders:', error);
      if (isMountedRef.current) {
        toast.error('Erro ao carregar pastas');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const fetchFiles = async (folderId) => {
    try {
      const response = await api.get(`/laudos/files/${folderId}`);
      if (isMountedRef.current) {
        setFiles(response.data);
      }
    } catch (error) {
      console.error('Error loading files:', error);
    }
  };

  // Obter pastas do nível atual
  const getCurrentLevelFolders = () => {
    return allFolders.filter(f => f.parent_id === currentFolderId);
  };

  // Obter pasta atual
  const getCurrentFolder = () => {
    if (!currentFolderId) return null;
    return allFolders.find(f => f.id === currentFolderId);
  };

  // Obter caminho de navegação (breadcrumb)
  const getBreadcrumb = () => {
    const path = [];
    let folder = getCurrentFolder();
    
    while (folder) {
      path.unshift(folder);
      folder = allFolders.find(f => f.id === folder.parent_id);
    }
    
    return path;
  };

  // Navegar para pasta
  const navigateToFolder = (folderId) => {
    setCurrentFolderId(folderId);
  };

  // Voltar para pasta pai
  const goBack = () => {
    const currentFolder = getCurrentFolder();
    if (currentFolder) {
      setCurrentFolderId(currentFolder.parent_id);
    }
  };

  const handleCreateFolder = async (e) => {
    e.preventDefault();
    if (!newFolderName.trim() || !isMountedRef.current) return;

    try {
      await api.post('/laudos/folders', {
        name: newFolderName,
        parent_id: currentFolderId // Criar na pasta atual
      });

      if (!isMountedRef.current) return;

      toast.success('Pasta criada com sucesso!');
      setNewFolderName('');
      setFolderDialogOpen(false);

      setTimeout(() => {
        if (isMountedRef.current) {
          fetchFolders();
        }
      }, 300);
    } catch (error) {
      if (isMountedRef.current) {
        toast.error('Erro ao criar pasta');
      }
    }
  };

  const handleUploadFile = async (e) => {
    e.preventDefault();
    if (!selectedFile || !currentFolderId || !isMountedRef.current) return;

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('folder_id', currentFolderId);
      formData.append('notes', uploadNotes);

      await api.post('/laudos/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        params: {
          folder_id: currentFolderId,
          notes: uploadNotes
        }
      });

      if (!isMountedRef.current) return;

      toast.success('Arquivo enviado com sucesso!');
      setSelectedFile(null);
      setUploadNotes('');
      setUploadDialogOpen(false);

      setTimeout(() => {
        if (isMountedRef.current) {
          fetchFiles(currentFolderId);
        }
      }, 300);
    } catch (error) {
      if (isMountedRef.current) {
        const errorMsg = error.response?.data?.detail || 'Erro ao enviar arquivo';
        toast.error(errorMsg);
      }
    } finally {
      if (isMountedRef.current) {
        setUploading(false);
      }
    }
  };

  const handleDownloadFile = async (file) => {
    try {
      const response = await api.get(`/laudos/download/${file.id}`, {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', file.filename);
      document.body.appendChild(link);
      link.click();
      link.remove();

      toast.success('Download iniciado!');
    } catch (error) {
      toast.error('Erro ao baixar arquivo');
    }
  };

  const handleDeleteFolder = async (folderId, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm('Tem certeza que deseja deletar esta pasta e todo seu conteúdo?')) return;

    try {
      await api.delete(`/laudos/folders/${folderId}`);
      toast.success('Pasta deletada!');
      
      setTimeout(() => {
        if (isMountedRef.current) {
          fetchFolders();
          // Se deletou a pasta atual, volta para o pai
          if (folderId === currentFolderId) {
            const folder = allFolders.find(f => f.id === folderId);
            setCurrentFolderId(folder?.parent_id || null);
          }
        }
      }, 300);
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Erro ao deletar pasta';
      toast.error(errorMsg);
    }
  };

  const handleDeleteFile = async (fileId) => {
    if (!window.confirm('Tem certeza que deseja deletar este arquivo?')) return;

    try {
      await api.delete(`/laudos/files/${fileId}`);
      toast.success('Arquivo deletado!');
      
      setTimeout(() => {
        if (isMountedRef.current && currentFolderId) {
          fetchFiles(currentFolderId);
        }
      }, 300);
    } catch (error) {
      toast.error('Erro ao deletar arquivo');
    }
  };

  const currentLevelFolders = getCurrentLevelFolders();
  const breadcrumb = getBreadcrumb();
  const currentFolder = getCurrentFolder();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-2">Laudos</h1>
          <p className="text-lg text-muted-foreground">Gerenciamento de documentos e laudos</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Dialog open={folderDialogOpen} onOpenChange={(open) => { setFolderDialogOpen(open); if (!open) setNewFolderName(''); }}>
            <DialogTrigger asChild>
              <Button className="bg-amber-600 hover:bg-amber-700">
                <FolderPlus className="w-4 h-4 mr-2" />
                Nova Pasta
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle className="text-foreground">Criar Nova Pasta</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateFolder} className="space-y-4">
                <div>
                  <Label className="text-foreground">Local</Label>
                  <div className="flex items-center gap-2 p-2 bg-muted rounded-md text-sm text-muted-foreground">
                    <Folder className="w-4 h-4" />
                    {currentFolder ? currentFolder.name : 'Raiz'}
                  </div>
                </div>
                <div>
                  <Label className="text-foreground">Nome da Pasta</Label>
                  <Input
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    className="bg-input border-border text-foreground"
                    placeholder="Ex: Laudos 2024"
                    required
                  />
                </div>
                <Button type="submit" className="w-full bg-primary hover:bg-primary/90">
                  Criar Pasta
                </Button>
              </form>
            </DialogContent>
          </Dialog>

          {currentFolderId && (
            <Dialog open={uploadDialogOpen} onOpenChange={(open) => { 
              setUploadDialogOpen(open); 
              if (!open) { 
                setSelectedFile(null); 
                setUploadNotes(''); 
              } 
            }}>
              <DialogTrigger asChild>
                <Button className="bg-primary hover:bg-primary/90">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload PDF
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-border">
                <DialogHeader>
                  <DialogTitle className="text-foreground">Upload de Laudo</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleUploadFile} className="space-y-4">
                  <div>
                    <Label className="text-foreground">Pasta Destino</Label>
                    <Input
                      value={currentFolder?.name || ''}
                      disabled
                      className="bg-input border-border text-foreground"
                    />
                  </div>

                  <div>
                    <Label className="text-foreground">Arquivo PDF *</Label>
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={(e) => setSelectedFile(e.target.files[0])}
                      className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                      required
                    />
                  </div>

                  <div>
                    <Label className="text-foreground">Observações</Label>
                    <Textarea
                      value={uploadNotes}
                      onChange={(e) => setUploadNotes(e.target.value)}
                      className="bg-input border-border text-foreground"
                      placeholder="Notas sobre o arquivo..."
                      rows={3}
                    />
                  </div>

                  <Button 
                    type="submit" 
                    disabled={uploading} 
                    className="w-full bg-primary hover:bg-primary/90"
                  >
                    {uploading ? 'Enviando...' : 'Enviar Arquivo'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Breadcrumb Navigation */}
      <Card className="p-4 border shadow-sm">
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant={currentFolderId === null ? "default" : "ghost"}
            size="sm"
            onClick={() => navigateToFolder(null)}
            className="gap-2"
          >
            <Home className="w-4 h-4" />
            Raiz
          </Button>
          
          {breadcrumb.map((folder, index) => (
            <React.Fragment key={folder.id}>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
              <Button
                variant={index === breadcrumb.length - 1 ? "default" : "ghost"}
                size="sm"
                onClick={() => navigateToFolder(folder.id)}
              >
                {folder.name}
              </Button>
            </React.Fragment>
          ))}
        </div>
      </Card>

      {/* Main Content */}
      <Card className="p-6 border shadow-sm min-h-[400px]">
        {/* Back Button */}
        {currentFolderId && (
          <Button
            variant="outline"
            size="sm"
            onClick={goBack}
            className="mb-4 gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Button>
        )}

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Carregando...</div>
        ) : (
          <div className="space-y-6">
            {/* Subfolders */}
            {currentLevelFolders.length > 0 && (
              <div>
                <h3 className="text-foreground font-semibold mb-3 flex items-center gap-2">
                  <Folder className="w-5 h-5 text-primary" />
                  Pastas ({currentLevelFolders.length})
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {currentLevelFolders.map((folder) => (
                    <div
                      key={folder.id}
                      className="group relative p-4 rounded-lg border border-border bg-muted/30 hover:bg-muted hover:border-primary/50 cursor-pointer transition-all"
                      onClick={() => navigateToFolder(folder.id)}
                    >
                      <div className="flex flex-col items-center text-center">
                        <FolderOpen className="w-12 h-12 text-amber-500 mb-2" />
                        <span className="text-foreground text-sm font-medium truncate w-full">
                          {folder.name}
                        </span>
                        <span className="text-muted-foreground text-xs mt-1">
                          {allFolders.filter(f => f.parent_id === folder.id).length} subpastas
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="absolute top-2 right-2 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 hover:bg-red-50"
                        onClick={(e) => handleDeleteFolder(folder.id, e)}
                      >
                        <Trash2 className="w-3 h-3 text-red-600" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Files */}
            {currentFolderId && (
              <div>
                <h3 className="text-foreground font-semibold mb-3 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  Arquivos ({files.length})
                </h3>
                
                {files.length === 0 ? (
                  <div className="text-center py-8 bg-muted/30 rounded-lg">
                    <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                    <p className="text-muted-foreground">Nenhum arquivo nesta pasta</p>
                    <p className="text-muted-foreground/70 text-sm mt-1">
                      Use o botão &ldquo;Upload PDF&rdquo; para adicionar
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {files.map((file) => (
                      <Card key={file.id} className="p-4 bg-muted/30 border-border hover:border-primary/50 transition-all">
                        <div className="flex items-start gap-3 mb-3">
                          <FileCheck className="w-10 h-10 text-red-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-foreground font-medium text-sm truncate mb-1">{file.filename}</p>
                            <p className="text-muted-foreground text-xs">
                              {(file.size / 1024).toFixed(1)} KB
                            </p>
                          </div>
                        </div>

                        {file.notes && (
                          <p className="text-muted-foreground text-xs mb-3 line-clamp-2">{file.notes}</p>
                        )}

                        <div className="text-xs text-muted-foreground/70 mb-3">
                          <p>Por: {file.uploaded_by_name}</p>
                          <p>{new Date(file.uploaded_at).toLocaleString('pt-BR')}</p>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 border-border text-foreground hover:bg-muted"
                            onClick={() => handleDownloadFile(file)}
                          >
                            <Download className="w-3 h-3 mr-1" />
                            Baixar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-red-200 text-red-600 hover:bg-red-50"
                            onClick={() => handleDeleteFile(file.id)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Empty State for Root */}
            {!currentFolderId && currentLevelFolders.length === 0 && (
              <div className="text-center py-12">
                <FolderPlus className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground text-lg">Nenhuma pasta criada</p>
                <p className="text-muted-foreground/70 text-sm mt-2">
                  Clique em &ldquo;Nova Pasta&rdquo; para começar a organizar seus laudos
                </p>
              </div>
            )}

            {/* Info when in root but has no files */}
            {!currentFolderId && currentLevelFolders.length > 0 && (
              <div className="text-center py-8 bg-muted/30 rounded-lg">
                <Folder className="w-12 h-12 text-primary mx-auto mb-2" />
                <p className="text-muted-foreground">Selecione uma pasta para ver os arquivos</p>
                <p className="text-muted-foreground/70 text-sm mt-1">
                  Você pode criar subpastas dentro de qualquer pasta
                </p>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};
