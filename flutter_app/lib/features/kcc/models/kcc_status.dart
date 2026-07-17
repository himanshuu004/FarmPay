import 'package:flutter/widgets.dart' show Color;

import '../../../design_system/tokens.dart';
import '../../../design_system/widgets/step_timeline.dart';
import '../../../l10n/generated/app_localizations.dart';

/// The KCC facility application state machine — full 11-state backend
/// enum (see backend/src/modules/kcc/models/KccFacility.js `STATES` +
/// kccOriginationService.js `TRANSITIONS`). REJECTED is NOT part of this
/// linear order — it can be reached from several stages and is rendered as
/// its own banner rather than a timeline position (the RN reference
/// (kcc-limit.tsx) never handles REJECTED/RENEWAL_DUE/RENEWED at all; this
/// is the fix for that gap, not a divergence from settled spec).
const kFacilityOrder = [
  'DRAFT',
  'SUBMITTED',
  'SOCIETY_CERTIFIED',
  'UNDER_REVIEW',
  'FORWARDED_TO_BANK',
  'SANCTIONED',
  'DISBURSED',
  'ACTIVE',
  'RENEWAL_DUE',
  'RENEWED',
  'CLOSED',
];

int facilityStatusIndex(String? status) {
  if (status == null) return -1;
  return kFacilityOrder.indexOf(status);
}

String humanStatus(String status) => status.replaceAll('_', ' ');

StatusTone facilityStatusTone(String status) {
  switch (status) {
    case 'DRAFT':
      return StatusTone.neutral;
    case 'SUBMITTED':
    case 'SOCIETY_CERTIFIED':
    case 'UNDER_REVIEW':
    case 'FORWARDED_TO_BANK':
      return StatusTone.blue;
    case 'SANCTIONED':
    case 'DISBURSED':
    case 'ACTIVE':
    case 'RENEWED':
      return StatusTone.brand;
    case 'RENEWAL_DUE':
      return StatusTone.warn;
    case 'REJECTED':
      return StatusTone.danger;
    case 'CLOSED':
      return StatusTone.neutral;
    default:
      return StatusTone.neutral;
  }
}

/// LT drawdown request state machine (kcc_drawdown_requests).
StatusTone drawdownStatusTone(String status) {
  switch (status) {
    case 'DRAFT':
      return StatusTone.neutral;
    case 'SUBMITTED':
      return StatusTone.blue;
    case 'BANK_APPROVED':
      return StatusTone.gold;
    case 'DISBURSED':
      return StatusTone.brand;
    case 'REJECTED':
      return StatusTone.danger;
    default:
      return StatusTone.neutral;
  }
}

enum _Actor { you, society, bank, ongoing }

class _StepDef {
  const _StepDef(this.actor, this.title, this.at);
  final _Actor actor;
  final String title;
  final String at;
}

({String label, Color color, Color bg}) _actorStyle(
  AppLocalizations l10n,
  _Actor actor,
) {
  switch (actor) {
    case _Actor.you:
      return (label: l10n.kccActorYou, color: AppColors.brandDark, bg: AppColors.accent);
    case _Actor.society:
      return (label: l10n.kccActorSociety, color: AppColors.blue, bg: AppColors.blueBg);
    case _Actor.bank:
      return (label: l10n.kccActorBank, color: AppColors.gold, bg: AppColors.goldBg);
    case _Actor.ongoing:
      return (label: l10n.kccActorOngoing, color: AppColors.muted, bg: AppColors.line);
  }
}

/// Builds the actor-grouped workflow timeline shown on the limit dashboard
/// — mirrors kcc-limit.tsx's `STEPS`/`Timeline`, extended with the
/// RENEWAL_DUE/RENEWED steps the RN version omits (§0 of the Phase-4
/// research: RN's `ORDER` array silently drops these two states).
List<TimelineStep> buildFacilityTimeline(AppLocalizations l10n, String? status) {
  final defs = [
    _StepDef(_Actor.you, l10n.kccStepCalculate, 'DRAFT'),
    _StepDef(_Actor.you, l10n.kccStepBecomeMember, 'DRAFT'),
    _StepDef(_Actor.you, l10n.kccStepFillSubmit, 'SUBMITTED'),
    _StepDef(_Actor.society, l10n.kccStepSecretaryHelps, 'SUBMITTED'),
    _StepDef(_Actor.society, l10n.kccStepUnionCertifies, 'SOCIETY_CERTIFIED'),
    _StepDef(_Actor.bank, l10n.kccStepKycVerified, 'UNDER_REVIEW'),
    _StepDef(_Actor.bank, l10n.kccStepLimitFixed, 'UNDER_REVIEW'),
    _StepDef(_Actor.bank, l10n.kccStepFormsToBank, 'FORWARDED_TO_BANK'),
    _StepDef(_Actor.bank, l10n.kccStepSanctionDisburse, 'DISBURSED'),
    _StepDef(_Actor.ongoing, l10n.kccStepOngoingRepay, 'ACTIVE'),
    _StepDef(_Actor.ongoing, l10n.kccStepRenewalDue, 'RENEWAL_DUE'),
    _StepDef(_Actor.you, l10n.kccStepRenewed, 'RENEWED'),
  ];

  final cur = facilityStatusIndex(status);
  bool doneAt(String at) {
    if (cur < 0) return false;
    if (status == 'DRAFT') return at == 'DRAFT';
    return cur >= facilityStatusIndex(at);
  }

  final doneFlags = defs.map((d) => doneAt(d.at)).toList();
  final firstPending = doneFlags.indexWhere((d) => !d);

  return List.generate(defs.length, (i) {
    final d = defs[i];
    final style = _actorStyle(l10n, d.actor);
    return TimelineStep(
      title: d.title,
      actorLabel: style.label,
      actorColor: style.color,
      actorBg: style.bg,
      done: doneFlags[i],
      current: cur >= 0 && i == firstPending,
    );
  });
}
