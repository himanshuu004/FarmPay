import { useState } from 'react';
import { submitVerification, uploadEvidence, type VerificationBody } from '../api/fieldApi';
import { PhotoThumbGrid, useGeo, type CapturedPhoto } from '../components/PhotoCapture';
import { enqueueVerification, newOpUuid } from '../offline/db';

export function VerificationScreen({
  appUuid,
  farmerName,
  online,
  onDone,
}: {
  appUuid: string;
  farmerName: string | null;
  online: boolean;
  onDone: () => void;
}) {
  const shed = useGeo();
  const residence = useGeo();
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [existingCattleNote, setExistingCattleNote] = useState('');
  const [identityOk, setIdentityOk] = useState(false);
  const [membershipOk, setMembershipOk] = useState(false);
  const [milkPouringOk, setMilkPouringOk] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = shed.geo && residence.geo && photos.length >= 1;

  const submit = async (result: 'APPROVED' | 'RETURNED') => {
    if (!canSubmit) return;
    if (result === 'RETURNED' && !remarks.trim()) {
      setError('A reason is required to return this application for correction.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Upload photos first — evidence upload is not offline-queueable
      // (real bytes, real hash), so if we're offline we simply can't attach
      // photos yet: fall through to the queue path with mediaRefs empty and
      // ask the supervisor to retry once online instead of silently losing
      // the captured images.
      const mediaRefs: string[] = [];
      if (online) {
        for (const p of photos) {
          const res = await uploadEvidence(appUuid, p.file, 'verify.jpg');
          if (res.success) mediaRefs.push((res.data as { url: string }).url);
        }
      }

      const body: VerificationBody = {
        result,
        ...(result === 'RETURNED' ? { remarks: remarks.trim() } : {}),
        shedGeo: { lat: shed.geo!.lat, lng: shed.geo!.lng },
        residenceGeo: { lat: residence.geo!.lat, lng: residence.geo!.lng },
        mediaRefs,
        checks: {
          identity_ok: identityOk,
          membership_ok: membershipOk,
          milk_pouring_ok: milkPouringOk,
          ...(existingCattleNote.trim() ? { existing_cattle_note: existingCattleNote.trim() } : {}),
        },
      };

      if (!online || mediaRefs.length < photos.length) {
        // Offline, or a photo upload failed mid-flight — queue for later
        // idempotent replay via /field/sync rather than losing the work.
        await enqueueVerification({ opUuid: newOpUuid(), clientTs: new Date().toISOString(), appUuid, ...body });
        onDone();
        return;
      }

      const res = await submitVerification(appUuid, body);
      if (res.success) {
        onDone();
      } else {
        setError(res.message || 'Could not submit. Try again.');
      }
    } catch {
      // Network failure mid-submit — queue it so nothing is lost.
      await enqueueVerification({
        opUuid: newOpUuid(),
        clientTs: new Date().toISOString(),
        appUuid,
        result,
        ...(result === 'RETURNED' ? { remarks: remarks.trim() } : {}),
        shedGeo: { lat: shed.geo!.lat, lng: shed.geo!.lng },
        residenceGeo: { lat: residence.geo!.lat, lng: residence.geo!.lng },
        mediaRefs: [],
        checks: { identity_ok: identityOk, membership_ok: membershipOk, milk_pouring_ok: milkPouringOk },
      });
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="content">
      <div className="card">
        <p className="muted">Applicant</p>
        <p style={{ fontWeight: 800, fontSize: 15 }}>{farmerName || appUuid}</p>
      </div>

      <div className="section-label">Checks</div>
      <div className="card">
        <CheckRow label="Identity matches ERP record" checked={identityOk} onChange={setIdentityOk} />
        <CheckRow label="Society membership confirmed" checked={membershipOk} onChange={setMembershipOk} />
        <CheckRow label="Milk-pouring activity confirmed" checked={milkPouringOk} onChange={setMilkPouringOk} />
      </div>

      <label className="field-label">Existing cattle (optional note)</label>
      <textarea className="input" rows={2} value={existingCattleNote} onChange={(e) => setExistingCattleNote(e.target.value)} placeholder="e.g. 2 crossbred cows on shed" />

      <div className="section-label">Shed location</div>
      <GeoField g={shed} />
      <div className="section-label">Residence location</div>
      <GeoField g={residence} />

      <div className="section-label">Live photos (shed / land proof)</div>
      <PhotoThumbGrid photos={photos} onAdd={(p) => setPhotos((prev) => [...prev, p])} addLabel="Add" />

      <label className="field-label">Remarks (required if returning)</label>
      <textarea className="input" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Reason for return, if any" />

      {error && (
        <div className="card" style={{ background: 'var(--danger-bg)', border: '1px solid #f1c7c1' }}>
          <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn danger-ghost" disabled={!canSubmit || busy} onClick={() => submit('RETURNED')}>
          Return for correction
        </button>
        <button className="btn" disabled={!canSubmit || busy} onClick={() => submit('APPROVED')}>
          {busy ? <span className="spinner" /> : 'Verify & forward to DUSS'}
        </button>
      </div>
      {!online && <p className="muted" style={{ textAlign: 'center', marginTop: 8 }}>Offline — this will queue and sync automatically.</p>}
    </div>
  );
}

function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="checklist-row" onClick={() => onChange(!checked)} style={{ cursor: 'pointer' }}>
      <span className={`dot ${checked ? 'on' : ''}`} />
      {label}
    </div>
  );
}

function GeoField({ g }: { g: ReturnType<typeof useGeo> }) {
  return (
    <>
      <div className="geo-box">
        {g.geo ? (
          <>
            <div className="ok">✓ Position captured</div>
            <div className="coord">
              {g.geo.lat.toFixed(4)}, {g.geo.lng.toFixed(4)} · accuracy {Math.round(g.geo.accuracy)}m
            </div>
          </>
        ) : (
          <div className="wait">{g.locating ? 'Getting your position…' : 'Not captured yet'}</div>
        )}
      </div>
      {g.error && <p style={{ color: 'var(--danger)', fontSize: 12 }}>{g.error}</p>}
      <button className="btn sm ghost" onClick={g.capture} disabled={g.locating}>
        📍 Capture location
      </button>
    </>
  );
}
