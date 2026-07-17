/**
 * advisoryService — read + farmer disposal of advisories. The farmer disposes
 * (mark done / dismiss); advisories never auto-act. Ownership-guarded (IDOR).
 */
let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

const err = (message, errorCode, statusCode = 400) => {
  const e = new Error(message); e.statusCode = statusCode; e.errorCode = errorCode; return e;
};

const SEVERITY_RANK = { URGENT: 0, ADVISE: 1, INFO: 2 };

const listForFarmer = async (farmerId, { status = 'OPEN', category } = {}) => {
  const { AdvisoryItem } = getDb();
  const where = { farmer_id: farmerId, is_active: true };
  if (status && status !== 'ALL') where.status = status;
  if (category) where.category = category;
  const items = await AdvisoryItem.findAll({ where });
  return items
    .map((i) => ({
      itemUuid: i.item_uuid, animalRef: i.animal_ref === 'HERD' ? null : i.animal_ref, animalLabel: i.animal_label,
      packCode: i.pack_code, category: i.category, severity: i.severity,
      title: i.title, body: i.body, dueOn: i.due_on, status: i.status, evidence: i.evidence_json,
    }))
    .sort((a, b) => (SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]) || String(a.dueOn).localeCompare(String(b.dueOn)));
};

const loadOwned = async (itemUuid, farmerId) => {
  const { AdvisoryItem } = getDb();
  const item = await AdvisoryItem.findOne({ where: { item_uuid: itemUuid } });
  if (!item) throw err('Advisory not found', 'ADVISORY_NOT_FOUND', 404);
  if (item.farmer_id !== farmerId) throw err('Not your advisory', 'ADVISORY_FORBIDDEN', 403);
  return item;
};

const setStatus = async (itemUuid, farmerId, status) => {
  const item = await loadOwned(itemUuid, farmerId);
  await item.update({ status, resolved_at: new Date() });
  return { itemUuid: item.item_uuid, status: item.status };
};

const markDone = (itemUuid, farmerId) => setStatus(itemUuid, farmerId, 'DONE');
const dismiss = (itemUuid, farmerId) => setStatus(itemUuid, farmerId, 'DISMISSED');

module.exports = { listForFarmer, markDone, dismiss };
