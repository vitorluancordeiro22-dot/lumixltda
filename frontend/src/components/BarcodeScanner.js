import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Camera, Keyboard } from 'lucide-react';

// Biblioteca carregada sob demanda (não precisa instalar pacote no projeto).
const SCRIPT_URL = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
let loader = null;

const loadLibrary = () => {
  if (window.Html5Qrcode) return Promise.resolve(window.Html5Qrcode);
  if (!loader) {
    loader = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT_URL;
      script.async = true;
      script.onload = () => (window.Html5Qrcode ? resolve(window.Html5Qrcode) : reject(new Error('Leitor indisponível')));
      script.onerror = () => { loader = null; reject(new Error('Não foi possível carregar o leitor')); };
      document.body.appendChild(script);
    });
  }
  return loader;
};

const READER_ID = 'lumix-barcode-reader';

/**
 * Lê um código de barras pela câmera. Também aceita digitação manual
 * (ou leitor USB, que "digita" o código e aperta Enter).
 */
export const BarcodeScanner = ({ open, onOpenChange, onDetected, title = 'Ler código de barras' }) => {
  const scannerRef = useRef(null);
  const doneRef = useRef(false);
  const [error, setError] = useState('');
  const [manual, setManual] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    doneRef.current = false;
    setError('');
    setManual('');
    let cancelled = false;

    const start = async () => {
      try {
        const Html5Qrcode = await loadLibrary();
        if (cancelled) return;
        // espera o elemento do diálogo existir
        await new Promise((r) => setTimeout(r, 150));
        if (cancelled || !document.getElementById(READER_ID)) return;
        const scanner = new Html5Qrcode(READER_ID, {
          verbose: false,
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        });
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: (w, h) => ({ width: Math.min(w * 0.85, 320), height: Math.min(h * 0.45, 160) }) },
          (text) => {
            if (doneRef.current) return;
            doneRef.current = true;
            if (navigator.vibrate) navigator.vibrate(80);
            onDetected(String(text).trim());
          },
          () => {},
        );
      } catch (e) {
        if (!cancelled) {
          setError(e?.message?.includes('Permission') || e?.name === 'NotAllowedError'
            ? 'Permita o acesso à câmera no navegador para ler o código.'
            : 'Não foi possível abrir a câmera. Digite o código abaixo.');
        }
      }
    };
    start();

    return () => {
      cancelled = true;
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (scanner) {
        scanner.stop().then(() => scanner.clear()).catch(() => {});
      }
    };
  }, [open, onDetected]);

  const submitManual = (e) => {
    e.preventDefault();
    if (manual.trim()) onDetected(manual.trim());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Camera className="w-5 h-5" /> {title}</DialogTitle>
        </DialogHeader>
        <div id={READER_ID} className="w-full overflow-hidden rounded-lg bg-black/90 min-h-[220px]" />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <p className="text-xs text-muted-foreground">Aponte a câmera para o código de barras do rótulo.</p>
        <form onSubmit={submitManual} className="flex gap-2">
          <div className="relative flex-1">
            <Keyboard className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Ou digite o código"
                   inputMode="numeric" className="pl-9" />
          </div>
          <Button type="submit" variant="outline">OK</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
