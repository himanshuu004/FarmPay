import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../design_system/tokens.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../providers/dairy_providers.dart';
import '../widgets/form_kit.dart';

/// Mirrors app/app/dairy-onboarding.tsx — herd tier + payment mode +
/// cooperative details. Prefills from GET /livestock/profile (snake_case
/// fields), saves via POST /livestock/profile.
class DairyOnboardingScreen extends ConsumerStatefulWidget {
  const DairyOnboardingScreen({super.key});

  @override
  ConsumerState<DairyOnboardingScreen> createState() =>
      _DairyOnboardingScreenState();
}

class _DairyOnboardingScreenState extends ConsumerState<DairyOnboardingScreen> {
  bool _saving = false;
  String _tier = 'SMALL';
  final _coopNameCtrl = TextEditingController();
  final _coopMemberIdCtrl = TextEditingController();
  String _payMode = 'CASH';
  int _expectedCount = 0;

  @override
  void initState() {
    super.initState();
    _prefill();
  }

  @override
  void dispose() {
    _coopNameCtrl.dispose();
    _coopMemberIdCtrl.dispose();
    super.dispose();
  }

  Future<void> _prefill() async {
    try {
      final res = await ref.read(dairyApiProvider).getProfile();
      if (res['success'] == true && res['data'] != null) {
        final p = res['data'];
        setState(() {
          _tier = p['herd_tier'] ?? 'SMALL';
          _coopNameCtrl.text = p['cooperative_name'] ?? '';
          _coopMemberIdCtrl.text = p['cooperative_member_id'] ?? '';
          _payMode = p['default_payment_mode'] ?? 'CASH';
        });
      }
    } catch (_) {}
  }

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
    try {
      final res = await ref.read(dairyApiProvider).upsertProfile({
        'herdTier': _tier,
        'cooperativeName': _coopNameCtrl.text.trim().isEmpty
            ? null
            : _coopNameCtrl.text.trim(),
        'cooperativeMemberId': _coopMemberIdCtrl.text.trim().isEmpty
            ? null
            : _coopMemberIdCtrl.text.trim(),
        'defaultPaymentMode': _payMode,
        'currency': 'INR',
        if (_expectedCount > 0) 'expectedAnimalCount': _expectedCount,
      });
      if (res['success'] == true) {
        if (mounted) context.go('/dairy-logbook');
      } else {
        _showSnack(res['message'] ?? l10n.dairyOnbSaveFailed, error: true);
      }
    } catch (_) {
      _showSnack(l10n.dairyOnbNetworkError, error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.dairyOnbTitle)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.lg,
          AppSpacing.lg,
          AppSpacing.lg,
          40,
        ),
        children: [
          _card([
            const FieldLabel(en: 'Herd size', hi: 'झुंड का आकार'),
            ChoiceGrid<String>(
              options: [
                ChoiceOption(
                  value: 'SMALL',
                  icon: '🐄',
                  label: l10n.dairyOnbTierSmall,
                ),
                ChoiceOption(
                  value: 'MEDIUM',
                  icon: '🐄🐄',
                  label: l10n.dairyOnbTierMedium,
                ),
                ChoiceOption(
                  value: 'LARGE',
                  icon: '🐄🐄🐄',
                  label: l10n.dairyOnbTierLarge,
                ),
              ],
              value: _tier,
              onChange: (v) => setState(() => _tier = v),
            ),
          ]),
          _card([
            const FieldLabel(en: 'Default payment mode', hi: 'भुगतान विधि'),
            ChipsField<String>(
              options: [
                ChoiceOption(value: 'CASH', label: l10n.dairyOnbPayCash),
                ChoiceOption(value: 'UPI', label: l10n.dairyOnbPayUpi),
                ChoiceOption(value: 'BANK', label: l10n.dairyOnbPayBank),
                ChoiceOption(value: 'CREDIT', label: l10n.dairyOnbPayCredit),
              ],
              value: _payMode,
              onChange: (v) => setState(() => _payMode = v),
            ),
          ]),
          _card([
            MoreDetails(
              label: l10n.dairyOnbCoopCount,
              children: [
                const FieldLabel(en: 'Expected animal count', hi: 'पशु संख्या'),
                _Stepper(
                  value: _expectedCount,
                  min: 0,
                  max: 500,
                  onChanged: (v) => setState(() => _expectedCount = v),
                ),
                const FieldLabel(en: 'Cooperative name', hi: 'सहकारी नाम'),
                BigInput(
                  controller: _coopNameCtrl,
                  placeholder: 'e.g. KMF Bangalore Dairy Union',
                ),
                const FieldLabel(en: 'Member ID', hi: 'सदस्य आईडी'),
                BigInput(
                  controller: _coopMemberIdCtrl,
                  placeholder: 'e.g. KMF-BLR-44821',
                ),
              ],
            ),
          ]),
          SaveButton(
            en: 'Save & Continue',
            hi: 'सहेजें',
            onPressed: _save,
            saving: _saving,
          ),
          Center(
            child: TextButton(
              onPressed: () => context.pop(),
              child: Text(
                l10n.commonCancel,
                style: const TextStyle(color: AppColors.muted, fontSize: 13),
              ),
            ),
          ),
        ],
      ),
    );
  }

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

class _Stepper extends StatelessWidget {
  const _Stepper({
    required this.value,
    required this.min,
    required this.max,
    required this.onChanged,
  });
  final int value;
  final int min;
  final int max;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        _btn('−', value > min, () => onChanged(value - 1)),
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
        _btn('+', value < max, () => onChanged(value + 1)),
      ],
    );
  }

  Widget _btn(String glyph, bool enabled, VoidCallback onTap) => InkWell(
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
}
