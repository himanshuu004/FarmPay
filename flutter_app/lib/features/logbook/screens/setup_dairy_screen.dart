import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../design_system/tokens.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../providers/dairy_providers.dart';
import '../widgets/form_kit.dart';

/// Mirrors app/app/setup-dairy.tsx — aggregate herd counts (cows/buffaloes/
/// mixed + avg daily milk), reconciled server-side into individual
/// DairyAnimal rows. The GET /livestock/herd/summary prefill call 404s in
/// the real backend (no matching route) — replicated faithfully (edit mode
/// always shows the zeroed defaults) rather than silently patched, per the
/// RN-parity audit.
class SetupDairyScreen extends ConsumerStatefulWidget {
  const SetupDairyScreen({super.key, this.editMode = false});

  final bool editMode;

  @override
  ConsumerState<SetupDairyScreen> createState() => _SetupDairyScreenState();
}

class _SetupDairyScreenState extends ConsumerState<SetupDairyScreen> {
  bool _saving = false;
  int _cows = 0;
  int _buffaloes = 0;
  int _mixed = 0;
  int _avgDailyMilkLiters = 10;

  @override
  void initState() {
    super.initState();
    _prefill();
  }

  Future<void> _prefill() async {
    final r = await ref.read(dairyApiProvider).getHerdSummary();
    final data = r?['data'];
    if (data != null && data['counts'] != null) {
      setState(() {
        _cows = data['counts']['cows'] ?? 0;
        _buffaloes = data['counts']['buffaloes'] ?? 0;
        _mixed = data['counts']['mixed'] ?? 0;
        _avgDailyMilkLiters = data['avgDailyMilkLiters'] ?? 10;
      });
    }
  }

  int get _total => _cows + _buffaloes + _mixed;

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
    if (_total == 0) {
      _showSnack(l10n.dairySetupNeedOneMsg, error: true);
      return;
    }
    setState(() => _saving = true);
    try {
      final res = await ref.read(dairyApiProvider).saveAggregateHerd({
        'cows': _cows,
        'buffaloes': _buffaloes,
        'mixed': _mixed,
        'avgDailyMilkLiters': _avgDailyMilkLiters,
      });
      if (res['success'] == true) {
        if (mounted) _showSavedDialog(l10n);
      } else {
        _showSnack(
          res['message'] ?? l10n.dairySetupPleaseTryAgain,
          error: true,
        );
      }
    } catch (_) {
      _showSnack(l10n.dairySetupPleaseTryAgain, error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _showSavedDialog(AppLocalizations l10n) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.dairySetupSavedTitle),
        content: Text(l10n.dairySetupSavedMsg),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              context.go('/activity-dairy');
            },
            child: Text(l10n.dairySetupBackHome),
          ),
          TextButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              context.go('/activity-dairy');
            },
            child: Text(l10n.dairySetupContinueSetup),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(
          widget.editMode ? l10n.dairySetupEditTitle : l10n.dairySetupNewTitle,
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.lg,
          AppSpacing.lg,
          AppSpacing.lg,
          40,
        ),
        children: [
          Text(
            widget.editMode ? l10n.dairySetupEditSub : l10n.dairySetupNewSub,
            style: const TextStyle(color: AppColors.muted),
          ),
          const SizedBox(height: AppSpacing.md),
          _card([
            const FieldLabel(en: 'Cows', hi: 'गाय · संख्या'),
            _stepper(_cows, 99, (v) => setState(() => _cows = v)),
            const FieldLabel(en: 'Buffaloes', hi: 'भैंस · संख्या'),
            _stepper(_buffaloes, 99, (v) => setState(() => _buffaloes = v)),
            const FieldLabel(en: 'Mixed / other', hi: 'अन्य पशु'),
            _stepper(_mixed, 99, (v) => setState(() => _mixed = v)),
          ]),
          _card([
            const FieldLabel(
              en: 'Avg daily milk (litres)',
              hi: 'औसत दूध · लीटर',
            ),
            _stepper(
              _avgDailyMilkLiters,
              500,
              (v) => setState(() => _avgDailyMilkLiters = v),
            ),
          ]),
          Container(
            padding: const EdgeInsets.all(AppSpacing.md),
            margin: const EdgeInsets.only(bottom: AppSpacing.md),
            decoration: BoxDecoration(
              color: AppColors.accent,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  l10n.dairySetupTotal,
                  style: const TextStyle(
                    fontWeight: FontWeight.w600,
                    color: AppColors.brandDark,
                  ),
                ),
                Text(
                  '$_total',
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                    color: AppColors.brandDark,
                  ),
                ),
              ],
            ),
          ),
          SaveButton(
            en: widget.editMode ? 'Save changes' : 'Save & lock',
            hi: 'सहेजें',
            onPressed: _save,
            saving: _saving,
            disabled: _total == 0,
          ),
          if (!widget.editMode)
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.sm),
              child: Text(
                l10n.dairySetupHint,
                style: const TextStyle(fontSize: 12, color: AppColors.muted),
              ),
            ),
        ],
      ),
    );
  }

  Widget _stepper(int value, int max, ValueChanged<int> onChanged) {
    return Row(
      children: [
        _stepBtn('−', value > 0, () => onChanged(value - 1)),
        Expanded(
          child: Center(
            child: Text(
              '$value',
              style: const TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.w800,
                color: AppColors.brandDark,
              ),
            ),
          ),
        ),
        _stepBtn('+', value < max, () => onChanged(value + 1)),
      ],
    );
  }

  Widget _stepBtn(String glyph, bool enabled, VoidCallback onTap) => InkWell(
    borderRadius: BorderRadius.circular(12),
    onTap: enabled ? onTap : null,
    child: Opacity(
      opacity: enabled ? 1 : 0.35,
      child: Container(
        width: 52,
        height: 52,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFFDDDDDD), width: 1.5),
          color: Colors.white,
        ),
        child: Text(
          glyph,
          style: const TextStyle(
            fontSize: 26,
            fontWeight: FontWeight.w700,
            color: AppColors.brandDark,
          ),
        ),
      ),
    ),
  );

  Widget _card(List<Widget> children) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(AppSpacing.lg),
    margin: const EdgeInsets.only(bottom: AppSpacing.md),
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
