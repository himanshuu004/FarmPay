import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../design_system/tokens.dart';
import '../../../design_system/widgets/app_card.dart';
import '../../../design_system/widgets/capture_photo_field.dart';
import '../../../design_system/widgets/captured_evidence.dart';
import '../../../design_system/widgets/step_timeline.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../../logbook/widgets/form_kit.dart';
import '../models/insurance_status.dart';
import '../providers/insurance_providers.dart';

/// Pashu Suraksha enrolment — the farmer-authored steps of the NLM machine:
/// DRAFT (create proposal) → TAGGED (12-digit NDDB tag + 2 live photos).
/// Mirrors app/app/pashu-enrol.tsx, with REAL camera capture (Convention
/// 9/25/32) replacing RN's hardcoded placeholder photo URLs — RN's own
/// source comment flags this as a known gap, not settled behavior to copy.
class PashuEnrolScreen extends ConsumerStatefulWidget {
  const PashuEnrolScreen({
    super.key,
    this.planCode,
    this.marketValue,
    this.preselectAnimalId,
  });

  final String? planCode;
  final String? marketValue;
  final String? preselectAnimalId;

  @override
  ConsumerState<PashuEnrolScreen> createState() => _PashuEnrolScreenState();
}

class _PashuEnrolScreenState extends ConsumerState<PashuEnrolScreen> {
  List<Map> _animals = [];
  int? _animalId;
  final _tagCtrl = TextEditingController();
  bool _consent = false;
  bool _muzzle = true;
  bool _busy = false;
  int _doneStep = 0; // 0=nothing, 1=draft, 2=tagged
  CapturedEvidence? _ownerPhoto;
  CapturedEvidence? _tagPhoto;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _tagCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final res = await ref.read(insuranceApiProvider).assetsMe();
    if (res['success'] == true) {
      final uncovered = List<Map>.from(res['data'] ?? []).where((a) => a['covered'] != true).toList();
      final pre = int.tryParse(widget.preselectAnimalId ?? '');
      setState(() {
        _animals = uncovered;
        if (pre != null && uncovered.any((a) => a['animalId'] == pre)) _animalId = pre;
      });
    }
  }

  bool get _tagValid => RegExp(r'\d').allMatches(_tagCtrl.text).length == 12;
  String get _tagDigits => _tagCtrl.text.replaceAll(RegExp(r'\D'), '');
  bool get _photosOk => _ownerPhoto != null && _tagPhoto != null;

  void _showAlert(String title, String msg) {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(msg),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(), child: Text(AppLocalizations.of(context).commonOk)),
        ],
      ),
    );
  }

  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context);
    if (!_consent) {
      _showAlert(l10n.pashuEnrolConsentNeeded, l10n.pashuEnrolConsentMsg);
      return;
    }
    if (!_tagValid) {
      _showAlert(l10n.pashuEnrolTagTitle, l10n.pashuEnrolTagMsg);
      return;
    }
    if (!_photosOk) {
      _showAlert(l10n.pashuEnrolTagTitle, l10n.pashuEnrolPhotosRequired);
      return;
    }
    setState(() => _busy = true);
    try {
      final api = ref.read(insuranceApiProvider);
      await api.postConsent(consentType: 'insurance').catchError((_) => {});
      final mk = await api.createProposal(
        planCode: widget.planCode ?? '',
        assetRefId: _animalId,
        marketValue: widget.marketValue != null ? num.tryParse(widget.marketValue!) : null,
      );
      if (mk['success'] != true) {
        _showAlert(l10n.pashuEnrolCouldNotStart, (mk['message'] ?? l10n.commonRetry).toString());
        return;
      }
      setState(() => _doneStep = 1);
      final proposalUuid = mk['data']['proposalUuid'].toString();

      final ownerUp = await api.uploadProposalPhoto(proposalUuid, _ownerPhoto!);
      final tagUp = await api.uploadProposalPhoto(proposalUuid, _tagPhoto!);
      if (ownerUp['success'] != true || tagUp['success'] != true) {
        _showAlert(l10n.pashuEnrolTagFailed, l10n.commonRetry);
        return;
      }

      final tg = await api.tagProposal(
        proposalUuid,
        tagUid: _tagDigits,
        ownerPhotoUrl: ownerUp['data']['url'].toString(),
        tagPhotoUrl: tagUp['data']['url'].toString(),
      );
      if (tg['success'] == true) {
        // Muzzle burst — SHADOW second factor (AI proposes, never gates
        // issuance). No on-device ONNX model exists yet (AI-1, a later
        // phase); this placeholder embedding is derived from the tag so
        // it's stable per animal, matching RN's own documented approach.
        // Failures never block enrolment — the 12-digit tag remains the
        // statutory identity.
        if (_muzzle) {
          try {
            await api.postConsent(consentType: 'biometric');
            final digits = _tagDigits.split('').map(int.parse).toList();
            final embedding = List.generate(128, (i) => (digits[i % digits.length] + 1) / 11.0);
            await api.postBiometric(animalId: _animalId, tagUid: _tagDigits, embedding: embedding, quality: 0.9);
          } catch (_) {
            // shadow-mode — enrolment proceeds regardless
          }
        }
        setState(() => _doneStep = 2);
        if (mounted) _showAlert(l10n.pashuEnrolSubmitted, l10n.pashuEnrolSubmittedMsg);
      } else {
        _showAlert(l10n.pashuEnrolTagFailed, (tg['message'] ?? l10n.commonRetry).toString());
      }
    } catch (_) {
      _showAlert(l10n.commonError, l10n.pashuEnrolConnCheck);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);

    return Scaffold(
      appBar: AppBar(title: Text(l10n.pashuEnrolTitle)),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          AppCard(child: StepTimeline(steps: buildEnrolmentTimeline(l10n, _doneStep))),

          if (_doneStep < 2) ...[
            AppCard(
              title: l10n.pashuEnrolWhichAnimal,
              child: _animals.isEmpty
                  ? Text(l10n.pashuEnrolAllCovered, style: const TextStyle(color: AppColors.muted))
                  : Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final a in _animals)
                          _chip(
                            (a['tagNumber'] ?? a['species'] ?? l10n.pashuAnimalWord).toString(),
                            _animalId == a['animalId'],
                            () => setState(() => _animalId = a['animalId'] as int?),
                          ),
                      ],
                    ),
            ),

            AppCard(
              title: l10n.pashuEnrolStatutoryIdentity,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  BigInput(controller: _tagCtrl, placeholder: l10n.pashuEnrolTagPlaceholder, numeric: true),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      CapturePhotoField(
                        label: l10n.pashuEnrolPhotoOwner,
                        captured: _ownerPhoto,
                        onCaptured: (e) => setState(() => _ownerPhoto = e),
                      ),
                      CapturePhotoField(
                        label: l10n.pashuEnrolPhotoTag,
                        captured: _tagPhoto,
                        onCaptured: (e) => setState(() => _tagPhoto = e),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  _check(l10n.pashuEnrolMuzzleCheck, _muzzle, () => setState(() => _muzzle = !_muzzle)),
                  Text(l10n.pashuEnrolMuzzleNote, style: const TextStyle(color: AppColors.muted, fontSize: 12)),
                ],
              ),
            ),

            _check(l10n.pashuEnrolPremiumConsent, _consent, () => setState(() => _consent = !_consent)),
            const SizedBox(height: AppSpacing.sm),

            ElevatedButton(
              onPressed: (!_consent || !_tagValid || !_photosOk || _busy) ? null : _submit,
              child: _busy
                  ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : Text(l10n.pashuEnrolSubmit),
            ),
          ] else
            ElevatedButton(
              onPressed: () => context.go('/suraksha'),
              child: Text(l10n.commonDone),
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

  Widget _check(String label, bool value, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 22,
              height: 22,
              margin: const EdgeInsets.only(top: 1),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(6),
                color: value ? AppColors.brand : Colors.transparent,
                border: Border.all(color: value ? AppColors.brand : AppColors.line, width: 2),
              ),
              alignment: Alignment.center,
              child: value ? const Icon(Icons.check, size: 14, color: Colors.white) : null,
            ),
            const SizedBox(width: 10),
            Expanded(child: Text(label, style: const TextStyle(fontSize: 13, color: AppColors.ink, height: 1.3))),
          ],
        ),
      ),
    );
  }
}
