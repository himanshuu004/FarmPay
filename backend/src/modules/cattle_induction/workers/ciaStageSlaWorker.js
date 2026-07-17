/**
 * ciaStageSlaWorker — per-stage escalation timers for CIA applications.
 * Ticks the SLA clock for each status and, on breach, escalates one level up and
 * surfaces the breach on the UCDF dashboard exception panel (via a
 * `cia.stage.sla_breach` domain_event).
 *
 * The clock for a stage starts when the application ENTERED that status — read as
 * the occurred_at of the latest domain_event for the application. TAT per status
 * is config: scheme rules_json.slaTimers[status] (days) overrides DEFAULT_TAT.
 * The sweep is idempotent per (application, status): a breach already recorded
 * for the current status is not re-emitted. Registered as `ciaStageSlaJob`.
 *
 * Sibling workers to add: ciaPurchaseDeadlineJob, ciaEmiReconcileJob (CIA-2),
 * ciaBankFiledropJob, ciaPostPurchaseInspectionJob (CIA-4).
 */
const { emitDomainEvent } = require('../../../shared/services/domainEvents');
const { APP } = require('../constants/ciaStatus');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

// Default turnaround per stage, in days (config override via scheme rules_json.slaTimers).
const DEFAULT_TAT_DAYS = {
  [APP.PENDING_DCS_REVIEW]: 15,
  [APP.APPLICATION_PENDING]: 7,
  [APP.DOCUMENTS_INCOMPLETE]: 7,
  [APP.PENDING_SUPERVISOR_VERIFY]: 5,
  [APP.FORWARDED_TO_DUSS]: 7,
  [APP.UNDER_DUSS_SCRUTINY]: 7,
  [APP.SUBMITTED_TO_BANK]: 15,
  [APP.UNDER_BANK_APPRAISAL]: 15,
  [APP.BANK_QUERY_RAISED]: 7,
};
// One level up on breach → shows who it escalates to on the dashboard.
const ESCALATE_TO = {
  [APP.PENDING_DCS_REVIEW]: 'DUSS',
  [APP.PENDING_SUPERVISOR_VERIFY]: 'DUSS',
  [APP.UNDER_DUSS_SCRUTINY]: 'DISTRICT',
  [APP.SUBMITTED_TO_BANK]: 'BANK_REGIONAL',
  [APP.UNDER_BANK_APPRAISAL]: 'BANK_REGIONAL',
};
const DAY_MS = 24 * 60 * 60 * 1000;

/** Resolve the configured TAT (days) for a status from the latest published scheme. */
const tatFor = async (status) => {
  const { CiaSchemeConfig } = getDb();
  const scheme = await CiaSchemeConfig.findOne({ where: { is_published: true }, order: [['published_at', 'DESC']] });
  const timers = (scheme && scheme.rules_json && scheme.rules_json.slaTimers) || {};
  return timers[status] != null ? Number(timers[status]) : DEFAULT_TAT_DAYS[status];
};

const run = async ({ now = new Date() } = {}) => {
  const { CiaApplication, DomainEvent } = getDb();
  const monitored = Object.keys(DEFAULT_TAT_DAYS);
  const apps = await CiaApplication.findAll({ where: { status: monitored } });

  const breaches = [];
  for (const app of apps) {
    const tatDays = await tatFor(app.status);
    if (tatDays == null) continue;

    // When did it enter this status? = latest event for this application.
    const last = await DomainEvent.findOne({
      where: { aggregate_type: 'CiaApplication', aggregate_id: app.application_uuid },
      order: [['occurred_at', 'DESC'], ['id', 'DESC']],
    });
    const enteredAt = last ? new Date(last.occurred_at) : (app.updatedAt ? new Date(app.updatedAt) : null);
    if (!enteredAt) continue;
    if (now.getTime() - enteredAt.getTime() <= tatDays * DAY_MS) continue;

    // Idempotent: already flagged for the CURRENT status?
    const already = await DomainEvent.findOne({
      where: { aggregate_type: 'CiaApplication', aggregate_id: app.application_uuid, event_type: 'cia.stage.sla_breach' },
      order: [['occurred_at', 'DESC'], ['id', 'DESC']],
    });
    if (already && already.payload && already.payload.status === app.status) continue;

    await emitDomainEvent({
      eventType: 'cia.stage.sla_breach', aggregateType: 'CiaApplication', aggregateId: app.application_uuid,
      farmerId: null,
      payload: { status: app.status, tatDays, escalatedTo: ESCALATE_TO[app.status] || 'UCDF', enteredAt },
    });
    breaches.push({ applicationUuid: app.application_uuid, status: app.status, escalatedTo: ESCALATE_TO[app.status] || 'UCDF' });
  }
  return { checked: apps.length, breaches };
};

module.exports = { name: 'ciaStageSlaJob', run, DEFAULT_TAT_DAYS };
