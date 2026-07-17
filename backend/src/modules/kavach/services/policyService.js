/**
 * KAVACH policy reads — the protection snapshot ("3 of 5 covered"), policy
 * detail with premium trail, and the assets list with covered badges. No
 * arithmetic here; issuance/lifecycle live in proposalService.
 */
let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

const err = (msg, code, status = 404) => { const e = new Error(msg); e.statusCode = status; e.errorCode = code; return e; };

const listForFarmer = async (farmerId) => {
  const { InsurancePolicy } = getDb();
  return InsurancePolicy.findAll({ where: { farmer_id: farmerId }, order: [['created_at', 'DESC']] });
};

/** Protection snapshot: how many of the farmer's animals are covered. */
const protectionSnapshot = async (farmerId) => {
  const { InsurancePolicy, PolicyAsset, DairyAnimal } = getDb();
  const policies = await InsurancePolicy.findAll({ where: { farmer_id: farmerId } });
  const active = policies.filter((p) => p.status === 'active');
  const activeIds = active.map((p) => p.id);
  const coveredAssets = activeIds.length
    ? await PolicyAsset.findAll({ where: { policy_id: activeIds, is_active: true } })
    : [];
  const coveredAnimalIds = new Set(coveredAssets.map((a) => a.asset_ref_id).filter((x) => x != null));
  const herd = DairyAnimal ? await DairyAnimal.count({ where: { farmer_id: farmerId, is_active: true } }) : 0;

  return {
    animalsTotal: herd,
    animalsCovered: coveredAnimalIds.size,
    policiesActive: active.length,
    sumInsuredTotal: active.reduce((s, p) => s + Number(p.sum_insured), 0),
    label: `${coveredAnimalIds.size} of ${herd} covered`,
  };
};

/** The farmer's animals with a covered badge (for the enrol screen). */
const assetsWithCoverage = async (farmerId) => {
  const { DairyAnimal, InsurancePolicy, PolicyAsset } = getDb();
  if (!DairyAnimal) return [];
  const animals = await DairyAnimal.findAll({ where: { farmer_id: farmerId, is_active: true }, order: [['id', 'ASC']] });
  const active = await InsurancePolicy.findAll({ where: { farmer_id: farmerId, status: 'active' }, attributes: ['id', 'policy_uuid'] });
  const policyUuidById = new Map(active.map((p) => [p.id, p.policy_uuid]));
  const assets = active.length ? await PolicyAsset.findAll({ where: { policy_id: active.map((p) => p.id), is_active: true } }) : [];
  const coveredByAnimal = new Map(assets.filter((a) => a.asset_ref_id != null).map((a) => [a.asset_ref_id, a]));
  return animals.map((a) => {
    const cover = coveredByAnimal.get(a.id);
    return {
      animalId: a.id, animalUuid: a.animal_uuid, tagNumber: a.tag_number || a.animal_identification_number,
      species: a.species, covered: !!cover,
      coverTagUid: cover ? cover.tag_uid : null,
      coverPolicyUuid: cover ? policyUuidById.get(cover.policy_id) || null : null,
    };
  });
};

const getDetail = async (policyUuid) => {
  const { InsurancePolicy, PolicyAsset, PremiumLedger } = getDb();
  const policy = await InsurancePolicy.findOne({ where: { policy_uuid: policyUuid } });
  if (!policy) throw err('Policy not found', 'KAVACH_POLICY_NOT_FOUND');
  const [assets, premiumLedger] = await Promise.all([
    PolicyAsset.findAll({ where: { policy_id: policy.id } }),
    PremiumLedger.findAll({ where: { policy_id: policy.id }, order: [['occurred_at', 'ASC']] }),
  ]);
  return { policy, assets, premiumLedger };
};

/** Ownership helper for policy-scoped routes. */
const findOwned = async (policyUuid, farmerId) => {
  const { InsurancePolicy } = getDb();
  const policy = await InsurancePolicy.findOne({ where: { policy_uuid: policyUuid } });
  if (!policy) throw err('Policy not found', 'KAVACH_POLICY_NOT_FOUND');
  if (farmerId != null && policy.farmer_id !== farmerId) throw err('Not your policy', 'KAVACH_POLICY_FORBIDDEN', 403);
  return policy;
};

module.exports = { listForFarmer, protectionSnapshot, assetsWithCoverage, getDetail, findOwned };
