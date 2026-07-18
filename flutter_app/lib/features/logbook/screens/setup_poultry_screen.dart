import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../design_system/tokens.dart';
import '../../../design_system/widgets/app_card.dart';
import '../../../design_system/widgets/quantity_stepper.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../providers/dairy_providers.dart';
import '../widgets/form_kit.dart';

/// Mirrors app/app/setup-poultry.tsx — aggregate flock form: broilers/
/// layers/native steppers, plus a collapsible "big flock" typed-count
/// entry for large numbers. Same notes-field PATCH workaround as
/// setup-goatery (no dedicated poultry aggregate endpoint exists yet).
class SetupPoultryScreen extends ConsumerStatefulWidget {
  const SetupPoultryScreen({super.key, this.editMode = false});

  final bool editMode;

  @override
  ConsumerState<SetupPoultryScreen> createState() => _SetupPoultryScreenState();
}

class _SetupPoultryScreenState extends ConsumerState<SetupPoultryScreen> {
  bool _saving = false;
  int _broilers = 0;
  int _layers = 0;
  int _native = 0;
  final _broilersCtrl = TextEditingController();
  final _layersCtrl = TextEditingController();

  int get _total => _broilers + _layers + _native;

  @override
  void initState() {
    super.initState();
    _broilersCtrl.addListener(() {
      final v = int.tryParse(_broilersCtrl.text) ?? 0;
      if (v != _broilers) setState(() => _broilers = v);
    });
    _layersCtrl.addListener(() {
      final v = int.tryParse(_layersCtrl.text) ?? 0;
      if (v != _layers) setState(() => _layers = v);
    });
  }

  @override
  void dispose() {
    _broilersCtrl.dispose();
    _layersCtrl.dispose();
    super.dispose();
  }

  void _showSnack(String message, {bool error = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: error ? AppColors.danger : null),
    );
  }

  void _setBroilers(int v) {
    setState(() {
      _broilers = v;
      _broilersCtrl.text = v == 0 ? '' : '$v';
    });
  }

  void _setLayers(int v) {
    setState(() {
      _layers = v;
      _layersCtrl.text = v == 0 ? '' : '$v';
    });
  }

  Future<void> _save() async {
    final l10n = AppLocalizations.of(context);
    if (_total == 0) {
      _showSnack(l10n.dairyPsetupNeedOneMsg, error: true);
      return;
    }
    setState(() => _saving = true);
    try {
      final api = ref.read(dairyApiProvider);
      final list = await api.listActivitySubscriptions();
      final items = List<Map>.from(list['data']?['items'] ?? []);
      final matches = items.where((s) => s['activityCode'] == 'POULTRY');
      final poultry = matches.isEmpty ? null : matches.first;
      if (poultry == null) {
        _showSnack(l10n.dairyPsetupNoSubMsg, error: true);
        return;
      }
      final notes = 'broilers=$_broilers, layers=$_layers, native=$_native, total=$_total';
      final r = await api.patchActivitySubscription(
        poultry['subscriptionId'].toString(),
        {'isSetupComplete': true, 'notes': notes},
      );
      if (r['success'] == true) {
        if (mounted) _showSnack(l10n.dairyPsetupSavedMsg);
        if (mounted) context.replace('/activity-dairy');
      } else if (mounted) {
        _showSnack((r['message'] ?? l10n.dairySetupPleaseTryAgain).toString(), error: true);
      }
    } catch (_) {
      if (mounted) _showSnack(l10n.dairySetupPleaseTryAgain, error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(widget.editMode ? l10n.dairyPsetupEditTitle : l10n.dairyPsetupNewTitle)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.lg, AppSpacing.lg, 40),
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              const Text('🐔', style: TextStyle(fontSize: 36)),
              const SizedBox(width: 12),
              Expanded(
                child: Text(l10n.dairyPsetupSub, style: const TextStyle(fontSize: 13, color: AppColors.muted, height: 1.3)),
              ),
            ],
          ),
          const SizedBox(height: 16),
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const FieldLabel(en: 'Broilers', hi: 'मुर्गी (ब्रॉयलर)'),
                Align(alignment: Alignment.centerLeft, child: QuantityStepper(value: _broilers, onChanged: _setBroilers)),
                const FieldLabel(en: 'Layers', hi: 'मुर्गी (अंडा)'),
                Align(alignment: Alignment.centerLeft, child: QuantityStepper(value: _layers, onChanged: _setLayers)),
                MoreDetails(
                  label: l10n.dairyPsetupBigFlock,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(l10n.dairyPsetupBroilersCount, style: const TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w600)),
                              const SizedBox(height: 4),
                              BigInput(
                                controller: _broilersCtrl,
                                placeholder: '0',
                                numeric: true,
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(l10n.dairyPsetupLayersCount, style: const TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w600)),
                              const SizedBox(height: 4),
                              BigInput(
                                controller: _layersCtrl,
                                placeholder: '0',
                                numeric: true,
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
                const FieldLabel(en: 'Native / desi', hi: 'देसी मुर्गी'),
                Align(alignment: Alignment.centerLeft, child: QuantityStepper(value: _native, onChanged: (v) => setState(() => _native = v))),
              ],
            ),
          ),
          AppCard(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(l10n.dairyPsetupTotal, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Color(0xFFE65100))),
                Text('$_total', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: Color(0xFFBF360C))),
              ],
            ),
          ),
          const SizedBox(height: 8),
          SaveButton(
            en: widget.editMode ? 'Save changes' : 'Save & lock',
            hi: 'सहेजें',
            onPressed: _save,
            saving: _saving,
            disabled: _total == 0,
          ),
        ],
      ),
    );
  }
}
