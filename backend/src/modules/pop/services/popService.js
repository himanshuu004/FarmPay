/**
 * popService — Package of Practices business logic.
 *
 * Subtype awareness: each call takes an optional subtypeCode so that, within
 * an activity, every selected subtype (rice, wheat, sugarcane, broiler, …)
 * has its own independent progress + compliance score. Templates support
 * two tiers:
 *
 *   1. Dedicated template — rows in activity_pop_(stages|touchpoints) with
 *      subtype_code='rice'. Used as-is when the caller asks for rice.
 *   2. Baseline template  — rows with subtype_code=''. Used as a fallback
 *      when no dedicated template exists for the requested subtype.
 *
 * Per-farmer progress rows ALWAYS carry the subtype code (never the
 * baseline '' — unless the activity itself has no subtypes, like DAIRY).
 * This guarantees that rice progress and sugarcane progress cannot collide
 * even when they share a baseline template.
 *
 * Responsibilities:
 *   • getTemplate(activityCode, subtypeCode='')   → stages[] + touchpoints[]
 *   • getProgress(farmerId, code, subtypeCode='') → template + per-farmer
 *                                                   state, compliance, counts
 *   • enterTouchpoint({...})                      → upsert progress + advance
 */

const {
  ActivityPopStage,
  ActivityPopTouchpoint,
  FarmerPopTouchpointProgress,
} = require('../../../shared/models');

const VALID_STATUSES = ['PENDING', 'CURRENT', 'DONE', 'SKIPPED'];

/**
 * Load the template for one (activity, subtype). If a dedicated template
 * exists for the subtype, return it. Otherwise fall back to the baseline
 * (subtype_code='') so we don't have to seed every crop on day one.
 *
 * `subtypeCode=''` always loads the baseline directly without the fallback
 * dance, which is the right behaviour for activities without subtypes
 * (DAIRY, FISHERY).
 */
async function getTemplate(activityCode, subtypeCode = '') {
  const loadFor = async (code) => {
    const [stages, touchpoints] = await Promise.all([
      ActivityPopStage.findAll({
        where: { activityCode, subtypeCode: code, isActive: true },
        order: [['stageOrder', 'ASC']],
      }),
      ActivityPopTouchpoint.findAll({
        where: { activityCode, subtypeCode: code, isActive: true },
        order: [['touchpointNumber', 'ASC']],
      }),
    ]);
    return { stages, touchpoints };
  };

  if (subtypeCode) {
    const specific = await loadFor(subtypeCode);
    if (specific.touchpoints.length > 0 || specific.stages.length > 0) {
      return { activityCode, subtypeCode, templateSource: 'SUBTYPE', ...specific };
    }
    // Fall through to baseline.
  }
  const baseline = await loadFor('');
  return {
    activityCode,
    subtypeCode,
    templateSource: subtypeCode ? 'BASELINE_FALLBACK' : 'BASELINE',
    ...baseline,
  };
}

/**
 * Load per-farmer progress for one (activity, subtype). Progress rows are
 * scoped to the exact subtype the caller requested — rice progress will
 * never be mixed with sugarcane progress, even when both use the baseline
 * template.
 */
async function getProgress(farmerId, activityCode, subtypeCode = '') {
  const template = await getTemplate(activityCode, subtypeCode);

  const progressRows = await FarmerPopTouchpointProgress.findAll({
    where: { farmerId, activityCode, subtypeCode },
    order: [['touchpointNumber', 'ASC']],
  });

  const progressByNumber = new Map(
    progressRows.map((r) => [r.touchpointNumber, r])
  );

  const merged = template.touchpoints.map((tp) => {
    const state = progressByNumber.get(tp.touchpointNumber);
    return {
      touchpointNumber: tp.touchpointNumber,
      stageKey: tp.stageKey,
      cadence: tp.cadence,
      nameEn: tp.nameEn,
      nameHi: tp.nameHi,
      descriptionEn: tp.descriptionEn,
      descriptionHi: tp.descriptionHi,
      scoringCriteria: tp.scoringCriteria,
      requiredInputs: tp.requiredInputs,
      expectedCostInr: tp.expectedCostInr,
      status: state?.status || 'PENDING',
      score: state?.score ?? null,
      taskCompleted: state?.taskCompleted ?? null,
      timingStatus: state?.timingStatus ?? null,
      inputsStatus: state?.inputsStatus ?? null,
      actualCostInr: state?.actualCostInr ?? null,
      notes: state?.notes ?? null,
      completedAt: state?.completedAt ?? null,
    };
  });

  const doneScores = merged
    .filter((t) => t.status === 'DONE' && typeof t.score === 'number')
    .map((t) => t.score);
  const complianceScore = doneScores.length
    ? Math.round(doneScores.reduce((a, b) => a + b, 0) / doneScores.length)
    : null;

  const counts = {
    done: merged.filter((t) => t.status === 'DONE').length,
    current: merged.filter((t) => t.status === 'CURRENT').length,
    pending: merged.filter((t) => t.status === 'PENDING').length,
    skipped: merged.filter((t) => t.status === 'SKIPPED').length,
    total: merged.length,
  };

  const currentTouchpoint =
    merged.find((t) => t.status === 'CURRENT') ||
    merged.find((t) => t.status === 'PENDING') ||
    null;

  const currentStageKey = currentTouchpoint?.stageKey || null;

  return {
    activityCode,
    subtypeCode,
    templateSource: template.templateSource,
    stages: template.stages,
    touchpoints: merged,
    complianceScore,
    currentTouchpoint,
    currentStageKey,
    counts,
  };
}

/**
 * Upsert a per-farmer touchpoint row. Progress is keyed by subtype, so
 * logging "weeding done at touchpoint 3 for rice" won't affect sugarcane.
 *
 * Template lookup follows the same baseline-fallback rule as getTemplate,
 * so the validation check "does this touchpoint exist?" succeeds even when
 * the subtype relies on the baseline template.
 */
async function enterTouchpoint({
  farmerId,
  activityCode,
  subtypeCode = '',
  touchpointNumber,
  status = 'DONE',
  score = null,
  taskCompleted = null,
  timingStatus = null,
  inputsStatus = null,
  actualCostInr = null,
  notes = null,
  dataEntered = null,
}) {
  if (!VALID_STATUSES.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }

  // Validate against dedicated template first, then baseline.
  let tpl = null;
  if (subtypeCode) {
    tpl = await ActivityPopTouchpoint.findOne({
      where: { activityCode, subtypeCode, touchpointNumber, isActive: true },
    });
  }
  if (!tpl) {
    tpl = await ActivityPopTouchpoint.findOne({
      where: { activityCode, subtypeCode: '', touchpointNumber, isActive: true },
    });
  }
  if (!tpl) {
    throw new Error(
      `Touchpoint ${touchpointNumber} not found for activity ${activityCode}` +
        (subtypeCode ? ` / subtype ${subtypeCode}` : '')
    );
  }

  const completedAt = status === 'DONE' ? new Date() : null;

  const [row, created] = await FarmerPopTouchpointProgress.findOrCreate({
    where: { farmerId, activityCode, subtypeCode, touchpointNumber },
    defaults: {
      farmerId,
      activityCode,
      subtypeCode,
      touchpointNumber,
      status,
      score,
      taskCompleted,
      timingStatus,
      inputsStatus,
      actualCostInr,
      notes,
      dataEntered,
      completedAt,
    },
  });

  if (!created) {
    await row.update({
      status,
      score,
      taskCompleted,
      timingStatus,
      inputsStatus,
      actualCostInr,
      notes,
      dataEntered,
      completedAt,
    });
  }

  // Advance the next PENDING touchpoint (same activity + subtype) to CURRENT.
  if (status === 'DONE') {
    const nextTplWhere = {
      activityCode,
      isActive: true,
      touchpointNumber: { [require('sequelize').Op.gt]: touchpointNumber },
    };
    // Prefer the dedicated template's next row, fall back to baseline.
    let nextTpl = null;
    if (subtypeCode) {
      nextTpl = await ActivityPopTouchpoint.findOne({
        where: { ...nextTplWhere, subtypeCode },
        order: [['touchpointNumber', 'ASC']],
      });
    }
    if (!nextTpl) {
      nextTpl = await ActivityPopTouchpoint.findOne({
        where: { ...nextTplWhere, subtypeCode: '' },
        order: [['touchpointNumber', 'ASC']],
      });
    }
    if (nextTpl) {
      const [nextRow] = await FarmerPopTouchpointProgress.findOrCreate({
        where: {
          farmerId,
          activityCode,
          subtypeCode,
          touchpointNumber: nextTpl.touchpointNumber,
        },
        defaults: {
          farmerId,
          activityCode,
          subtypeCode,
          touchpointNumber: nextTpl.touchpointNumber,
          status: 'CURRENT',
        },
      });
      if (nextRow.status === 'PENDING') {
        await nextRow.update({ status: 'CURRENT' });
      }
    }
  }

  return row;
}

module.exports = {
  getTemplate,
  getProgress,
  enterTouchpoint,
};
