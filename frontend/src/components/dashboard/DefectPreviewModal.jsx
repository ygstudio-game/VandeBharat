import React, { useRef, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';

// Lightweight image preview with a single bbox overlay — used wherever a defect
// feed has no coachFrames/coachIntel context to drive the full Reports.jsx frame modal.
export function DefectPreviewModal({ defect, onClose }) {
  const imgRef = useRef(null);
  const canvasRef = useRef(null);

  const draw = useCallback(() => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas || !img.naturalWidth || !defect.bbox) return;
    const scaleX = img.offsetWidth / img.naturalWidth;
    const scaleY = img.offsetHeight / img.naturalHeight;
    canvas.width = img.offsetWidth;
    canvas.height = img.offsetHeight;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const { x, y, w, h } = defect.bbox;
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.strokeRect(x * scaleX, y * scaleY, w * scaleX, h * scaleY);
    ctx.fillStyle = 'rgba(239,68,68,0.12)';
    ctx.fillRect(x * scaleX, y * scaleY, w * scaleX, h * scaleY);
  }, [defect]);

  useEffect(() => { draw(); }, [draw]);

  const url = defect.cloudinary_url || defect.thumbnail_url;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-6"
      style={{ background: 'rgba(5,26,62,0.82)', backdropFilter: 'blur(5px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded overflow-hidden shadow-2xl border border-slate-700 bg-slate-900 relative"
        style={{ maxHeight: '88vh' }}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-1.5 bg-slate-800 hover:bg-red-600 text-slate-400 hover:text-white rounded border border-slate-700 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="absolute top-3 left-3 z-10 bg-slate-900/90 backdrop-blur-sm px-3 py-1.5 rounded border border-slate-700 text-[10px] font-mono text-white">
          <span className="font-extrabold text-red-400">{defect.defect_type}</span>
          {defect.severity && <span className="ml-2 text-slate-400">{defect.severity}</span>}
        </div>
        <div className="flex items-center justify-center min-h-[300px] p-8">
          {url ? (
            <div className="relative inline-block">
              <img
                ref={imgRef}
                src={url}
                alt={defect.defect_type}
                className="max-w-full max-h-[70vh] object-contain rounded block"
                onLoad={draw}
              />
              <canvas ref={canvasRef} className="absolute top-0 left-0 pointer-events-none" />
            </div>
          ) : (
            <span className="text-slate-500 text-xs font-mono">No image available</span>
          )}
        </div>
      </div>
    </div>
  );
}
