import 'package:flutter/widgets.dart' show Color;

import '../../../design_system/tokens.dart';
import '../../../design_system/widgets/step_timeline.dart';
import '../../../l10n/generated/app_localizations.dart';

String humanStatus(String status) => status.replaceAll('_', ' ');

/// Policy state machine (InsurancePolicy.STATES) — `expired`/`cancelled`
/// have no backend trigger today (no service path sets them) but are
/// styled defensively since they're valid enum values.
StatusTone policyStatusTone(String status) {
  switch (status) {
    case 'active':
      return StatusTone.brand;
    case 'lapsed':
      return StatusTone.warn;
    case 'claimed':
      return StatusTone.blue;
    case 'expired':
    case 'cancelled':
      return StatusTone.neutral;
    default:
      return StatusTone.neutral;
  }
}

/// LT drawdown-style ordered claim flow (ClaimCase.STATES minus REJECTED,
/// which is rendered as its own banner — mirrors kcc_status.dart's
/// treatment of REJECTED facility applications). `escalated` (SLA breach)
/// is a boolean decoration layered on top of DOCS_SUBMITTED/UNDER_REVIEW,
/// never a 7th status (see claimService.js's own doc-comment).
const kClaimFlow = [
  'INTIMATED',
  'SURVEY_DONE',
  'PM_DONE',
  'DOCS_SUBMITTED',
  'UNDER_REVIEW',
  'SETTLED',
];

int claimStatusIndex(String status) => kClaimFlow.indexOf(status);

StatusTone claimStatusTone(String status) {
  switch (status) {
    case 'SETTLED':
      return StatusTone.brand;
    case 'REJECTED':
      return StatusTone.danger;
    case 'INTIMATED':
      return StatusTone.neutral;
    default:
      return StatusTone.blue;
  }
}

enum _Actor { you, field, ops, system }

({String label, Color color, Color bg}) _actorStyle(
  AppLocalizations l10n,
  _Actor actor,
) {
  switch (actor) {
    case _Actor.you:
      return (label: l10n.pashuActorYou, color: AppColors.brandDark, bg: AppColors.accent);
    case _Actor.field:
      return (label: l10n.pashuActorField, color: AppColors.blue, bg: AppColors.blueBg);
    case _Actor.ops:
      return (label: l10n.pashuActorOps, color: AppColors.gold, bg: AppColors.goldBg);
    case _Actor.system:
      return (label: l10n.pashuActorSystem, color: AppColors.muted, bg: AppColors.line);
  }
}

class _StepDef {
  const _StepDef(this.actor, this.title);
  final _Actor actor;
  final String title;
}

/// Builds the 6-step enrolment ladder (DRAFT→TAGGED farmer-authored on this
/// screen; EXAMINED→VALUED→PAID→POLICY_ISSUED happen off-screen by VET/OPS
/// — mirrors pashu-enrol.tsx's STEP_KEYS, with actor sub-labels the
/// prototype specifies and RN omits).
List<TimelineStep> buildEnrolmentTimeline(AppLocalizations l10n, int doneStep) {
  final defs = [
    _StepDef(_Actor.you, l10n.pashuEnrolStepDraft),
    _StepDef(_Actor.you, l10n.pashuEnrolStepTag),
    _StepDef(_Actor.field, l10n.pashuEnrolStepVet),
    _StepDef(_Actor.field, l10n.pashuEnrolStepValued),
    _StepDef(_Actor.ops, l10n.pashuEnrolStepPremium),
    _StepDef(_Actor.system, l10n.pashuEnrolStepIssued),
  ];
  return List.generate(defs.length, (i) {
    final d = defs[i];
    final style = _actorStyle(l10n, d.actor);
    return TimelineStep(
      title: d.title,
      actorLabel: style.label,
      actorColor: style.color,
      actorBg: style.bg,
      done: i < doneStep,
      current: i == doneStep,
    );
  });
}

/// Builds the 6-step claim ladder (ClaimCase status), each with an actor
/// sub-label (mirrors the enrolment timeline's pattern).
List<TimelineStep> buildClaimTimeline(AppLocalizations l10n, String status) {
  final defs = [
    _StepDef(_Actor.you, l10n.pashuClaimStepIntimated),
    _StepDef(_Actor.field, l10n.pashuClaimStepSurvey),
    _StepDef(_Actor.field, l10n.pashuClaimStepPm),
    _StepDef(_Actor.you, l10n.pashuClaimStepDocs),
    _StepDef(_Actor.ops, l10n.pashuClaimStepReview),
    _StepDef(_Actor.system, l10n.pashuClaimStepSettled),
  ];
  final idx = claimStatusIndex(status);
  return List.generate(defs.length, (i) {
    final d = defs[i];
    final style = _actorStyle(l10n, d.actor);
    return TimelineStep(
      title: d.title,
      actorLabel: style.label,
      actorColor: style.color,
      actorBg: style.bg,
      done: idx >= 0 && i <= idx,
      current: idx >= 0 && i == idx,
    );
  });
}
