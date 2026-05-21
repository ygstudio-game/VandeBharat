import { useEffect, useRef } from 'react';

// boxes: [{ bbox_x, bbox_y, bbox_w, bbox_h, label, confidence, color? }]
export default function BboxOverlay({ imageUrl, boxes = [], naturalWidth, naturalHeight }) {
  const imgRef = useRef(null);
  const canvasRef = useRef(null);

  function draw() {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;

    const scaleX = img.clientWidth / (naturalWidth || img.naturalWidth || 1);
    const scaleY = img.clientHeight / (naturalHeight || img.naturalHeight || 1);

    canvas.width = img.clientWidth;
    canvas.height = img.clientHeight;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    boxes.forEach((box) => {
      const x = box.bbox_x * scaleX;
      const y = box.bbox_y * scaleY;
      const w = box.bbox_w * scaleX;
      const h = box.bbox_h * scaleY;
      const color = box.color || '#f59e0b';

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);

      const label = `${box.label ?? ''} ${box.confidence ? (box.confidence * 100).toFixed(0) + '%' : ''}`.trim();
      if (label) {
        ctx.fillStyle = color;
        ctx.font = '11px monospace';
        const tw = ctx.measureText(label).width;
        ctx.fillRect(x, y - 16, tw + 6, 16);
        ctx.fillStyle = '#000';
        ctx.fillText(label, x + 3, y - 3);
      }
    });
  }

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    if (img.complete) draw();
    else img.addEventListener('load', draw);
    return () => img.removeEventListener('load', draw);
  }, [imageUrl, boxes]);

  useEffect(() => {
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, [boxes]);

  return (
    <div className="relative inline-block w-full">
      <img
        ref={imgRef}
        src={imageUrl}
        alt="frame"
        className="w-full rounded bg-gray-800"
        onLoad={draw}
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
      />
    </div>
  );
}
