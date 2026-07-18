import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../design_system/tokens.dart';
import '../../../design_system/widgets/app_card.dart';
import '../../../design_system/widgets/quantity_stepper.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../providers/dairy_providers.dart';
import '../widgets/form_kit.dart';

/// Mirrors app/app/setup-goatery.tsx — aggregate herd form for goats +
/// sheep. No dedicated goatery endpoint exists (RN's own v1 stub note);
/// flips isSetupComplete on the GOATERY activity subscription via PATCH
/// and stores counts in `notes` as the same documented workaround.
class SetupGoateryScreen extends ConsumerStatefulWidget {
  const SetupGoateryScreen({super.key, this.editMode = false});

  final bool editMode;

  @override
  ConsumerState<SetupGoateryScreen> createState() => _SetupGoateryScreenState();
}

class _SetupGoateryScreenState extends ConsumerState<SetupGoateryScreen> {
  bool _saving = false;
  int _stallFed = 0;
  int _grazing = 0;
  int _sheep = 0;

  int get _total => _stallFed + _grazing + _sheep;

  void _showSnack(String message, {bool error = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: error ? AppColors.danger : null),
    );
  }

  Future<void> _save() async {
    final l10n = AppLocalizations.of(context);
    if (_total == 0) {
      _showSnack(l10n.dairyGsetupNeedOneMsg, error: true);
      return;
    }
    setState(() => _saving = true);
    try {
      final api = ref.read(dairyApiProvider);
      final list = await api.listActivitySubscriptions();
      final items = List<Map>.from(list['data']?['items'] ?? []);
      final matches = items.where((s) => s['activityCode'] == 'GOATERY');
      final goatery = matches.isEmpty ? null : matches.first;
      if (goatery == null) {
        _showSnack(l10n.dairyGsetupNoSubMsg, error: true);
        return;
      }
      final notes = 'stall_fed=$_stallFed, grazing=$_grazing, sheep=$_sheep, total=$_total';
      final r = await api.patchActivitySubscription(
        goatery['subscriptionId'].toString(),
        {'isSetupComplete': true, 'notes': notes},
      );
      if (r['success'] == true) {
        if (mounted) _showSnack(l10n.dairyGsetupSavedMsg);
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
      appBar: AppBar(title: Text(widget.editMode ? l10n.dairySetupEditTitle : l10n.dairySetupNewTitle)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.lg, AppSpacing.lg, 40),
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              const Text('🐐', style: TextStyle(fontSize: 36)),
              const SizedBox(width: 12),
              Expanded(
                child: Text(l10n.dairyGsetupSub, style: const TextStyle(fontSize: 13, color: AppColors.muted, height: 1.3)),
              ),
            ],
          ),
          const SizedBox(height: 16),
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const FieldLabel(en: 'Stall-fed goats', hi: 'बकरी (बंधी)'),
                Align(alignment: Alignment.centerLeft, child: QuantityStepper(value: _stallFed, onChanged: (v) => setState(() => _stallFed = v))),
                const FieldLabel(en: 'Grazing goats', hi: 'बकरी (चराई)'),
                Align(alignment: Alignment.centerLeft, child: QuantityStepper(value: _grazing, onChanged: (v) => setState(() => _grazing = v))),
                const FieldLabel(en: 'Sheep', hi: 'भेड़ · संख्या'),
                Align(alignment: Alignment.centerLeft, child: QuantityStepper(value: _sheep, onChanged: (v) => setState(() => _sheep = v))),
              ],
            ),
          ),
          AppCard(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(l10n.dairyGsetupTotal, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Color(0xFF6A1B9A))),
                Text('$_total', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: Color(0xFF4A148C))),
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
