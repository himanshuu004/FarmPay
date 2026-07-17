import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../design_system/tokens.dart';
import '../../../design_system/widgets/capture_photo_field.dart';
import '../../../design_system/widgets/captured_evidence.dart';
import '../../../design_system/widgets/quantity_stepper.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../models/cia_status.dart' show ciaDocIcon;
import '../providers/cia_providers.dart';

/// CIA — application form + document checklist. The row already exists
/// from EOI and becomes fillable after DCS selection; merges ERP pre-fill,
/// the farmer's requested cattle count / breed, and camera-captured
/// documents, then submits (mandatory-gated → PENDING_SUPERVISOR_VERIFY).
///
/// Mirrors app/app/cia-application.tsx, but replaces RN's client-side
/// placeholderHash() with real captured bytes uploaded via the new
/// POST .../evidence endpoint (Convention 9: real SHA-256, no
/// resize/recompress) — the backend already accepted a real contentHash,
/// RN just never had a byte-storage endpoint to compute one from.
class CiaApplicationScreen extends ConsumerStatefulWidget {
  const CiaApplicationScreen({super.key});

  @override
  ConsumerState<CiaApplicationScreen> createState() => _CiaApplicationScreenState();
}

class _CiaApplicationScreenState extends ConsumerState<CiaApplicationScreen> {
  bool _loading = true;
  bool _notFillable = false;
  Map? _draft;
  int _count = 1;
  final _breedCtrl = TextEditingController();
  final Map<String, bool> _captured = {};
  List<String> _missing = [];
  bool _saving = false;
  bool _submitting = false;
  bool _submitted = false;

  @override
  void dispose() {
    _breedCtrl.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _notFillable = false;
    });
    try {
      final res = await ref.read(ciaApiProvider).openDraft();
      if (res['success'] == true) {
        final d = Map.from(res['data']);
        final docs = Map.from(d['documents'] ?? {});
        setState(() {
          _draft = d;
          _count = (d['requestedCattleCount'] as num?)?.toInt() ?? 1;
          _breedCtrl.text = (d['preferredBreed'] ?? '').toString();
          _captured
            ..clear()
            ..addEntries(List<String>.from(docs['captured'] ?? []).map((k) => MapEntry(k, true)));
          _missing = List<String>.from(docs['missingMandatory'] ?? []);
        });
      } else if (res['errorCode'] == 'CIA_NO_FILLABLE_APP') {
        setState(() => _notFillable = true);
      }
    } catch (_) {
      // surfaced via the generic load-error view below
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _captureDoc(String key, CapturedEvidence evidence) async {
    final appUuid = _draft?['applicationUuid'];
    if (appUuid == null) return;
    final api = ref.read(ciaApiProvider);
    final l10n = AppLocalizations.of(context);
    try {
      final up = await api.uploadEvidence(appUuid, evidence);
      if (up['success'] != true) {
        _showSnack(l10n.ciaLoadError, error: true);
        return;
      }
      final r = await api.uploadDoc(
        appUuid,
        checklistKey: key,
        docRef: up['data']['url'].toString(),
        contentHash: up['data']['contentHash'].toString(),
        mimeType: 'image/jpeg',
        captureMeta: {
          'capturedAt': evidence.capturedAt.toIso8601String(),
          if (evidence.gpsLat != null) 'gpsLat': evidence.gpsLat,
          if (evidence.gpsLng != null) 'gpsLng': evidence.gpsLng,
        },
      );
      if (r['success'] == true) {
        setState(() {
          _captured[key] = true;
          final missingMandatory = r['data']?['missingMandatory'];
          if (missingMandatory != null) _missing = List<String>.from(missingMandatory);
        });
      } else {
        _showSnack((r['message'] ?? l10n.ciaLoadError).toString(), error: true);
      }
    } catch (_) {
      _showSnack(l10n.ciaLoadError, error: true);
    }
  }

  Future<void> _saveDraft() async {
    setState(() => _saving = true);
    final l10n = AppLocalizations.of(context);
    try {
      await ref.read(ciaApiProvider).openDraft(
        requestedCattleCount: _count,
        preferredBreed: _breedCtrl.text.trim().isEmpty ? null : _breedCtrl.text.trim(),
      );
      if (mounted) _showSnack(l10n.ciaAppSaved);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _submit() async {
    final appUuid = _draft?['applicationUuid'];
    if (appUuid == null) return;
    setState(() => _submitting = true);
    final l10n = AppLocalizations.of(context);
    try {
      await ref.read(ciaApiProvider).openDraft(
        requestedCattleCount: _count,
        preferredBreed: _breedCtrl.text.trim().isEmpty ? null : _breedCtrl.text.trim(),
      );
      final r = await ref.read(ciaApiProvider).submitApplication(appUuid);
      if (r['success'] == true) {
        setState(() => _submitted = true);
      } else if (r['missingMandatory'] != null || r['details']?['missingMandatory'] != null) {
        setState(() => _missing = List<String>.from(r['details']?['missingMandatory'] ?? r['missingMandatory'] ?? []));
        if (mounted) _showSnack(l10n.ciaAppCaptureFirst, error: true);
      } else if (mounted) {
        _showSnack((r['message'] ?? l10n.ciaLoadError).toString(), error: true);
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _showSnack(String msg, {bool error = false}) => ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(content: Text(msg), backgroundColor: error ? AppColors.danger : null),
  );

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    if (_loading) {
      return Scaffold(appBar: AppBar(title: Text(l10n.ciaNavApplication)), body: const Center(child: CircularProgressIndicator()));
    }
    if (_notFillable) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.ciaNavApplication)),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: Text(l10n.ciaAppNotSelected, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.ink)),
          ),
        ),
      );
    }
    final draft = _draft;
    if (draft == null) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.ciaNavApplication)),
        body: Center(child: Text(l10n.ciaLoadError, style: const TextStyle(color: AppColors.muted))),
      );
    }
    if (_submitted) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.ciaNavApplication)),
        body: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            const Text('✅', style: TextStyle(fontSize: 52), textAlign: TextAlign.center),
            const SizedBox(height: 6),
            Text(l10n.ciaAppSubmitted, textAlign: TextAlign.center, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            Text(l10n.ciaAppSubmittedSub, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.muted)),
            const SizedBox(height: 20),
            ElevatedButton(
              onPressed: () => context.pushReplacement('/cia-status'),
              child: Text(l10n.ciaEoiTrack),
            ),
          ],
        ),
      );
    }

    final prefill = Map.from(draft['prefill'] ?? {});
    final checklist = List<Map>.from(draft['documentChecklist'] ?? []);
    final mandatory = checklist.where((d) => (d['required'] ?? 'MANDATORY') == 'MANDATORY').toList();
    final gotMandatory = mandatory.where((d) => _captured[d['key']] == true).length;
    final canSubmit = _missing.isEmpty && mandatory.isNotEmpty;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.ciaNavApplication)),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          _sectionLabel(l10n.ciaAppApplicant),
          Container(
            decoration: BoxDecoration(
              color: AppColors.card,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.line),
            ),
            child: Column(
              children: [
                _prefillRow(l10n.ciaAppApplicant, (prefill['name'] ?? '—').toString()),
                _prefillRow(l10n.ciaAppMobile, (prefill['mobile'] ?? '—').toString()),
                _prefillRow(l10n.ciaAppSociety, (prefill['dcsRef'] ?? draft['schemeVersion']).toString()),
                _prefillRow(l10n.ciaAppBank, (prefill['bankAccount'] ?? '—').toString(), last: true),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Text(l10n.ciaAppHowMany, style: const TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          QuantityStepper(value: _count, onChanged: (v) => setState(() => _count = v.clamp(1, 10))),
          const SizedBox(height: 16),
          Text(l10n.ciaAppBreed, style: const TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          TextField(controller: _breedCtrl, decoration: InputDecoration(hintText: l10n.ciaAppBreedPh)),
          const SizedBox(height: 20),
          _sectionLabel(l10n.ciaAppDocuments),
          for (final d in checklist) _docCaptureRow(l10n, d),
          const SizedBox(height: 4),
          Text(
            '$gotMandatory ${l10n.ciaAppOf} ${mandatory.length} ${l10n.ciaAppNOfM}',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 12.5, color: AppColors.muted),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              OutlinedButton(
                onPressed: _saving ? null : _saveDraft,
                child: _saving
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                    : Text(l10n.ciaAppSaveDraft),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: ElevatedButton(
                  onPressed: canSubmit && !_submitting ? _submit : null,
                  child: _submitting
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : Text(l10n.ciaAppSubmit),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _sectionLabel(String text) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Text(
      text.toUpperCase(),
      style: const TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w800, letterSpacing: 0.5),
    ),
  );

  Widget _prefillRow(String label, String value, {bool last = false}) => Container(
    padding: const EdgeInsets.all(11),
    decoration: BoxDecoration(
      border: last ? null : const Border(bottom: BorderSide(color: Color(0xFFF2F2F2))),
    ),
    child: Row(
      children: [
        SizedBox(width: 96, child: Text(label, style: const TextStyle(fontSize: 12.5, color: AppColors.muted))),
        Expanded(child: Text(value, style: const TextStyle(fontWeight: FontWeight.w700), overflow: TextOverflow.ellipsis)),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(color: AppColors.blueBg, borderRadius: BorderRadius.circular(999)),
          child: Text(
            AppLocalizations.of(context).ciaAppErp,
            style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w800, color: AppColors.blue),
          ),
        ),
      ],
    ),
  );

  Widget _docCaptureRow(AppLocalizations l10n, Map d) {
    final key = d['key'].toString();
    final done = _captured[key] == true;
    final mandatory = (d['required'] ?? 'MANDATORY') == 'MANDATORY';
    return Container(
      padding: const EdgeInsets.all(11),
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: done ? const Color(0xFFF2FBF5) : AppColors.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: done ? const Color(0xFFBFE3CF) : AppColors.line),
      ),
      child: Row(
        children: [
          Text(done ? '✅' : ciaDocIcon(key), style: const TextStyle(fontSize: 20)),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text((d['label'] ?? key).toString(), style: const TextStyle(fontWeight: FontWeight.w600)),
                Text(
                  done ? l10n.ciaAppCaptured : (mandatory ? l10n.ciaAppRequired : l10n.ciaAppOptional),
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: done ? AppColors.brandDark : (mandatory ? AppColors.danger : AppColors.muted),
                  ),
                ),
              ],
            ),
          ),
          CapturePhotoField(
            label: done ? l10n.ciaAppRetake : l10n.ciaAppCapture,
            captured: null,
            onCaptured: (ev) => _captureDoc(key, ev),
          ),
        ],
      ),
    );
  }
}
