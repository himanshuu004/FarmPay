/**
 * KCC drawing-power snapshots (¶16(4)). Drawing power tracks the ST (revolving
 * cash-credit) side against real stocks + receivables + cash flow. The member's
 * outstanding milk payables (from the COOP ERP mirror) STRENGTHEN drawing power
 * as receivables evidence — but co-op input credit is NEVER counted inside the
 * KCC limit (CLAUDE.md #15). DP is capped at the sanctioned ST sub-limit.
 */
const { round2 } = require('../../../shared/utils/moneyHelper');
const { emitDomainEvent } = require('../../../shared/services/domainEvents');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

const err = (msg, code, status = 400) => { const e = new Error(msg); e.statusCode = status; e.errorCode = code; return e; };

const findFacility = async (facilityUuid) => {
  const { KccFacility } = getDb();
  const facility = await KccFacility.findOne({ where: { facility_uuid: facilityUuid } });
  if (!facility) throw err('Facility not found', 'KCC_FACILITY_NOT_FOUND', 404);
  return facility;
};

/**
 * Best-effort read of the farmer's outstanding milk payables from the co-op
 * mirror, used ONLY as ¶16(4) receivables evidence. Returns 0 if the farmer is
 * not a linked member or the co-op module has no snapshot.
 */
const readMilkReceivables = async (farmerId) => {
  const { CoopMembership, CoopMilkSnapshot } = getDb();
  if (!CoopMembership || !CoopMilkSnapshot) return 0;
  try {
    const membership = await CoopMembership.findOne({ where: { user_id: farmerId } });
    if (!membership) return 0;
    const snap = await CoopMilkSnapshot.findOne({
      where: { farmer_ref: membership.farmer_ref }, order: [['period', 'DESC']],
    });
    return snap ? round2(Number(snap.outstanding) || 0) : 0;
  } catch { return 0; }
};

/**
 * Build and persist a drawing-power snapshot.
 * @param facilityUuid
 * @param inputs { snapshotDate?, stocksValue?, otherReceivables?, cashFlowMonthly?, milkReceivables? }
 *   milkReceivables, if omitted, is pulled from the co-op mirror.
 */
const buildSnapshot = async (facilityUuid, inputs = {}) => {
  const { KccDrawingPowerSnap } = getDb();
  const facility = await findFacility(facilityUuid);

  const stocks = round2(inputs.stocksValue || 0);
  const otherRecv = round2(inputs.otherReceivables || 0);
  const cashFlow = round2(inputs.cashFlowMonthly || 0);
  const milkRecv = inputs.milkReceivables != null
    ? round2(inputs.milkReceivables)
    : await readMilkReceivables(facility.farmer_id);

  // DP against stocks + receivables (¶16(4)). Cash flow is retained as context,
  // not summed into DP (avoids double-counting future income already implied by
  // the ST MPL). Co-op payables count ONLY as receivables here.
  const rawDp = round2(stocks + milkRecv + otherRecv);
  const stCap = facility.st_sublimit != null ? Number(facility.st_sublimit) : null;
  const drawingPower = stCap != null ? round2(Math.min(rawDp, stCap)) : rawDp;

  const snap = await KccDrawingPowerSnap.create({
    facility_id: facility.id,
    snapshot_date: inputs.snapshotDate || new Date().toISOString().slice(0, 10),
    stocks_value: stocks,
    milk_receivables: milkRecv,
    other_receivables: otherRecv,
    cash_flow_monthly: cashFlow,
    drawing_power: drawingPower,
    st_limit_cap: stCap,
  });

  await emitDomainEvent({
    eventType: 'kcc.drawing_power.snapshot', aggregateType: 'KccFacility', aggregateId: facility.facility_uuid,
    farmerId: facility.farmer_id,
    payload: { drawingPower, rawDp, cappedAtStLimit: stCap != null && rawDp > stCap, milkReceivables: milkRecv },
  });
  return snap;
};

const latest = async (facilityUuid) => {
  const { KccDrawingPowerSnap } = getDb();
  const facility = await findFacility(facilityUuid);
  return KccDrawingPowerSnap.findOne({
    where: { facility_id: facility.id }, order: [['snapshot_date', 'DESC'], ['id', 'DESC']],
  });
};

const history = async (facilityUuid, limit = 12) => {
  const { KccDrawingPowerSnap } = getDb();
  const facility = await findFacility(facilityUuid);
  return KccDrawingPowerSnap.findAll({
    where: { facility_id: facility.id }, order: [['snapshot_date', 'DESC'], ['id', 'DESC']], limit,
  });
};

module.exports = { buildSnapshot, latest, history, readMilkReceivables };
