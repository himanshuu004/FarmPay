/**
 * CIA scheme config (Convention 5: scheme parameters are config, never code).
 *
 * Publishing is versioned and immutable: once a scheme_version is published its
 * rules_json/doc_checklist are frozen — a change requires a NEW version. That is
 * what lets an application pin `scheme_version` at submit and never shift when a
 * newer scheme is published (PRD 5.1 AC). New EOIs pin the LATEST published
 * version; in-flight applications keep the version they pinned.
 */
const { emitDomainEvent } = require('../../../shared/services/domainEvents');
const { erp } = require('../../../integrations');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };
const err = (msg, code, status = 400) => { const e = new Error(msg); e.statusCode = status; e.errorCode = code; return e; };

/** UCDF_ADMIN: publish (freeze) a scheme version. Re-publishing an already-published version is refused. */
const publishConfig = async ({ schemeVersion, rulesJson = {}, docChecklist = [], title = null }, actor = {}) => {
  const { CiaSchemeConfig, sequelize } = getDb();
  return sequelize.transaction(async (t) => {
    const existing = await CiaSchemeConfig.findOne({ where: { scheme_version: schemeVersion }, transaction: t });
    if (existing && existing.is_published) {
      throw err(`Scheme ${schemeVersion} is already published and immutable — bump the version`, 'CIA_SCHEME_LOCKED', 409);
    }
    const row = existing || CiaSchemeConfig.build({ scheme_version: schemeVersion });
    row.title = title;
    row.rules_json = rulesJson;
    row.doc_checklist = docChecklist;
    row.is_published = true;
    row.published_by_user_id = actor.appUserId || null;
    row.published_at = new Date();
    row.is_active = true;
    await row.save({ transaction: t });
    await emitDomainEvent({
      eventType: 'cia.scheme.published', aggregateType: 'CiaSchemeConfig', aggregateId: row.scheme_version,
      payload: { schemeVersion: row.scheme_version, by: actor.appUserId || null },
    }, { transaction: t });
    return row;
  });
};

/** The scheme a NEW applicant sees: the latest published version. */
const getPublishedScheme = async () => {
  const { CiaSchemeConfig } = getDb();
  const row = await CiaSchemeConfig.findOne({
    where: { is_published: true, is_active: true },
    order: [['published_at', 'DESC']],
  });
  if (!row) throw err('No published CIA scheme yet', 'CIA_SCHEME_NONE', 404);
  return {
    schemeVersion: row.scheme_version,
    title: row.title,
    rules: row.rules_json,
    documentChecklist: row.doc_checklist,
    publishedAt: row.published_at,
  };
};

/** Internal: fetch a specific pinned version (used at submit-time reads). */
const getByVersion = async (schemeVersion) => {
  const { CiaSchemeConfig } = getDb();
  const row = await CiaSchemeConfig.findOne({ where: { scheme_version: schemeVersion } });
  if (!row) throw err(`Unknown scheme version ${schemeVersion}`, 'CIA_SCHEME_UNKNOWN', 404);
  return row;
};

/** UCDF_ADMIN read: a version (if provided) or the full list. */
const getConfig = async ({ schemeVersion = null } = {}) => {
  const { CiaSchemeConfig } = getDb();
  if (schemeVersion) {
    const row = await getByVersion(schemeVersion);
    return { schemeVersion: row.scheme_version, title: row.title, rulesJson: row.rules_json, docChecklist: row.doc_checklist, isPublished: row.is_published };
  }
  const rows = await CiaSchemeConfig.findAll({ order: [['published_at', 'DESC NULLS LAST'], ['id', 'DESC']] });
  return rows.map((r) => ({ schemeVersion: r.scheme_version, title: r.title, isPublished: r.is_published, publishedAt: r.published_at }));
};

const monthsBetween = (a, b) => Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()));

/** Fetch the farmer's eligibility inputs once (membership + ERP milk), best-effort. */
const fetchFarmerProfile = async (farmerRef) => {
  const { CoopMembership } = getDb();
  const membership = await CoopMembership.findOne({ where: { farmer_ref: farmerRef } });
  let milk = null; let milkError = false;
  try { milk = await erp.getMilkSummary(farmerRef, 6); } catch (_e) { milkError = true; } // ERP degraded — advisory only
  return { membership, milk, milkError };
};

/**
 * Evaluate ONE scheme's rules against a farmer profile → { likelyEligible, checks[], reasons[] }.
 * Structured checks[] let the app render ticks instead of a sentence list. Advisory only,
 * never a sanction. Shared by the per-scheme check and the scheme list.
 */
const evaluateEligibility = (rules = {}, { membership, milk, milkError } = {}) => {
  const checks = []; const reasons = [];
  const minMonths = Number(rules.minMembershipMonths || 0);
  if (minMonths > 0) {
    const joined = membership && membership.joined_on ? new Date(membership.joined_on) : null;
    const months = joined ? monthsBetween(joined, new Date()) : null;
    const ok = months != null && months >= minMonths;
    if (months == null) reasons.push('Membership start date not on file — society to confirm');
    else if (!ok) reasons.push(`Membership is ${months} month(s); scheme needs ${minMonths}`);
    checks.push({ key: 'membership', label: 'Dairy-society member', ok, src: 'ERP',
      detail: months == null ? 'Start date not on file' : `${months} month(s)${ok ? '' : ` · needs ${minMonths}`}` });
  }
  const minMilk = Number(rules.minAvgMonthlyMilkValue || 0);
  if (minMilk > 0) {
    const avg = milk ? Number(milk.avgMonthlyValue) : null;
    const ok = avg != null && avg >= minMilk;
    if (milkError || avg == null) reasons.push('Milk-supply history unavailable right now — try again later');
    else if (!ok) reasons.push(`Avg monthly milk value ₹${avg} is below ₹${minMilk}`);
    checks.push({ key: 'milk', label: 'Milk supply', ok, src: 'ERP',
      detail: avg == null ? 'History unavailable' : `Avg ₹${avg}/mo${ok ? '' : ` · needs ₹${minMilk}`}` });
  }
  const likelyEligible = reasons.length === 0;
  return { likelyEligible, checks, reasons: likelyEligible ? ['Meets the basic scheme criteria — this is a guide, not an approval'] : reasons };
};

/**
 * Non-binding eligibility pre-screen (PRD 5.1). Advisory only — NEVER a sanction.
 * Runs against a specific scheme (schemeVersion) or, if omitted, the latest published
 * one; returns structured checks[] + plain-language reasons.
 */
const checkEligibility = async ({ farmerRef, dcsRef, schemeVersion = null }) => {
  if (!farmerRef) {
    return { isMember: false, likelyEligible: null, checks: [], reasons: ['Link your dairy-society membership to check eligibility'] };
  }
  let scheme;
  if (schemeVersion) {
    const row = await getByVersion(schemeVersion);
    if (!row.is_published || !row.is_active) throw err(`Scheme ${schemeVersion} is not available`, 'CIA_SCHEME_UNKNOWN', 404);
    scheme = { schemeVersion: row.scheme_version, rules: row.rules_json };
  } else {
    scheme = await getPublishedScheme();
  }
  const profile = await fetchFarmerProfile(farmerRef);
  const { likelyEligible, checks, reasons } = evaluateEligibility(scheme.rules || {}, profile);
  return { isMember: true, schemeVersion: scheme.schemeVersion, advisory: true, likelyEligible, checks, reasons };
};

/**
 * Every scheme open at the member's society — all published + active, each with its own
 * rules_json + doc checklist — annotated with a best-effort per-scheme likelyEligible for
 * the farmer (null for a non-member or when the ERP profile can't be resolved).
 */
const listSchemes = async ({ farmerRef = null } = {}) => {
  const { CiaSchemeConfig } = getDb();
  const rows = await CiaSchemeConfig.findAll({ where: { is_published: true, is_active: true }, order: [['published_at', 'DESC']] });
  const profile = farmerRef ? await fetchFarmerProfile(farmerRef) : null;
  return rows.map((r) => ({
    schemeVersion: r.scheme_version, title: r.title, rules: r.rules_json, documentChecklist: r.doc_checklist, publishedAt: r.published_at,
    likelyEligible: profile ? evaluateEligibility(r.rules_json || {}, profile).likelyEligible : null,
  }));
};

module.exports = { publishConfig, getPublishedScheme, getByVersion, getConfig, checkEligibility, listSchemes, evaluateEligibility };
