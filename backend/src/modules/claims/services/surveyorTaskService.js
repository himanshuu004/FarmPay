/**
 * Surveyor field-task lifecycle (§5.2). The field PWA's queue. Submitting a
 * survey/PM task drives the claim's own transition (file once, both move):
 *
 *   assigned → enroute → onsite → submitted → qc_passed
 *
 * VERIFY_LOSS submit → claim SURVEY_DONE, then a POSTMORTEM task is opened for a
 * VET. POSTMORTEM submit → claim PM_DONE + a ₹125 honorarium accrual.
 */
const crypto = require('crypto');
const claimService = require('./claimService');
const vetHonorarium = require('./vetHonorariumService');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

const err = (msg, code, status = 400) => { const e = new Error(msg); e.statusCode = status; e.errorCode = code; return e; };

// Honorarium rates are config (#5) — passed in, defaulted to the NLM figures.
const HONORARIUM = { POSTMORTEM: 125, ENROL_EXAM: 50 };
const SELF_TRANSITIONS = { assigned: ['enroute'], enroute: ['onsite'], onsite: [] };

const endOfToday = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d; };

const find = async (taskUuid) => {
  const { SurveyorTask } = getDb();
  const t = await SurveyorTask.findOne({ where: { task_uuid: taskUuid } });
  if (!t) throw err('Task not found', 'FIELD_TASK_NOT_FOUND', 404);
  return t;
};

/** Open a field task (same-day-visit SLA). */
const openTask = async ({ claimId, taskType, assigneeRole, assigneeId = null, slaDueAt = null }) => {
  const { SurveyorTask } = getDb();
  return SurveyorTask.create({
    task_uuid: crypto.randomUUID(), claim_id: claimId, task_type: taskType,
    assignee_role: assigneeRole, assignee_id: assigneeId, sla_due_at: slaDueAt || endOfToday(), status: 'assigned',
  });
};

/** The first task on a fresh claim — surveyor verifies the loss. */
const openInitialTask = (claimId) => openTask({ claimId, taskType: 'VERIFY_LOSS', assigneeRole: 'SURVEYOR' });

const claim_ = async (claimId) => { const { ClaimCase } = getDb(); return ClaimCase.findByPk(claimId); };

/** Self-service progress: assigned→enroute→onsite (the assignee moves themselves). */
const advance = async (taskUuid, toStatus, { assigneeId = null } = {}) => {
  const task = await find(taskUuid);
  if (!(SELF_TRANSITIONS[task.status] || []).includes(toStatus)) throw err(`Illegal task transition ${task.status} → ${toStatus}`, 'FIELD_TASK_ILLEGAL');
  await task.update({ status: toStatus, assignee_id: task.assignee_id || assigneeId });
  return task;
};

/** Submit the field report → drives the claim transition + opens the next task. */
const submit = async (taskUuid, { assigneeId = null, assigneeRole = null, report = {} } = {}) => {
  const task = await find(taskUuid);
  // The caller's role must match the task's role — a POSTMORTEM must be filed by a
  // VCI-registered VET, a loss survey by a SURVEYOR (statutory; never cross-filed).
  if (assigneeRole && assigneeRole !== task.assignee_role) {
    throw err(`A ${task.assignee_role} must file a ${task.task_type} task`, 'FIELD_TASK_ROLE_MISMATCH', 403);
  }
  if (!['assigned', 'enroute', 'onsite'].includes(task.status)) throw err(`Cannot submit from ${task.status}`, 'FIELD_TASK_BAD_STATE');
  const claim = await claim_(task.claim_id);
  if (!claim) throw err('Claim not found', 'CLAIMS_NOT_FOUND', 404);

  await task.update({ status: 'submitted', assignee_id: task.assignee_id || assigneeId, report, submitted_at: new Date() });

  if (task.task_type === 'VERIFY_LOSS') {
    await claimService.recordSurvey(claim.claim_uuid, { surveyorId: assigneeId, report });
    await openTask({ claimId: claim.id, taskType: 'POSTMORTEM', assigneeRole: 'VET' }); // next: the vet
  } else if (task.task_type === 'POSTMORTEM') {
    await claimService.recordPostmortem(claim.claim_uuid, { vetId: assigneeId, report });
    if (assigneeId) await vetHonorarium.accrue({ vetId: assigneeId, kind: 'POSTMORTEM', amount: HONORARIUM.POSTMORTEM, claimId: claim.id });
  }
  return task;
};

const qcPass = async (taskUuid) => {
  const task = await find(taskUuid);
  if (task.status !== 'submitted') throw err(`Cannot QC from ${task.status}`, 'FIELD_TASK_BAD_STATE');
  await task.update({ status: 'qc_passed' });
  return task;
};

const listForRole = async (role, { assigneeId = null, open = true } = {}) => {
  const { SurveyorTask } = getDb();
  const where = { assignee_role: role };
  if (assigneeId != null) where.assignee_id = assigneeId;
  if (open) where.status = ['assigned', 'enroute', 'onsite'];
  return SurveyorTask.findAll({ where, order: [['sla_due_at', 'ASC']] });
};

module.exports = { openTask, openInitialTask, advance, submit, qcPass, listForRole, find, HONORARIUM };
