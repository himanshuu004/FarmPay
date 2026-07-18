import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../design_system/tokens.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../providers/dairy_providers.dart';
import '../widgets/form_kit.dart';
import '../widgets/voice_input_button.dart';

const _herdWideSentinel = '__HERD__';

/// Mirrors app/app/dairy-treatment.tsx exactly — including its lack of
/// client-side validation before save (animalId may be null = herd-wide).
class DairyTreatmentScreen extends ConsumerStatefulWidget {
  const DairyTreatmentScreen({super.key});

  @override
  ConsumerState<DairyTreatmentScreen> createState() =>
      _DairyTreatmentScreenState();
}

class _DairyTreatmentScreenState extends ConsumerState<DairyTreatmentScreen> {
  bool _saving = false;
  List<Map> _animals = [];

  String? _animalId;
  String _treatmentDate = todayYMD();
  String _treatmentType = 'OTHER';
  final _conditionCtrl = TextEditingController();
  final _vetNameCtrl = TextEditingController();
  String _vetType = 'PRIVATE';
  final _medicineCostCtrl = TextEditingController();
  final _vetFeeCtrl = TextEditingController();
  final _otherCostCtrl = TextEditingController();
  final _costFormalCtrl = TextEditingController();
  final _costInformalCtrl = TextEditingController();
  String _payMode = 'CASH';
  String _outcome = 'IMPROVING';
  final _notesCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadAnimals();
  }

  @override
  void dispose() {
    for (final c in [
      _conditionCtrl,
      _vetNameCtrl,
      _medicineCostCtrl,
      _vetFeeCtrl,
      _otherCostCtrl,
      _costFormalCtrl,
      _costInformalCtrl,
      _notesCtrl,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _loadAnimals() async {
    try {
      final res = await ref.read(dairyApiProvider).listAnimals();
      if (res['success'] == true)
        setState(() => _animals = List<Map>.from(res['data'] ?? []));
    } catch (_) {}
  }

  List<ChoiceOption<String>> _treatments(AppLocalizations l10n) => [
    ChoiceOption(value: 'VACCINATION', icon: '💉', label: l10n.trtTypeVaccine),
    ChoiceOption(value: 'DEWORMING', icon: '🪱', label: l10n.trtTypeDeworm),
    ChoiceOption(value: 'MASTITIS', icon: '🩹', label: l10n.trtTypeMastitis),
    ChoiceOption(value: 'FEVER', icon: '🌡️', label: l10n.trtTypeFever),
    ChoiceOption(value: 'INJURY', icon: '🩸', label: l10n.trtTypeInjury),
    ChoiceOption(
      value: 'REPRODUCTIVE',
      icon: '🤰',
      label: l10n.trtTypeReproductive,
    ),
    ChoiceOption(
      value: 'NUTRITIONAL',
      icon: '🥗',
      label: l10n.trtTypeNutrition,
    ),
    ChoiceOption(value: 'OTHER', icon: '📦', label: l10n.trtTypeOther),
  ];

  List<ChoiceOption<String>> _outcomes(AppLocalizations l10n) => [
    ChoiceOption(value: 'RECOVERED', label: l10n.trtOutcomeRecovered),
    ChoiceOption(value: 'IMPROVING', label: l10n.trtOutcomeImproving),
    ChoiceOption(value: 'NO_CHANGE', label: l10n.trtOutcomeNoChange),
    ChoiceOption(value: 'WORSENED', label: l10n.trtOutcomeWorsened),
    ChoiceOption(value: 'DIED', label: l10n.trtOutcomeDied),
  ];

  List<ChoiceOption<String>> _vetTypes(AppLocalizations l10n) => [
    ChoiceOption(value: 'GOVT', label: l10n.trtVettypeGovt),
    ChoiceOption(value: 'PRIVATE', label: l10n.trtVettypePrivate),
    ChoiceOption(value: 'PARAVET', label: l10n.trtVettypeParavet),
    ChoiceOption(value: 'SELF', label: l10n.trtVettypeSelf),
  ];

  List<ChoiceOption<String>> _payModes(AppLocalizations l10n) => [
    ChoiceOption(value: 'CASH', label: l10n.costPayCash),
    ChoiceOption(value: 'UPI', label: l10n.costPayUpi),
    ChoiceOption(value: 'BANK', label: l10n.costPayBank),
    ChoiceOption(value: 'CREDIT', label: l10n.costPayCredit),
  ];

  void _showSnack(String message, {bool error = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: error ? AppColors.danger : null,
      ),
    );
  }

  Future<void> _save() async {
    final l10n = AppLocalizations.of(context);
    setState(() => _saving = true);
    final body = <String, dynamic>{
      'animalId': _animalId,
      'treatmentDate': _treatmentDate,
      'treatmentType': _treatmentType,
      'condition': _conditionCtrl.text.trim().isEmpty
          ? null
          : _conditionCtrl.text.trim(),
      'vetName': _vetNameCtrl.text.trim().isEmpty
          ? null
          : _vetNameCtrl.text.trim(),
      'vetType': _vetType,
      'medicineCost': double.tryParse(_medicineCostCtrl.text) ?? 0,
      'vetFee': double.tryParse(_vetFeeCtrl.text) ?? 0,
      'otherCost': double.tryParse(_otherCostCtrl.text) ?? 0,
      'costFormal': double.tryParse(_costFormalCtrl.text) ?? 0,
      'costInformal': double.tryParse(_costInformalCtrl.text) ?? 0,
      'paymentMode': _payMode,
      'outcome': _outcome,
      'notes': _notesCtrl.text.trim().isEmpty ? null : _notesCtrl.text.trim(),
    };
    try {
      final res = await ref.read(dairyApiProvider).createTreatmentEvent(body);
      if (res['success'] == true) {
        _showSnack(l10n.trtLogged);
        if (mounted) Navigator.of(context).pop();
      } else {
        _showSnack(res['message'] ?? l10n.commonRetry, error: true);
      }
    } catch (_) {
      await ref
          .read(dairyOfflineSyncProvider)
          .enqueue(
            kind: 'treatment',
            path: '/livestock/treatment',
            payload: body,
          );
      _showSnack(l10n.commonOfflineRetry);
      if (mounted) Navigator.of(context).pop();
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.homeTreatment)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(AppSpacing.lg, 0, AppSpacing.lg, 40),
        children: [
          _card([
            const FieldLabel(en: 'Which animal?', hi: 'कौन सा पशु?'),
            ChipsField<String>(
              options: [
                ChoiceOption(value: _herdWideSentinel, label: l10n.trtHerdWide),
                for (final a in _animals)
                  ChoiceOption(
                    value: a['animal_uuid'] as String,
                    label: (a['name'] ?? a['tag_number'] ?? '').toString(),
                  ),
              ],
              value: _animalId ?? _herdWideSentinel,
              onChange: (v) =>
                  setState(() => _animalId = v == _herdWideSentinel ? null : v),
            ),
          ]),
          _card([
            const FieldLabel(en: 'Treatment', hi: 'इलाज'),
            ChoiceGrid<String>(
              options: _treatments(l10n),
              value: _treatmentType,
              onChange: (v) => setState(() => _treatmentType = v),
            ),
          ]),
          _card([
            const FieldLabel(en: 'When?', hi: 'कब?'),
            DateField(
              value: _treatmentDate,
              onChange: (v) => setState(() => _treatmentDate = v),
            ),
          ]),
          _card([
            const FieldLabel(en: 'Costs', hi: 'लागत'),
            Row(
              children: [
                Expanded(
                  child: _miniLabeled(
                    l10n.trtMedicine,
                    BigInput(
                      controller: _medicineCostCtrl,
                      placeholder: '420',
                      numeric: true,
                      prefix: '₹',
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _miniLabeled(
                    l10n.trtVetFee,
                    BigInput(
                      controller: _vetFeeCtrl,
                      placeholder: '300',
                      numeric: true,
                      prefix: '₹',
                    ),
                  ),
                ),
              ],
            ),
            const FieldLabel(en: 'Other cost', hi: 'अन्य'),
            BigInput(
              controller: _otherCostCtrl,
              placeholder: '50',
              numeric: true,
              prefix: '₹',
            ),
            const FieldLabel(en: 'How did it go?', hi: 'नतीजा'),
            ChipsField<String>(
              options: _outcomes(l10n),
              value: _outcome,
              onChange: (v) => setState(() => _outcome = v),
            ),
          ]),
          _card([
            const FieldLabel(en: 'Illness / condition', hi: 'बीमारी'),
            Row(
              children: [
                Expanded(
                  child: BigInput(
                    controller: _conditionCtrl,
                    placeholder: 'e.g. Mild mastitis',
                  ),
                ),
                VoiceInputButton(
                  language: 'hi',
                  onResult: (t) => setState(() => _conditionCtrl.text = t),
                ),
              ],
            ),
            MoreDetails(
              children: [
                const FieldLabel(en: 'Vet name', hi: 'डॉक्टर का नाम'),
                Row(
                  children: [
                    Expanded(
                      child: BigInput(
                        controller: _vetNameCtrl,
                        placeholder: 'e.g. Dr Basavaraj',
                      ),
                    ),
                    VoiceInputButton(
                      language: 'hi',
                      onResult: (t) => setState(() => _vetNameCtrl.text = t),
                    ),
                  ],
                ),
                const FieldLabel(en: 'Vet type', hi: 'प्रकार'),
                ChipsField<String>(
                  options: _vetTypes(l10n),
                  value: _vetType,
                  onChange: (v) => setState(() => _vetType = v),
                ),
                const FieldLabel(en: 'How paid?', hi: 'कैसे चुकाया'),
                ChipsField<String>(
                  options: _payModes(l10n),
                  value: _payMode,
                  onChange: (v) => setState(() => _payMode = v),
                ),
                const SizedBox(height: 6),
                Text(
                  l10n.trtFormalInformalHint,
                  style: const TextStyle(fontSize: 12, color: AppColors.muted),
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Expanded(
                      child: _miniLabeled(
                        l10n.costFormalLabel,
                        BigInput(controller: _costFormalCtrl, numeric: true),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _miniLabeled(
                        l10n.costInformalLabel,
                        BigInput(controller: _costInformalCtrl, numeric: true),
                      ),
                    ),
                  ],
                ),
                const FieldLabel(en: 'Note', hi: 'टिप्पणी'),
                Row(
                  children: [
                    Expanded(
                      child: BigInput(controller: _notesCtrl, placeholder: 'Optional'),
                    ),
                    VoiceInputButton(
                      language: 'hi',
                      onResult: (t) => setState(() => _notesCtrl.text = t),
                    ),
                  ],
                ),
              ],
            ),
          ]),
          SaveButton(
            en: 'Save treatment',
            hi: 'सहेजें',
            onPressed: _save,
            saving: _saving,
          ),
        ],
      ),
    );
  }

  Widget _miniLabeled(String label, Widget child) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Padding(
        padding: const EdgeInsets.only(top: 8, bottom: 4),
        child: Text(
          label,
          style: const TextStyle(
            fontSize: 12,
            color: AppColors.muted,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      child,
    ],
  );

  Widget _card(List<Widget> children) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(AppSpacing.lg),
    margin: const EdgeInsets.only(top: AppSpacing.md),
    decoration: BoxDecoration(
      color: AppColors.card,
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: AppColors.line),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: children,
    ),
  );
}
