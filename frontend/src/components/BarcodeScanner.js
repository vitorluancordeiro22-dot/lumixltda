import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Camera, Keyboard, Flashlight } from 'lucide-react';

// Formatos de rótulo: EAN-13/8, UPC, Code 128/39, ITF e QR.
const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'];
const CAMERA = { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false };

const cameraError = (e) => {
  const name = e?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Permita o acesso à câmera no navegador (cadeado ao lado do endereço) e abra de novo.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'Nenhuma câmera encontrada neste aparelho. Digite o código abaixo.';
  if (name === 'NotReadableError') return 'A câmera está sendo usada por outro aplicativo. Feche-o e tente de novo.';
  return 'Não foi possível abrir a câmera. Digite o código abaixo.';
};

/** Leitor nativo do aparelho (Chrome/Android), quando disponível e com EAN-13. */
const nativeDetector = async () => {
  if (!('BarcodeDetector' in window)) return null;
  try {
    const supported = await window.BarcodeDetector.getSupportedFormats();
    const formats = NATIVE_FORMATS.filter((f) => supported.includes(f));
    if (!formats.includes('ean_13')) return null;
    return new window.BarcodeDetector({ formats });
  } catch { return null; }
};

const improveCamera = async (track) => {
  try {
    const caps = track.getCapabilities ? track.getCapabilities() : {};
    if (caps.focusMode?.includes('continuous')) await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
    return Boolean(caps.torch);
  } catch { return false; }
};

/**
 * Lê código de barras pela câmera. Também aceita digitação manual
 * (ou leitor USB, que "digita" o código e aperta Enter).
 */
export const BarcodeScanner = ({ open, onOpenChange, onDetected, title = 'Ler código de barras' }) => {
  const videoRef = useRef(null);
  const trackRef = useRef(null);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [manual, setManual] = useState('');
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    let stopped = false;
    let done = false;
    let stream = null;
    let reader = null;
    let timer = null;
    setError(''); setManual(''); setStatus('Abrindo câmera...'); setTorchAvailable(false); setTorchOn(false);

    const found = (text) => {
      if (done || stopped || !text) return;
      done = true;
      if (navigator.vibrate) navigator.vibrate(80);
      onDetectedRef.current(String(text).trim());
    };

    const waitVideo = async () => {
      for (let i = 0; i < 40 && !videoRef.current; i += 1) await new Promise((r) => setTimeout(r, 25));
      return videoRef.current;
    };

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Este navegador não permite usar a câmera aqui (precisa de https). Digite o código abaixo.');
        setStatus('');
        return;
      }
      const video = await waitVideo();
      if (stopped || !video) return;
      try {
        stream = await navigator.mediaDevices.getUserMedia(CAMERA);
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        video.srcObject = stream;
        await video.play().catch(() => {});
        trackRef.current = stream.getVideoTracks()[0];
        setTorchAvailable(await improveCamera(trackRef.current));

        // Leitor: nativo do aparelho (Android/Chrome) ou ZXing (iPhone e outros).
        let decode;
        const detector = await nativeDetector();
        if (detector) {
          decode = async () => {
            const codes = await detector.detect(video);
            return codes.length ? codes[0].rawValue : null;
          };
        } else {
          const ZX = await import('@zxing/library');
          const hints = new Map();
          hints.set(ZX.DecodeHintType.POSSIBLE_FORMATS, [
            ZX.BarcodeFormat.EAN_13, ZX.BarcodeFormat.EAN_8, ZX.BarcodeFormat.UPC_A, ZX.BarcodeFormat.UPC_E,
            ZX.BarcodeFormat.CODE_128, ZX.BarcodeFormat.CODE_39, ZX.BarcodeFormat.ITF, ZX.BarcodeFormat.QR_CODE,
          ]);
          hints.set(ZX.DecodeHintType.TRY_HARDER, true);
          reader = new ZX.MultiFormatReader();
          reader.setHints(hints);
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          decode = async () => {
            // copia o quadro atual (no máximo 960 px de largura) e tenta ler
            const scale = Math.min(1, 960 / video.videoWidth);
            canvas.width = Math.round(video.videoWidth * scale);
            canvas.height = Math.round(video.videoHeight * scale);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            try {
              const bitmap = new ZX.BinaryBitmap(new ZX.HybridBinarizer(new ZX.HTMLCanvasElementLuminanceSource(canvas)));
              return reader.decodeWithState(bitmap).getText();
            } catch { return null; } finally { reader.reset(); }
          };
        }
        if (stopped) return;
        setStatus('Aponte para o código de barras');
        const loop = async () => {
          if (stopped || done) return;
          try {
            if (video.readyState >= 2 && video.videoWidth) {
              const text = await decode();
              if (text) return found(text);
            }
          } catch { /* quadro ruim: tenta o próximo */ }
          timer = setTimeout(loop, 150);
        };
        loop();
      } catch (e) {
        if (!stopped) { setError(cameraError(e)); setStatus(''); }
      }
    };
    start();

    return () => {
      stopped = true;
      clearTimeout(timer);
      const s = stream || videoRef.current?.srcObject;
      s?.getTracks?.().forEach((t) => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      trackRef.current = null;
    };
  }, [open]);

  const toggleTorch = async () => {
    try {
      await trackRef.current?.applyConstraints({ advanced: [{ torch: !torchOn }] });
      setTorchOn(!torchOn);
    } catch { setTorchAvailable(false); }
  };

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
        <div className="relative w-full overflow-hidden rounded-lg bg-black aspect-[4/3]">
          <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted autoPlay />
          <div className="pointer-events-none absolute inset-x-[8%] top-1/2 -translate-y-1/2 h-[38%] rounded-md border-2 border-white/80" />
          <div className="pointer-events-none absolute inset-x-[10%] top-1/2 h-0.5 bg-red-500/90" />
          {torchAvailable && (
            <Button type="button" size="icon" variant="secondary" onClick={toggleTorch}
                    className={`absolute right-2 bottom-2 ${torchOn ? 'bg-yellow-300 text-black' : ''}`} title="Lanterna">
              <Flashlight className="w-5 h-5" />
            </Button>
          )}
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p>
          : <p className="text-xs text-muted-foreground">{status} · deixe o código na horizontal, sobre a linha vermelha, a uns 15 cm.</p>}
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
