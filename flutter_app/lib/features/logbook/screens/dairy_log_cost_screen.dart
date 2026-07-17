import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../design_system/tokens.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../providers/dairy_providers.dart';
import '../widgets/form_kit.dart';

/// Mirrors app/app/dairy-log-cost.tsx exactly, including the
/// amountFormal-defaults-to-full-amount quirk (see save()). Offline-capable
/// via DairyOfflineSync, same as the revenue screen.
class DairyLogCostScreen extends ConsumerStatefulWidget {
  const DairyLogCostScreen({super.key});

  @override
  ConsumerState<DairyLogCostScreen> createState() => _DairyLogCostScreenState();
}

class _DairyLogCostScreenState extends ConsumerState<DairyLogCostScreen> {
  bool _saving = false;
  List<Map> _animals = [];

  String _category = 'FEED';
  String _scope = 'HERD';
  String? _animalId;
  String _eventDate = todayYMD();
  final _qtyCtrl = TextEditingController();
  String _unit = 'kg';
  final _unitPriceCtrl = TextEditingController();
  final _amountCtrl = TextEditingController();
  final _amountFormalCtrl = TextEditingController();
  final _amountInformalCtrl = TextEditingController();
  String _payMode = 'CASH';
  final _vendorCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _qtyCtrl.addListener(_recalc);
    _unitPriceCtrl.addListener(_recalc);
    _loadAnimals();
  }

  @override
  void dispose() {
    for (final c in [
      _qtyCtrl,
      _unitPriceCtrl,
      _amountCtrl,
      _amountFormalCtrl,
      _amountInformalCtrl,
      _vendorCtrl,
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
    final q = double.tryParse(_qtyCtrl.text);
    final p = double.tryParse(_unitPriceCtrl.text);
    if (q != null && p != null) {
      _amountCtrl.text = (q * p).toStringAsFixed(2);
    }
  }

  List<ChoiceOption<String>> _categories(AppLocalizations l10n) => [
    ChoiceOption(value: 'FEED', icon: '🌾', label: l10n.costCatFeed),
    ChoiceOption(value: 'FODDER', icon: '🌿', label: l10n.costCatFodder),
    ChoiceOption(value: 'LABOR', icon: '👷', label: l10n.costCatLabour),
    ChoiceOption(value: 'MEDICINE', icon: '💊', label: l10n.costCatMedicine),
    ChoiceOption(value: 'VET_TREATMENT', icon: '💉', label: l10n.costCatVet),
    ChoiceOption(value: 'VACCINATION', icon: '🩹', label: l10n.costCatVaccine),
    ChoiceOption(value: 'ELECTRICITY', icon: '⚡', label: l10n.costCatElectric),
    ChoiceOption(value: 'WATER', icon: '💧', label: l10n.costCatWater),
    ChoiceOption(value: 'TRANSPORT', icon: '🚚', label: l10n.costCatTransport),
    ChoiceOption(value: 'EQUIPMENT', icon: '🔧', label: l10n.costCatEquipment),
    ChoiceOption(value: 'OTHER', icon: '📦', label: l10n.costCatOther),
  ];

  List<ChoiceOption<String>> _units(AppLocalizations l10n) => [
    ChoiceOption(value: 'kg', label: l10n.costUnitKg),
    ChoiceOption(value: 'bag', label: l10n.costUnitBag),
    ChoiceOption(value: 'litre', label: l10n.costUnitLitre),
    ChoiceOption(value: 'piece', label: l10n.costUnitPiece),
    ChoiceOption(value: 'hour', label: l10n.costUnitHour),
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
    // amountFormal defaults to the FULL amount (not 0) when not entered —
    // matches dairy-log-cost.tsx's save() exactly.
    final amountFormal = _amountFormalCtrl.text.isNotEmpty
        ? double.tryParse(_amountFormalCtrl.text)
        : amt;
    final amountInformal = _amountInformalCtrl.text.isNotEmpty
        ? double.tryParse(_amountInformalCtrl.text)
        : 0;
    final body = <String, dynamic>{
      'eventDate': _eventDate,
      'scope': _scope,
      'category': _category,
      'amount': amt,
      'amountFormal': amountFormal,
      'amountInformal': amountInformal,
      'paymentMode': _payMode,
      'vendorName': _vendorCtrl.text.trim().isEmpty
          ? null
          : _vendorCtrl.text.trim(),
      'notes': _notesCtrl.text.trim().isEmpty ? null : _notesCtrl.text.trim(),
      if (_scope == 'ANIMAL') 'animalId': _animalId,
      if (_qtyCtrl.text.isNotEmpty) 'quantity': double.tryParse(_qtyCtrl.text),
      if (_qtyCtrl.text.isNotEmpty) 'unit': _unit,
      if (_unitPriceCtrl.text.isNotEmpty)
        'unitPrice': double.tryParse(_unitPriceCtrl.text),
    };
    try {
      final res = await ref.read(dairyApiProvider).createCostEvent(body);
      if (res['success'] == true) {
        _showSnack(l10n.costRecorded);
        if (mounted) Navigator.of(context).pop();
      } else {
        _showSnack(res['message'] ?? l10n.commonRetry, error: true);
      }
    } catch (_) {
      await ref
          .read(dairyOfflineSyncProvider)
          .enqueue(kind: 'cost', path: '/livestock/cost-events', payload: body);
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
      appBar: AppBar(title: Text(l10n.homeLogExpense)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(AppSpacing.lg, 0, AppSpacing.lg, 40),
        children: [
          _card([
            const FieldLabel(en: 'What did you spend on?', hi: 'किस पर खर्च?'),
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
          _card([
            const FieldLabel(en: 'How much?', hi: 'कितना?'),
            Row(
              children: [
                Expanded(
                  child: _miniLabeled(
                    l10n.costQuantity,
                    BigInput(
                      controller: _qtyCtrl,
                      placeholder: '12',
                      numeric: true,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _miniLabeled(
                    l10n.costPriceUnit,
                    BigInput(
                      controller: _unitPriceCtrl,
                      placeholder: '32',
                      numeric: true,
                      prefix: '₹',
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            ChipsField<String>(
              options: _units(l10n),
              value: _unit,
              onChange: (v) => setState(() => _unit = v),
            ),
            const FieldLabel(en: 'Total spent', hi: 'कुल खर्च', required: true),
            BigInput(
              controller: _amountCtrl,
              placeholder: '0',
              numeric: true,
              prefix: '₹',
              strong: true,
            ),
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                l10n.costAutoQty,
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
            const FieldLabel(en: 'How paid?', hi: 'कैसे चुकाया'),
            ChipsField<String>(
              options: _payModes(l10n),
              value: _payMode,
              onChange: (v) => setState(() => _payMode = v),
            ),
            MoreDetails(
              children: [
                Text(
                  l10n.costFormalInformalHint,
                  style: const TextStyle(fontSize: 12, color: AppColors.muted),
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Expanded(
                      child: _miniLabeled(
                        l10n.costFormalLabel,
                        BigInput(controller: _amountFormalCtrl, numeric: true),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _miniLabeled(
                        l10n.costInformalLabel,
                        BigInput(
                          controller: _amountInformalCtrl,
                          numeric: true,
                        ),
                      ),
                    ),
                  ],
                ),
                const FieldLabel(en: 'Shop / vendor', hi: 'दुकान'),
                BigInput(
                  controller: _vendorCtrl,
                  placeholder: 'e.g. local agri store',
                ),
                const FieldLabel(en: 'Note', hi: 'टिप्पणी'),
                BigInput(controller: _notesCtrl, placeholder: 'Optional'),
              ],
            ),
          ]),
          SaveButton(
            en: 'Save expense',
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
