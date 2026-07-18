import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../design_system/tokens.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../providers/dairy_providers.dart';
import '../widgets/form_kit.dart';
import '../widgets/voice_input_button.dart';

/// Mirrors app/app/dairy-log-revenue.tsx exactly. Writes go through
/// DairyOfflineSync so "Log Milk" works with no signal (CLAUDE.md
/// Convention 26) — queued locally, retried against the real
/// POST /livestock/revenue-events endpoint once connectivity returns.
class DairyLogRevenueScreen extends ConsumerStatefulWidget {
  const DairyLogRevenueScreen({super.key});

  @override
  ConsumerState<DairyLogRevenueScreen> createState() =>
      _DairyLogRevenueScreenState();
}

class _DairyLogRevenueScreenState extends ConsumerState<DairyLogRevenueScreen> {
  bool _saving = false;
  List<Map> _animals = [];

  String _category = 'MILK_SALE_COOP';
  String _scope = 'HERD';
  String? _animalId;
  String _eventDate = todayYMD();
  final _litersCtrl = TextEditingController();
  final _fatCtrl = TextEditingController();
  final _snfCtrl = TextEditingController();
  final _rateCtrl = TextEditingController();
  final _amountCtrl = TextEditingController();
  final _payerCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();

  bool get _isMilk =>
      _category == 'MILK_SALE_COOP' || _category == 'MILK_SALE_DIRECT';

  @override
  void initState() {
    super.initState();
    _litersCtrl.addListener(_recalc);
    _rateCtrl.addListener(_recalc);
    _loadAnimals();
  }

  @override
  void dispose() {
    for (final c in [
      _litersCtrl,
      _fatCtrl,
      _snfCtrl,
      _rateCtrl,
      _amountCtrl,
      _payerCtrl,
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

  void _recalc() {
    if (!_isMilk) return;
    final l = double.tryParse(_litersCtrl.text);
    final r = double.tryParse(_rateCtrl.text);
    if (l != null && r != null) {
      _amountCtrl.text = (l * r).toStringAsFixed(2);
    }
  }

  List<ChoiceOption<String>> _categories(AppLocalizations l10n) => [
    ChoiceOption(
      value: 'MILK_SALE_COOP',
      icon: '🥛',
      label: l10n.revCatMilkCoop,
    ),
    ChoiceOption(
      value: 'MILK_SALE_DIRECT',
      icon: '🏠',
      label: l10n.revCatMilkDirect,
    ),
    ChoiceOption(value: 'ANIMAL_SALE', icon: '🐄', label: l10n.revCatAnimal),
    ChoiceOption(value: 'CALF_SALE', icon: '🐂', label: l10n.revCatCalf),
    ChoiceOption(value: 'MANURE_SALE', icon: '♻️', label: l10n.revCatManure),
    ChoiceOption(value: 'SUBSIDY', icon: '🏛️', label: l10n.revCatSubsidy),
    ChoiceOption(
      value: 'INSURANCE_PAYOUT',
      icon: '🛡️',
      label: l10n.revCatInsurance,
    ),
    ChoiceOption(value: 'OTHER', icon: '📦', label: l10n.revCatOther),
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
    final amt = double.tryParse(_amountCtrl.text);
    if (amt == null || amt <= 0) {
      _showSnack(l10n.commonEnterAmount, error: true);
      return;
    }
    if (_scope == 'ANIMAL' && _animalId == null) {
      _showSnack(l10n.commonPickAnimal, error: true);
      return;
    }
    setState(() => _saving = true);
    final body = <String, dynamic>{
      'eventDate': _eventDate,
      'scope': _scope,
      'category': _category,
      'amount': amt,
      'payerName': _payerCtrl.text.trim().isEmpty
          ? null
          : _payerCtrl.text.trim(),
      'notes': _notesCtrl.text.trim().isEmpty ? null : _notesCtrl.text.trim(),
      if (_scope == 'ANIMAL') 'animalId': _animalId,
      if (_isMilk && _litersCtrl.text.isNotEmpty)
        'quantityLiters': double.tryParse(_litersCtrl.text),
      if (_isMilk && _fatCtrl.text.isNotEmpty)
        'fatPct': double.tryParse(_fatCtrl.text),
      if (_isMilk && _snfCtrl.text.isNotEmpty)
        'snfPct': double.tryParse(_snfCtrl.text),
      if (_isMilk && _rateCtrl.text.isNotEmpty)
        'ratePerLiter': double.tryParse(_rateCtrl.text),
    };
    try {
      final res = await ref.read(dairyApiProvider).createRevenueEvent(body);
      if (res['success'] == true) {
        _showSnack(l10n.revRecorded);
        if (mounted) Navigator.of(context).pop();
      } else {
        _showSnack(res['message'] ?? l10n.commonRetry, error: true);
      }
    } catch (_) {
      await ref
          .read(dairyOfflineSyncProvider)
          .enqueue(
            kind: 'revenue',
            path: '/livestock/revenue-events',
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
      appBar: AppBar(title: Text(l10n.homeLogMilk)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(AppSpacing.lg, 0, AppSpacing.lg, 40),
        children: [
          _card([
            const FieldLabel(en: 'What did you sell?', hi: 'आपने क्या बेचा?'),
            ChoiceGrid<String>(
              options: _categories(l10n),
              value: _category,
              onChange: (v) => setState(() => _category = v),
            ),
          ]),
          _card([
            const FieldLabel(en: 'When?', hi: 'कब?'),
            DateField(
              value: _eventDate,
              onChange: (v) => setState(() => _eventDate = v),
            ),
          ]),
          if (_isMilk)
            _card([
              const FieldLabel(en: 'Milk sold', hi: 'दूध बेचा'),
              Row(
                children: [
                  Expanded(
                    child: _miniLabeled(
                      l10n.revLitres,
                      BigInput(
                        controller: _litersCtrl,
                        placeholder: '12',
                        numeric: true,
                        suffix: 'L',
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _miniLabeled(
                      l10n.revRate,
                      BigInput(
                        controller: _rateCtrl,
                        placeholder: '40',
                        numeric: true,
                        prefix: '₹',
                      ),
                    ),
                  ),
                ],
              ),
            ]),
          _card([
            const FieldLabel(
              en: 'Amount received',
              hi: 'मिली राशि',
              required: true,
            ),
            BigInput(
              controller: _amountCtrl,
              placeholder: '0',
              numeric: true,
              prefix: '₹',
              strong: true,
            ),
            if (_isMilk)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  l10n.revAutoMilk,
                  style: const TextStyle(fontSize: 12, color: AppColors.muted),
                ),
              ),
            const FieldLabel(en: 'For', hi: 'किसके लिए'),
            ChipsField<String>(
              options: [
                ChoiceOption(value: 'HERD', label: l10n.commonWholeHerd),
                ChoiceOption(value: 'ANIMAL', label: l10n.commonOneAnimal),
              ],
              value: _scope,
              onChange: (v) => setState(() {
                _scope = v;
                if (v == 'HERD') _animalId = null;
              }),
            ),
            if (_scope == 'ANIMAL')
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: ChipsField<String>(
                  options: [
                    for (final a in _animals)
                      ChoiceOption(
                        value: a['animal_uuid'] as String,
                        label: (a['name'] ?? a['tag_number'] ?? '').toString(),
                      ),
                  ],
                  value: _animalId,
                  onChange: (v) => setState(() => _animalId = v),
                ),
              ),
          ]),
          _card([
            MoreDetails(
              children: [
                if (_isMilk)
                  Row(
                    children: [
                      Expanded(
                        child: _miniLabeled(
                          'Fat %',
                          BigInput(
                            controller: _fatCtrl,
                            placeholder: '6.5',
                            numeric: true,
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: _miniLabeled(
                          'SNF %',
                          BigInput(
                            controller: _snfCtrl,
                            placeholder: '9.0',
                            numeric: true,
                          ),
                        ),
                      ),
                    ],
                  ),
                const FieldLabel(en: 'Paid by', hi: 'किसने दिया'),
                Row(
                  children: [
                    Expanded(
                      child: BigInput(
                        controller: _payerCtrl,
                        placeholder: 'e.g. Society / trader',
                      ),
                    ),
                    VoiceInputButton(
                      language: 'hi',
                      onResult: (t) => setState(() => _payerCtrl.text = t),
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
            en: 'Save earning',
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
