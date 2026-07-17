import 'package:flutter/widgets.dart' show Color;

import '../../../design_system/tokens.dart';
import '../../../design_system/widgets/step_timeline.dart';
import '../../../l10n/generated/app_localizations.dart';

/// CIA application state machine (CLAUDE.md) collapsed to the 12-step
/// farmer-legible ladder cia-status.tsx renders — each backend status maps
/// to exactly one visible step; money/purchase steps light up once
/// sanctioned. Mirrors STEPS in app/app/cia-status.tsx verbatim.
class CiaStepDef {
  const CiaStepDef(this.key, this.statuses, this.who);
  final String key;
  final List<String> statuses;
  final String who; // you | dcs | board | supervisor | duss | bank
}

const List<CiaStepDef> kCiaStatusSteps = [
  CiaStepDef('interest', ['INTEREST_SUBMITTED'], 'you'),
  CiaStepDef('dcs_review', ['PENDING_DCS_REVIEW'], 'dcs'),
  CiaStepDef('selected', ['SELECTED_BY_DCS'], 'board'),
  CiaStepDef('application', ['APPLICATION_PENDING', 'DOCUMENTS_INCOMPLETE', 'RETURNED_FOR_CORRECTION'], 'you'),
  CiaStepDef('verify', ['PENDING_SUPERVISOR_VERIFY'], 'supervisor'),
  CiaStepDef('duss', ['FORWARDED_TO_DUSS', 'UNDER_DUSS_SCRUTINY'], 'duss'),
  CiaStepDef('bank', ['SUBMITTED_TO_BANK', 'UNDER_BANK_APPRAISAL', 'BANK_QUERY_RAISED'], 'bank'),
  CiaStepDef('sanctioned', ['LOAN_SANCTIONED'], 'bank'),
  CiaStepDef('disbursed', ['SUBSIDY_TRANSFERRED', 'LOAN_DISBURSED'], 'bank'),
  CiaStepDef('purchase', ['CATTLE_PURCHASE_PENDING', 'PURCHASE_INITIATED', 'SELLER_PAID'], 'you'),
  CiaStepDef('emi', ['EMI_ACTIVE', 'EMI_OVERDUE', 'LOAN_RESTRUCTURED'], 'you'),
  CiaStepDef('closed', ['LOAN_CLOSED', 'APPLICATION_CLOSED'], 'bank'),
];

int ciaStepIndexOf(String status) => kCiaStatusSteps.indexWhere((s) => s.statuses.contains(status));

/// Terminal-negative statuses attach to a step but render as "declined".
const Map<String, ({int at, String key})> kCiaDeclined = {
  'NOT_SELECTED': (at: 2, key: 'not_selected'),
  'LOAN_REJECTED': (at: 7, key: 'rejected'),
};

const kCiaFillableStatuses = ['APPLICATION_PENDING', 'DOCUMENTS_INCOMPLETE', 'RETURNED_FOR_CORRECTION'];
const kCiaInRepaymentStatuses = ['SELLER_PAID', 'EMI_ACTIVE', 'EMI_OVERDUE', 'LOAN_RESTRUCTURED', 'LOAN_CLOSED'];

String ciaStepLabel(AppLocalizations l10n, String key) {
  switch (key) {
    case 'interest':
      return l10n.ciaStepInterest;
    case 'dcs_review':
      return l10n.ciaStepDcsReview;
    case 'selected':
      return l10n.ciaStepSelected;
    case 'application':
      return l10n.ciaStepApplication;
    case 'verify':
      return l10n.ciaStepVerify;
    case 'duss':
      return l10n.ciaStepDuss;
    case 'bank':
      return l10n.ciaStepBank;
    case 'sanctioned':
      return l10n.ciaStepSanctioned;
    case 'disbursed':
      return l10n.ciaStepDisbursed;
    case 'purchase':
      return l10n.ciaStepPurchase;
    case 'emi':
      return l10n.ciaStepEmi;
    case 'closed':
      return l10n.ciaStepClosed;
    default:
      return key;
  }
}

({String label, Color color, Color bg}) ciaWhoStyle(AppLocalizations l10n, String who) {
  switch (who) {
    case 'you':
      return (label: l10n.ciaWhoYou, color: AppColors.brandDark, bg: AppColors.accent);
    case 'dcs':
      return (label: l10n.ciaWhoDcs, color: AppColors.gold, bg: AppColors.goldBg);
    case 'board':
      return (label: l10n.ciaWhoBoard, color: AppColors.gold, bg: AppColors.goldBg);
    case 'supervisor':
      return (label: l10n.ciaWhoSupervisor, color: AppColors.blue, bg: AppColors.blueBg);
    case 'duss':
      return (label: l10n.ciaWhoDuss, color: AppColors.muted, bg: AppColors.line);
    case 'bank':
      return (label: l10n.ciaWhoBank, color: AppColors.muted, bg: AppColors.line);
    default:
      return (label: who, color: AppColors.muted, bg: AppColors.line);
  }
}

/// Builds the 12-step application timeline for [StepTimeline]. Declined
/// statuses (NOT_SELECTED/LOAN_REJECTED) are surfaced as a separate banner
/// by the screen (the "bad" red state) — StepTimeline only distinguishes
/// done/current/future, so a declined step still renders as "current" here.
List<TimelineStep> buildCiaStatusTimeline(AppLocalizations l10n, String status) {
  final declined = kCiaDeclined[status];
  final curIdx = declined != null ? declined.at : ciaStepIndexOf(status);
  return List.generate(kCiaStatusSteps.length, (i) {
    final s = kCiaStatusSteps[i];
    final style = ciaWhoStyle(l10n, s.who);
    return TimelineStep(
      title: ciaStepLabel(l10n, s.key),
      actorLabel: style.label,
      actorColor: style.color,
      actorBg: style.bg,
      done: i < curIdx,
      current: i == curIdx,
    );
  });
}

/// Application-document checklist icons (icon by key; scheme-config driven,
/// never a hardcoded list — falls back to a generic doc glyph).
String ciaDocIcon(String key) {
  switch (key) {
    case 'aadhaar':
      return '🪪';
    case 'bank_passbook':
      return '🏦';
    case 'photo':
      return '🧑';
    case 'caste_cert':
      return '📜';
    case 'land_shed':
      return '🏠';
    default:
      return '📄';
  }
}

/// EMI ledger/schedule status chip tone — mirrors CHIP in cia-emi.tsx.
StatusTone ciaEmiStatusTone(String status) {
  switch (status) {
    case 'PAID':
      return StatusTone.brand;
    case 'PARTIAL':
      return StatusTone.warn;
    case 'OVERDUE':
    case 'DEFAULT':
      return StatusTone.danger;
    case 'DUE':
    case 'SCHEDULED':
    default:
      return StatusTone.blue;
  }
}

/// Cattle-claim 6-stage ladder — reuses the platform CLAIMS engine states,
/// mirrors STAGE_KEYS/STAGE_OF in cia-claim.tsx (REJECTED/ESCALATED both
/// render at the "under review" index).
const kCiaClaimStages = ['s_intimated', 's_survey', 's_pm', 's_docs', 's_review', 's_settled'];

int ciaClaimStageOf(String status) {
  const map = {
    'INTIMATED': 0,
    'SURVEY_DONE': 1,
    'PM_DONE': 2,
    'DOCS_SUBMITTED': 3,
    'UNDER_REVIEW': 4,
    'SETTLED': 5,
    'REJECTED': 4,
    'ESCALATED': 4,
  };
  return map[status] ?? 0;
}

String ciaClaimStageLabel(AppLocalizations l10n, String key) {
  switch (key) {
    case 's_intimated':
      return l10n.ciaClaimSIntimated;
    case 's_survey':
      return l10n.ciaClaimSSurvey;
    case 's_pm':
      return l10n.ciaClaimSPm;
    case 's_docs':
      return l10n.ciaClaimSDocs;
    case 's_review':
      return l10n.ciaClaimSReview;
    case 's_settled':
      return l10n.ciaClaimSSettled;
    default:
      return key;
  }
}

/// Short "D Mon" date, matching cia-*.tsx's shortDate() helper.
String ciaShortDate(String? iso) {
  if (iso == null || iso.isEmpty) return '';
  final d = DateTime.tryParse(iso);
  if (d == null) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return '${d.day} ${months[d.month - 1]}';
}
