import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../design_system/tokens.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../providers/dairy_providers.dart';
import '../widgets/form_kit.dart';
import '../widgets/voice_input_button.dart';

/// Mirrors app/app/dairy-breeding.tsx exactly — the only dairy screen with
/// voice input, on exactly 2 fields (bull id/owner, conditional on Natural
/// service; service provider, always shown), both hi-locale mic buttons.
class DairyBreedingScreen extends ConsumerStatefulWidget {
  const DairyBreedingScreen({super.key});

  @override
  ConsumerState<DairyBreedingScreen> createState() =>
      _DairyBreedingScreenState();
}

class _DairyBreedingScreenState extends ConsumerState<DairyBreedingScreen> {
  bool _saving = false;
  List<Map> _femaleAnimals = [];

  String? _animalId;
  String _serviceType = 'AI';
  String _aiDate = todayYMD();
  final _bullCodeCtrl = TextEditingController();
  final _breedUsedCtrl = TextEditingController();
  final _providerCtrl = TextEditingController();
  String _providerType = 'COOP_INSEMINATOR';
  final _serviceChargeCtrl = TextEditingController();
  final _transportCtrl = TextEditingController();
  final _gratuityCtrl = TextEditingController();
  final _costFormalCtrl = TextEditingController();
  final _costInformalCtrl = TextEditingController();
  String _payMode = 'CASH';
  final _notesCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadAnimals();
  }

  @override
  void dispose() {
    for (final c in [
      _bullCodeCtrl,
      _breedUsedCtrl,
      _providerCtrl,
      _serviceChargeCtrl,
      _transportCtrl,
      _gratuityCtrl,
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
      if (res['success'] == true) {
        setState(
          () => _femaleAnimals = List<Map>.from(
            res['data'] ?? [],
          ).where((a) => a['gender'] == 'FEMALE').toList(),
        );
      }
    } catch (_) {}
  }

  List<ChoiceOption<String>> _providerTypes(AppLocalizations l10n) => [
    ChoiceOption(value: 'GOVT_VET', label: l10n.brdPtypeGovtVet),
    ChoiceOption(value: 'PRIVATE_VET', label: l10n.brdPtypePrivateVet),
    ChoiceOption(
      value: 'COOP_INSEMINATOR',
      label: l10n.brdPtypeCoopInseminator,
    ),
    ChoiceOption(value: 'SELF', label: l10n.brdPtypeSelf),
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
    if (_animalId == null) {
      _showSnack(l10n.brdSelectAnimal, error: true);
      return;
    }
    setState(() => _saving = true);
    final body = <String, dynamic>{
      'animalId': _animalId,
      'serviceType': _serviceType,
      'aiDate': _aiDate,
      'bullCode': _bullCodeCtrl.text.trim().isEmpty
          ? null
          : _bullCodeCtrl.text.trim(),
      'breedUsed': _breedUsedCtrl.text.trim().isEmpty
          ? null
          : _breedUsedCtrl.text.trim(),
      'serviceProvider': _providerCtrl.text.trim().isEmpty
          ? null
          : _providerCtrl.text.trim(),
      'serviceProviderType': _providerType,
      'serviceCharge': double.tryParse(_serviceChargeCtrl.text) ?? 0,
      'transportCost': double.tryParse(_transportCtrl.text) ?? 0,
      'gratuityCost': double.tryParse(_gratuityCtrl.text) ?? 0,
      'costFormal': double.tryParse(_costFormalCtrl.text) ?? 0,
      'costInformal': double.tryParse(_costInformalCtrl.text) ?? 0,
      'paymentMode': _payMode,
      'notes': _notesCtrl.text.trim().isEmpty ? null : _notesCtrl.text.trim(),
    };
    try {
      final res = await ref.read(dairyApiProvider).createBreedingEvent(body);
      if (res['success'] == true) {
        _showSnack(l10n.brdLogged);
        if (mounted) Navigator.of(context).pop();
      } else {
        _showSnack(res['message'] ?? l10n.commonRetry, error: true);
      }
    } catch (_) {
      await ref
          .read(dairyOfflineSyncProvider)
          .enqueue(
            kind: 'breeding',
            path: '/livestock/breeding',
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
      appBar: AppBar(title: Text(l10n.dairyLogActBreeding)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(AppSpacing.lg, 0, AppSpacing.lg, 40),
        children: [
          _card([
            const FieldLabel(
              en: 'Which animal?',
              hi: 'कौन सा पशु?',
              required: true,
            ),
            ChipsField<String>(
              options: [
                for (final a in _femaleAnimals)
                  ChoiceOption(
                    value: a['animal_uuid'] as String,
                    label: (a['name'] ?? a['tag_number'] ?? '').toString(),
                  ),
              ],
              value: _animalId,
              onChange: (v) => setState(() => _animalId = v),
            ),
          ]),
          _card([
            const FieldLabel(en: 'Service', hi: 'प्रजनन'),
            ChoiceGrid<String>(
              options: [
                ChoiceOption(value: 'AI', icon: '🧪', label: l10n.brdSvcAi),
                ChoiceOption(
                  value: 'NATURAL_SERVICE',
                  icon: '🐂',
                  label: l10n.brdSvcNatural,
                ),
              ],
              value: _serviceType,
              onChange: (v) => setState(() => _serviceType = v),
            ),
            const FieldLabel(en: 'When?', hi: 'कब?'),
            DateField(
              value: _aiDate,
              onChange: (v) => setState(() => _aiDate = v),
            ),
            if (_serviceType == 'NATURAL_SERVICE') ...[
              const FieldLabel(en: 'Bull id / owner', hi: 'सांड / मालिक'),
              Row(
                children: [
                  Expanded(child: BigInput(controller: _bullCodeCtrl)),
                  VoiceInputButton(
                    language: 'hi',
                    onResult: (t) => setState(() => _bullCodeCtrl.text = t),
                  ),
                ],
              ),
            ] else ...[
              const FieldLabel(en: 'Bull code / semen', hi: 'सांड कोड'),
              BigInput(controller: _bullCodeCtrl),
              const FieldLabel(en: 'Breed used', hi: 'नस्ल'),
              BigInput(controller: _breedUsedCtrl),
            ],
          ]),
          _card([
            const FieldLabel(en: 'Costs', hi: 'लागत'),
            Row(
              children: [
                Expanded(
                  child: _miniLabeled(
                    l10n.brdServiceCharge,
                    BigInput(
                      controller: _serviceChargeCtrl,
                      placeholder: '250',
                      numeric: true,
                      prefix: '₹',
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _miniLabeled(
                    l10n.brdTransport,
                    BigInput(
                      controller: _transportCtrl,
                      placeholder: '50',
                      numeric: true,
                      prefix: '₹',
                    ),
                  ),
                ),
              ],
            ),
            const FieldLabel(en: 'Gratuity / tip', hi: 'इनाम'),
            BigInput(
              controller: _gratuityCtrl,
              placeholder: '100',
              numeric: true,
              prefix: '₹',
            ),
          ]),
          _card([
            const FieldLabel(en: 'Service provider', hi: 'प्रदाता'),
            Row(
              children: [
                Expanded(
                  child: BigInput(
                    controller: _providerCtrl,
                    placeholder: 'e.g. KMF Cooperative',
                  ),
                ),
                VoiceInputButton(
                  language: 'hi',
                  onResult: (t) => setState(() => _providerCtrl.text = t),
                ),
              ],
            ),
            const FieldLabel(en: 'Provider type', hi: 'प्रकार'),
            ChipsField<String>(
              options: _providerTypes(l10n),
              value: _providerType,
              onChange: (v) => setState(() => _providerType = v),
            ),
            MoreDetails(
              children: [
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
                BigInput(controller: _notesCtrl, placeholder: 'Optional'),
              ],
            ),
          ]),
          SaveButton(
            en: 'Save breeding',
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
