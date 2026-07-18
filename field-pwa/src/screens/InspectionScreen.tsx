import { useState } from 'react';
import { submitInspection, uploadEvidence } from '../api/fieldApi';
import { PhotoThumbGrid, type CapturedPhoto } from '../components/PhotoCapture';

export function InspectionScreen({
  appUuid,
  farmerName,
  dueDay,
  earTagNo,
  onDone,
}: {
  appUuid: string;
  farmerName: string | null;
  dueDay: 7 | 30 | 90;
  earTagNo: string | null;
  onDone: () => void;
}) {
  const [tag, setTag] = useState(earTagNo || '');
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [healthy, setHealthy] = useState(true);
  const [milkYield, setMilkYield] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tagValid = /^\d{12}$/.test(tag);
  const canSubmit = tagValid && photos.length >= 1;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const photoRefs: string[] = [];
      for (const p of photos) {
        const res = await uploadEvidence(appUuid, p.file, 'inspection.jpg');
        if (res.success) photoRefs.push((res.data as { url: string }).url);
      }
      if (photoRefs.length === 0) {
        setError('Photo upload failed — check your connection and try again.');
        return;
      }
      const res = await submitInspection(appUuid, {
        dueDay,
        earTagNo: tag,
        photoRefs,
        healthy,
        ...(milkYield.trim() ? { milkYield: Number(milkYield) } : {}),
      });
      if (res.success) {
        onDone();
      } else if (res.errorCode === 'CIA_INSPECTION_DONE') {
        setError('This inspection was already recorded.');
      } else {
        setError(res.message || 'Could not submit. Try again.');
      }
    } catch {
      setError('Could not connect. Check your internet connection.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="content">
      <div className="card">
        <p className="muted">Applicant</p>
        <p style={{ fontWeight: 800, fontSize: 15 }}>{farmerName || appUuid}</p>
        <p className="muted" style={{ marginTop: 4 }}>
          {dueDay}-day inspection
        </p>
      </div>

      <label className="field-label">Ear tag (re-confirm)</label>
      <input
        className="input"
        value={tag}
        onChange={(e) => setTag(e.target.value.replace(/\D/g, '').slice(0, 12))}
        placeholder="123456789012"
        inputMode="numeric"
      />
      <p style={{ fontSize: 12, marginTop: 4, color: tagValid ? 'var(--brand-dark)' : 'var(--danger)' }}>
        {tagValid ? '✓ Valid' : `${tag.length}/12 digits`}
      </p>

      <div className="section-label">Live re-capture (same animal)</div>
      <PhotoThumbGrid photos={photos} onAdd={(p) => setPhotos((prev) => [...prev, p])} addLabel="Add" />

      <div className="checklist-row" style={{ marginTop: 10, cursor: 'pointer' }} onClick={() => setHealthy(!healthy)}>
        <span className={`dot ${healthy ? 'on' : ''}`} />
        Animal appears healthy
      </div>

      <label className="field-label">Milk yield (litres/day, optional)</label>
      <input className="input" type="number" value={milkYield} onChange={(e) => setMilkYield(e.target.value)} placeholder="9.5" />

      {error && (
        <div className="card" style={{ background: 'var(--danger-bg)', border: '1px solid #f1c7c1' }}>
          <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>
        </div>
      )}

      <button className="btn" style={{ marginTop: 12 }} disabled={!canSubmit || busy} onClick={submit}>
        {busy ? <span className="spinner" /> : 'Submit inspection'}
      </button>
    </div>
  );
}
