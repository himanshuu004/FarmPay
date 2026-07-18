import { useState } from 'react';
import { submitVetExam, type VetExamBody } from '../api/fieldApi';

export function VetExamScreen({
  appUuid,
  farmerName,
  earTagNo,
  onDone,
}: {
  appUuid: string;
  farmerName: string | null;
  earTagNo: string | null;
  onDone: () => void;
}) {
  const [bcs, setBcs] = useState('');
  const [testMilking, setTestMilking] = useState('');
  const [dailyYield, setDailyYield] = useState('');
  const [marketValue, setMarketValue] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [fitness, setFitness] = useState(false);
  const [vetReg, setVetReg] = useState('');
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canApprove = marketValue.trim() !== '' && purchasePrice.trim() !== '' && fitness && vetReg.trim() !== '';

  const submit = async (result: 'APPROVED' | 'REJECTED') => {
    if (result === 'REJECTED' && !remarks.trim()) {
      setError('A reason is required to reject this animal.');
      return;
    }
    if (result === 'APPROVED' && !canApprove) return;
    setBusy(true);
    setError(null);
    try {
      const body: VetExamBody =
        result === 'APPROVED'
          ? {
              result,
              bodyConditionScore: bcs ? Number(bcs) : undefined,
              testMilking: testMilking ? Number(testMilking) : undefined,
              dailyMilkYield: dailyYield ? Number(dailyYield) : undefined,
              estimatedMarketValue: Number(marketValue),
              approvedPurchasePrice: Number(purchasePrice),
              fitnessForTransport: true,
              esign: { vetReg: vetReg.trim() },
            }
          : { result, remarks: remarks.trim() };
      const res = await submitVetExam(appUuid, body);
      if (res.success) {
        onDone();
      } else if (res.errorCode === 'CIA_PRICE_OVER_CEILING') {
        setError('Approved purchase price exceeds the scheme price ceiling.');
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
        <p className="muted" style={{ marginTop: 4 }}>Ear tag: {earTagNo || '—'}</p>
      </div>

      <div className="section-label">Examination</div>
      <label className="field-label">Body condition score (1–5)</label>
      <input className="input" type="number" min={1} max={5} step={0.5} value={bcs} onChange={(e) => setBcs(e.target.value)} placeholder="3.5" />
      <label className="field-label">Test milking (litres)</label>
      <input className="input" type="number" value={testMilking} onChange={(e) => setTestMilking(e.target.value)} placeholder="9" />
      <label className="field-label">Daily milk yield (litres)</label>
      <input className="input" type="number" value={dailyYield} onChange={(e) => setDailyYield(e.target.value)} placeholder="10" />

      <div className="section-label">Valuation</div>
      <label className="field-label">Estimated market value (₹)</label>
      <input className="input" type="number" value={marketValue} onChange={(e) => setMarketValue(e.target.value)} placeholder="60000" />
      <label className="field-label">Approved purchase price (₹)</label>
      <input className="input" type="number" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} placeholder="60000" />

      <div className="checklist-row" style={{ marginTop: 10, cursor: 'pointer' }} onClick={() => setFitness(!fitness)}>
        <span className={`dot ${fitness ? 'on' : ''}`} />
        Fit for transport
      </div>

      <label className="field-label">Vet registration no. (e-sign)</label>
      <input className="input" value={vetReg} onChange={(e) => setVetReg(e.target.value)} placeholder="UK-VET-4821" />

      <label className="field-label">Remarks (required if rejecting)</label>
      <textarea className="input" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Reason for rejection, if any" />

      {error && (
        <div className="card" style={{ background: 'var(--danger-bg)', border: '1px solid #f1c7c1' }}>
          <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn danger-ghost" disabled={busy} onClick={() => submit('REJECTED')}>
          Reject
        </button>
        <button className="btn" disabled={!canApprove || busy} onClick={() => submit('APPROVED')}>
          {busy ? <span className="spinner" /> : 'Approve purchase'}
        </button>
      </div>
    </div>
  );
}
