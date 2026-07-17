import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../design_system/tokens.dart';
import '../../../design_system/widgets/app_card.dart';
import '../../../design_system/widgets/capture_photo_field.dart';
import '../../../design_system/widgets/captured_evidence.dart';
import '../../../design_system/widgets/status_chip.dart';
import '../../../design_system/widgets/step_timeline.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../models/insurance_status.dart';
import '../providers/insurance_providers.dart';

Map<String, String> _docLabels(AppLocalizations l10n) => {
  'DEATH_INTIMATION': l10n.pashuClaimDocDeath,
  'POSTMORTEM_REPORT': l10n.pashuClaimDocPm,
  'EAR_TAG_PHOTO': l10n.pashuClaimDocTagPhoto,
  'CLAIM_FORM': l10n.pashuClaimDocForm,
};

/// Pashu Suraksha claim — report a death, then the NLM 4-document checklist
/// on a visible 15-day clock. Decisions are never automated. Mirrors
/// app/app/pashu-claim.tsx, with REAL camera capture + a real SHA-256 hash
/// replacing RN's mockHash() placeholder, plus REJECTED/escalated handling
/// and a visible settlement countdown (from claim.stage_deadline_at) that
/// RN never renders despite its own doc-comment saying "a visible clock".
class PashuClaimScreen extends ConsumerStatefulWidget {
  const PashuClaimScreen({super.key});

  @override
  ConsumerState<PashuClaimScreen> createState() => _PashuClaimScreenState();
}

class _PashuClaimScreenState extends ConsumerState<PashuClaimScreen> {
  bool _loading = true;
  bool _busy = false;
  List<Map> _claims = [];
  List<Map> _policies = [];
  Map? _selected; // {claim, checklist}
  String? _policyUuid;
  final _perilCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _perilCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final api = ref.read(insuranceApiProvider);
      final results = await Future.wait([api.claimsMe(), api.policiesMe()]);
      final cl = results[0];
      final po = results[1];
      setState(() {
        if (cl['success'] == true) _claims = List<Map>.from(cl['data'] ?? []);
        if (po['success'] == true) {
          _policies = List<Map>.from(
            po['data']?['policies'] ?? [],
          ).where((p) => p['status'] == 'active').toList();
        }
      });
    } catch (_) {
      // offline-tolerant
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openClaim(String uuid) async {
    final res = await ref.read(insuranceApiProvider).getClaim(uuid);
    if (res['success'] == true) setState(() => _selected = res['data']);
  }

  void _showAlert(String title, String msg) {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(msg),
        actions: [TextButton(onPressed: () => Navigator.of(ctx).pop(), child: Text(AppLocalizations.of(context).commonOk))],
      ),
    );
  }

  Future<void> _intimate() async {
    final l10n = AppLocalizations.of(context);
    if (_policyUuid == null) {
      _showAlert(l10n.pashuClaimPickPolicy, l10n.pashuClaimWhichDied);
      return;
    }
    setState(() => _busy = true);
    try {
      final res = await ref.read(insuranceApiProvider).intimateClaim(
        policyUuid: _policyUuid!,
        peril: _perilCtrl.text.trim().isEmpty ? 'disease' : _perilCtrl.text.trim(),
      );
      if (res['success'] == true) {
        _perilCtrl.clear();
        await _load();
        await _openClaim(res['data']['claimUuid'].toString());
      } else {
        _showAlert(l10n.pashuClaimCouldNotFile, (res['message'] ?? l10n.commonRetry).toString());
      }
    } catch (_) {
      _showAlert(l10n.commonError, l10n.pashuCannotConnect);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _addDoc(String kind, CapturedEvidence evidence) async {
    final l10n = AppLocalizations.of(context);
    final claim = _selected?['claim'] as Map?;
    if (claim == null) return;
    setState(() => _busy = true);
    try {
      final api = ref.read(insuranceApiProvider);
      final claimUuid = claim['claim_uuid'].toString();
      final upload = await api.uploadEvidencePhoto(claimUuid, evidence);
      if (upload['success'] != true) {
        _showAlert(l10n.pashuClaimCouldNotAttach, l10n.pashuClaimEvidenceCaptureFailed);
        return;
      }
      final res = await api.addEvidence(
        claimUuid,
        kind: kind,
        objectKey: upload['data']['objectKey'].toString(),
        contentHash: upload['data']['contentHash'].toString(),
        gpsLat: evidence.gpsLat,
        gpsLng: evidence.gpsLng,
        capturedAt: evidence.capturedAt,
      );
      if (res['success'] == true) {
        await _openClaim(claimUuid);
      } else {
        _showAlert(l10n.pashuClaimCouldNotAttach, (res['message'] ?? l10n.commonRetry).toString());
      }
    } catch (_) {
      _showAlert(l10n.commonError, l10n.pashuCannotConnect);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submitDocs() async {
    final l10n = AppLocalizations.of(context);
    final claim = _selected?['claim'] as Map?;
    if (claim == null) return;
    setState(() => _busy = true);
    try {
      final claimUuid = claim['claim_uuid'].toString();
      final res = await ref.read(insuranceApiProvider).submitDocs(claimUuid);
      if (res['success'] == true) {
        _showAlert(l10n.pashuClaimSubmitted, l10n.pashuClaimSubmittedMsg);
        await _load();
        await _openClaim(claimUuid);
      } else {
        _showAlert(l10n.pashuClaimNotSubmitted, (res['message'] ?? l10n.pashuClaimCompleteFour).toString());
      }
    } catch (_) {
      _showAlert(l10n.commonError, l10n.pashuCannotConnect);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);

    if (_loading) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.pashuActClaim)),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    if (_selected != null) return _detail(l10n);
    return _list(l10n);
  }

  Widget _list(AppLocalizations l10n) {
    return Scaffold(
      appBar: AppBar(title: Text(l10n.pashuActClaim)),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(AppSpacing.lg),
          children: [
            AppCard(
              title: l10n.pashuClaimReportDeath,
              child: _policies.isEmpty
                  ? Text(l10n.pashuClaimNoActivePolicy, style: const TextStyle(color: AppColors.muted))
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            for (final p in _policies)
                              _chip(
                                '${l10n.pashuSi} ${formatRupees(p['sum_insured'])}',
                                _policyUuid == p['policy_uuid'],
                                () => setState(() => _policyUuid = p['policy_uuid'].toString()),
                              ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        TextField(
                          controller: _perilCtrl,
                          decoration: InputDecoration(hintText: l10n.pashuClaimCausePlaceholder),
                        ),
                        const SizedBox(height: 10),
                        ElevatedButton(
                          onPressed: _busy ? null : _intimate,
                          child: _busy
                              ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                              : Text(l10n.pashuClaimFileClaim),
                        ),
                      ],
                    ),
            ),
            AppCard(
              title: l10n.pashuClaimMyClaims,
              child: _claims.isEmpty
                  ? Text(l10n.pashuClaimNoClaims, style: const TextStyle(color: AppColors.muted))
                  : Column(
                      children: [
                        for (final c in _claims)
                          InkWell(
                            onTap: () => _openClaim(c['claim_uuid'].toString()),
                            child: Container(
                              padding: const EdgeInsets.symmetric(vertical: 9),
                              decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: AppColors.line))),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          '${formatRupees(c['sum_claimed'])} · ${c['peril'] ?? '—'}',
                                          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.ink),
                                        ),
                                        Text(
                                          (c['intimated_at'] ?? '').toString().split('T').first,
                                          style: const TextStyle(color: AppColors.muted, fontSize: 12),
                                        ),
                                      ],
                                    ),
                                  ),
                                  StatusChip(label: (c['status'] ?? '').toString(), tone: claimStatusTone((c['status'] ?? '').toString())),
                                ],
                              ),
                            ),
                          ),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _detail(AppLocalizations l10n) {
    final c = _selected!['claim'] as Map;
    final checklist = _selected!['checklist'] as Map?;
    final status = (c['status'] ?? '').toString();
    final required = List<String>.from(checklist?['required'] ?? []);
    final present = List<String>.from(checklist?['present'] ?? []);
    final complete = checklist?['complete'] == true;
    final escalated = c['escalated'] == true;
    final deadline = DateTime.tryParse((c['stage_deadline_at'] ?? '').toString());
    final penal = asNum(c['penal_interest_accrued']);

    int? daysLeft;
    bool overdue = false;
    if (deadline != null) {
      final diff = deadline.difference(DateTime.now()).inDays;
      overdue = diff < 0;
      daysLeft = diff.abs();
    }

    return Scaffold(
      appBar: AppBar(title: Text(l10n.pashuClaimStatus)),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            margin: const EdgeInsets.only(bottom: AppSpacing.md),
            decoration: BoxDecoration(color: AppColors.warnAmberBg, borderRadius: BorderRadius.circular(AppRadii.button)),
            child: Text(l10n.pashuClaimBanner, style: const TextStyle(color: AppColors.warnAmber, fontSize: 12)),
          ),

          if (status == 'REJECTED')
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(AppSpacing.md),
              margin: const EdgeInsets.only(bottom: AppSpacing.md),
              decoration: BoxDecoration(color: AppColors.dangerBg, borderRadius: BorderRadius.circular(AppRadii.button)),
              child: Text(
                '${l10n.pashuClaimRejectedTitle}${c['rejection_reason'] != null ? ' — ${c['rejection_reason']}' : ''}',
                style: const TextStyle(color: AppColors.danger, fontSize: 13, fontWeight: FontWeight.w600),
              ),
            )
          else
            AppCard(title: l10n.pashuClaimStatus, child: StepTimeline(steps: buildClaimTimeline(l10n, status))),

          AppCard(
            title: l10n.pashuClaimChecklist,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final kind in required)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Row(
                      children: [
                        Text(present.contains(kind) ? '✅ ' : '⬜ ', style: const TextStyle(fontSize: 14)),
                        Expanded(
                          child: Text(
                            _docLabels(l10n)[kind] ?? kind,
                            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.ink),
                          ),
                        ),
                        if (!present.contains(kind) && status != 'SETTLED' && status != 'REJECTED')
                          CapturePhotoField(
                            label: l10n.pashuClaimAttach,
                            captured: null,
                            onCaptured: (e) => _addDoc(kind, e),
                          ),
                      ],
                    ),
                  ),
              ],
            ),
          ),

          AppCard(
            title: l10n.pashuClaimSettlementClock,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(l10n.pashuClaimSettlementNote, style: const TextStyle(color: AppColors.muted, fontSize: 13, height: 1.3)),
                if (daysLeft != null) ...[
                  const SizedBox(height: 8),
                  Text(
                    overdue ? l10n.pashuClaimOverdue(daysLeft) : l10n.pashuClaimDaysLeft(daysLeft),
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                      color: overdue ? AppColors.danger : AppColors.brandDark,
                    ),
                  ),
                ],
                if (escalated || penal > 0) ...[
                  const SizedBox(height: 6),
                  Text(
                    '${l10n.pashuClaimPenalInterest}: ${formatRupees(penal)}',
                    style: const TextStyle(color: AppColors.brandDark, fontWeight: FontWeight.w700, fontSize: 14),
                  ),
                ],
                const SizedBox(height: 8),
                Text(l10n.pashuClaimHashChainNote, style: const TextStyle(color: AppColors.muted, fontSize: 11)),
              ],
            ),
          ),

          if (status == 'PM_DONE' && complete)
            ElevatedButton(
              onPressed: _busy ? null : _submitDocs,
              child: _busy
                  ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : Text(l10n.pashuClaimSubmitDocs),
            ),
          TextButton(
            onPressed: () => setState(() => _selected = null),
            child: Text(l10n.pashuClaimBackToClaims),
          ),
        ],
      ),
    );
  }

  Widget _chip(String label, bool selected, VoidCallback onTap) {
    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          color: selected ? AppColors.accent : Colors.transparent,
          border: Border.all(color: selected ? AppColors.brand : AppColors.line),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 13,
            fontWeight: selected ? FontWeight.w700 : FontWeight.w400,
            color: selected ? AppColors.brandDark : AppColors.muted,
          ),
        ),
      ),
    );
  }
}
