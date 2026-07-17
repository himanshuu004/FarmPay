/**
 * SLA clock engine (§7.2). Livestock death: settlement is due ≤ 15 days from
 * document submission (NLM). On breach, accrue 12% p.a. COMPOUND penal interest
 * (auto, farmer-visible) and escalate. Statutory clocks/rates are config (#5);
 * decisions are never automated — the clock only accrues interest and alerts, a
 * human still settles (#10).
 */
const { round2 } = require('../../../shared/utils/moneyHelper');
const { emitDomainEvent } = require('../../../shared/services/domainEvents');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

const SETTLEMENT_DAYS = 15;   // NLM: from docs-complete
const PENAL_RATE_PA = 0.12;   // 12% p.a. compound
const OPEN_STAGES = ['DOCS_SUBMITTED', 'UNDER_REVIEW'];

const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const daysOverdue = (deadline, asOf) => Math.max(0, (new Date(asOf) - new Date(deadline)) / 86400000);

/** The settlement deadline = docs-complete + 15 days. */
const settlementDeadline = (docsCompleteAt) => addDays(docsCompleteAt, SETTLEMENT_DAYS);

/** Compound (daily) 12% p.a. penal interest on `principal`, 0 until the deadline. */
const penalInterest = (principal, deadlineAt, asOf) => {
  const d = daysOverdue(deadlineAt, asOf);
  if (d <= 0) return 0;
  return round2(Number(principal) * (Math.pow(1 + PENAL_RATE_PA / 365, d) - 1));
};

/**
 * Tick: for every open claim past its settlement deadline, (re)accrue penal
 * interest and escalate. Idempotent — penal_interest_accrued is recomputed to
 * the current total each tick, never additively double-counted.
 */
const tick = async (asOf = new Date()) => {
  const { ClaimCase } = getDb();
  const claims = await ClaimCase.findAll({ where: { status: OPEN_STAGES } });
  let breached = 0;
  for (const c of claims) {
    if (!c.docs_complete_at) continue;
    const deadline = c.stage_deadline_at || settlementDeadline(c.docs_complete_at);
    const penal = penalInterest(c.sum_claimed, deadline, asOf);
    if (penal <= 0) continue;

    const firstBreach = !c.escalated;
    await c.update({
      penal_interest_accrued: penal,
      escalated: true,
      escalated_at: c.escalated_at || asOf,
    });
    await emitDomainEvent({
      eventType: 'claims.sla.breach', aggregateType: 'ClaimCase', aggregateId: c.claim_uuid,
      farmerId: c.farmer_id, payload: { deadline, penalAccrued: penal, firstBreach },
    });
    if (firstBreach) {
      try {
        const notifier = require('../../../shared/services/notificationService');
        if (notifier && notifier.sendNotification) {
          await notifier.sendNotification({ userId: c.farmer_id, title: 'Your claim has crossed the 15-day settlement window', body: 'Penal interest at 12% p.a. is now accruing in your favour.', channels: ['sms'] });
        }
      } catch { /* best-effort */ }
    }
    breached += 1;
  }
  return { breached };
};

module.exports = { settlementDeadline, penalInterest, tick, SETTLEMENT_DAYS, PENAL_RATE_PA };
