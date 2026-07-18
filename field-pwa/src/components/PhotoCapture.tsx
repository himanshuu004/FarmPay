import { useRef, useState } from 'react';

export type CapturedPhoto = { file: File; previewUrl: string; ref?: string; uploading?: boolean };

/**
 * Live-capture-only photo input (Convention 9/25/32). The `capture`
 * attribute forces mobile browsers to open the camera directly rather than
 * a file/gallery picker — the closest a web app can get to native
 * camera-only capture. (A determined desktop-browser user could bypass
 * this via devtools; on the real target device — a phone in the field —
 * `capture="environment"` reliably opens the camera app.)
 */
export function PhotoCaptureButton({ label, onCapture }: { label: string; onCapture: (photo: CapturedPhoto) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onCapture({ file, previewUrl: URL.createObjectURL(file) });
          e.target.value = '';
        }}
      />
      <button type="button" className="btn sm ghost" onClick={() => inputRef.current?.click()}>
        📷 {label}
      </button>
    </>
  );
}

export function PhotoThumbGrid({ photos, onAdd, addLabel }: { photos: CapturedPhoto[]; onAdd: (p: CapturedPhoto) => void; addLabel: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="photo-thumbs">
      {photos.map((p, i) => (
        <div className="photo-thumb" key={i}>
          <img src={p.previewUrl} alt={`capture ${i + 1}`} />
        </div>
      ))}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onAdd({ file, previewUrl: URL.createObjectURL(file) });
          e.target.value = '';
        }}
      />
      <button type="button" className="photo-add" onClick={() => inputRef.current?.click()}>
        + {addLabel}
      </button>
    </div>
  );
}

export function useGeo() {
  const [geo, setGeo] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const capture = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not available on this device.');
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setLocating(false);
      },
      () => {
        setError('Location permission denied or unavailable.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return { geo, locating, error, capture };
}
