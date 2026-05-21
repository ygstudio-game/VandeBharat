import { useState } from 'react';
import { CheckSquare, Square } from 'lucide-react';

export default function FrameGrid({ frames, selected, onToggle, onSelectAll }) {
  const [hover, setHover] = useState(null);

  if (!frames.length)
    return <p className="text-xs text-gray-600 py-6 text-center">No frames found.</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-500">{frames.length} frames</p>
        <button
          onClick={onSelectAll}
          className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1"
        >
          {selected.length === frames.length ? (
            <><CheckSquare size={12} /> Deselect all</>
          ) : (
            <><Square size={12} /> Select all</>
          )}
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2 max-h-80 overflow-y-auto pr-1">
        {frames.map((f) => {
          const isSelected = selected.includes(f.id);
          const thumb = f.thumbnail_url || f.cloudinary_url;
          return (
            <div
              key={f.id}
              onClick={() => onToggle(f.id)}
              onMouseEnter={() => setHover(f.id)}
              onMouseLeave={() => setHover(null)}
              className={`relative cursor-pointer rounded overflow-hidden border-2 transition-all ${
                isSelected ? 'border-amber-500' : 'border-transparent hover:border-gray-600'
              }`}
            >
              <img
                src={thumb}
                alt={`frame ${f.sequence_number}`}
                className="w-full aspect-video object-cover bg-gray-800"
                loading="lazy"
              />
              {isSelected && (
                <div className="absolute top-1 right-1 bg-amber-500 rounded-full p-0.5">
                  <CheckSquare size={10} className="text-black" />
                </div>
              )}
              {f.is_ocr_candidate && (
                <span className="absolute bottom-1 left-1 text-[9px] bg-blue-600 text-white px-1 rounded">
                  OCR
                </span>
              )}
              {hover === f.id && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <span className="text-xs text-white">#{f.sequence_number}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
