import React, { useEffect, useRef, useState } from 'react';
import { Camera, QrCode, X, Search } from 'lucide-react';

interface BarcodeCameraModalProps {
  isOpen: boolean;
  title?: string;
  onDetected: (barcode: string) => void;
  onClose: () => void;
}

export const BarcodeCameraModal: React.FC<BarcodeCameraModalProps> = ({
  isOpen,
  title = 'مسح الباركود بكاميرا الهاتف',
  onDetected,
  onClose,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string>('');
  const [detectorSupported, setDetectorSupported] = useState<boolean>(true);
  const [manualCode, setManualCode] = useState<string>('');
  const manualInputRef = useRef<HTMLInputElement>(null);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }

    setManualCode('');
    setCameraError('');
    let cancelled = false;
    let rafId = 0;

    const hasDetector = typeof window !== 'undefined' && 'BarcodeDetector' in window;
    setDetectorSupported(hasDetector);

    const startCamera = async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('المتصفح لا يدعم الوصول إلى الكاميرا هنا. يمكنك إدخال الباركود أو استخدام قارئ USB أدناه.');
        setTimeout(() => manualInputRef.current?.focus(), 80);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }

        if (!hasDetector) {
          setCameraError('كاميرا المتصفح مفتوحة، لكن خاصية قراءة الباركود التلقائية غير مدعومة على هذا المتصفح. أدخل الكود يدوياً أدناه.');
          setTimeout(() => manualInputRef.current?.focus(), 80);
          return;
        }

        const BarcodeDetectorCtor = (window as any).BarcodeDetector;
        let detector: any = null;
        try {
          detector = new BarcodeDetectorCtor({
            formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code', 'itf'],
          });
        } catch {
          detector = new BarcodeDetectorCtor();
        }

        let lastScanTime = 0;
        const scanLoop = async (ts: number) => {
          if (cancelled) return;
          if (ts - lastScanTime >= 220 && videoRef.current && videoRef.current.readyState >= 2) {
            lastScanTime = ts;
            try {
              const barcodes = await detector.detect(videoRef.current);
              if (barcodes && barcodes.length > 0) {
                const raw = (barcodes[0].rawValue || '').trim();
                if (raw) {
                  stopCamera();
                  onDetected(raw);
                  return;
                }
              }
            } catch {
              // ignore transient detect errors
            }
          }
          rafId = requestAnimationFrame(scanLoop);
        };

        rafId = requestAnimationFrame(scanLoop);
      } catch {
        if (!cancelled) {
          setCameraError('تعذر تشغيل الكاميرا (تحقق من صلاحية الكاميرا). يمكنك إدخال الباركود يدوياً أو بماسح USB أدناه.');
          setTimeout(() => manualInputRef.current?.focus(), 80);
        }
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      stopCamera();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = manualCode.trim();
    if (!cleaned) return;
    stopCamera();
    onDetected(cleaned);
  };

  return (
    <div className="fixed inset-0 z-[10000] bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4" dir="rtl">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white">
          <div className="flex items-center gap-2 min-w-0">
            <Camera className="w-5 h-5 text-emerald-400 shrink-0" />
            <h3 className="font-bold text-sm truncate">{title}</h3>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/15 transition-colors shrink-0"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="relative w-full aspect-[4/3] bg-slate-950 rounded-xl overflow-hidden border border-slate-300 flex items-center justify-center">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="w-full h-full object-cover"
            />
            {detectorSupported && !cameraError && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="w-56 h-28 border-2 border-emerald-400 rounded-xl shadow-[0_0_0_9999px_rgba(15,23,42,0.35)] relative">
                  <div className="absolute inset-x-3 top-1/2 h-0.5 bg-rose-500/80 animate-pulse" />
                </div>
              </div>
            )}
          </div>

          {cameraError ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-900 leading-relaxed">
              {cameraError}
            </div>
          ) : (
            <p className="text-xs text-center text-slate-600 flex items-center justify-center gap-1.5">
              <QrCode className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>وجّه الكاميرا نحو الباركود ليتم التقاطه تلقائياً</span>
            </p>
          )}

          <form onSubmit={submitManual} className="flex items-center gap-2 pt-1">
            <input
              ref={manualInputRef}
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="أو اكتب الباركود / مرر قارئ USB هنا..."
              className="flex-1 min-w-0 px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="submit"
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold flex items-center gap-1.5 shrink-0 transition-colors"
            >
              <Search className="w-4 h-4" />
              <span>تطبيق</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
