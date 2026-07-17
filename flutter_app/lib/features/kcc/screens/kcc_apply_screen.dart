import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/api_response.dart';
import '../../../core/providers/core_providers.dart';
import '../../../design_system/tokens.dart';
import '../../../design_system/widgets/app_card.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../../coop/providers/coop_providers.dart';
import '../../logbook/widgets/form_kit.dart';
import '../providers/kcc_providers.dart';

const _kycDocs = [
  ('aadhaar', 'aadhaar'),
  ('pan', 'pan'),
  ('land', 'land'),
  ('photo', 'photo'),
];

/// KCC Dairy application form — the farmer-authored step of the
/// society-mediated workflow. Mirrors app/app/kcc-apply.tsx: animals live
/// from the register, KYC checklist, DBT bank account, milk-union tie-up,
/// repayment support. The society/bank VERIFY these; the app only captures
/// them (Convention: society membership is a precondition to apply).
class KccApplyScreen extends ConsumerStatefulWidget {
  const KccApplyScreen({super.key, this.chosenAnimalUuids = const []});

  final List<String> chosenAnimalUuids;

  @override
  ConsumerState<KccApplyScreen> createState() => _KccApplyScreenState();
}

class _KccApplyScreenState extends ConsumerState<KccApplyScreen> {
  bool _loading = true;
  bool _busy = false;
  bool? _member;
  int _animalsCount = 0;
  Map? _preview;

  final _bankCtrl = TextEditingController();
  final Map<String, bool> _kyc = {
    'aadhaar': false,
    'pan': false,
    'land': false,
    'photo': false,
  };
  bool _tieup = true;
  bool _tripartite = false;
  bool _noCost = false;
  bool _consent = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _bankCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        ref.read(coopApiProvider).getPassbook(),
        ref
            .read(apiClientProvider)
            .get('/kavach/assets/me')
            .then((d) => Map.from(d as Map))
            .catchError((_) => {'success': false}),
        ref
            .read(kccApiProvider)
            .calculate([
              {
                'code': 'DAIRY',
                if (widget.chosenAnimalUuids.isNotEmpty)
                  'animalUuids': widget.chosenAnimalUuids,
              },
            ])
            .catchError((_) => {'success': false}),
      ]);
      final pb = results[0];
      final assets = results[1];
      final calc = results[2];
      setState(() {
        final pbData = pb['data'] as Map?;
        _member = pb['success'] == true ? (pbData?['isMember'] != false) : false;
        if (assets['success'] == true) {
          _animalsCount = ((assets['data'] as List?) ?? []).length;
        }
        if (calc['success'] == true) _preview = calc['data'];
      });
    } catch (_) {
      // offline-tolerant
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  int get _kycCount => _kyc.values.where((v) => v).length;

  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context);
    if (!_consent) {
      _showAlert(l10n.kccConsentNeeded, l10n.kccConsentMsg);
      return;
    }
    if (_bankCtrl.text.trim().length < 6) {
      _showAlert(l10n.kccBankAccountTitle, l10n.kccBankAccountMsg);
      return;
    }
    if (_kycCount < 4) {
      _showAlert(l10n.kccKycDocsTitle, l10n.kccKycDocsMsg);
      return;
    }
    setState(() => _busy = true);
    try {
      final res = await ref.read(kccApiProvider).apply({
        'activities': [
          {
            'code': 'DAIRY',
            if (widget.chosenAnimalUuids.isNotEmpty)
              'animalUuids': widget.chosenAnimalUuids,
          },
        ],
        'bankAccountRef': _bankCtrl.text.trim(),
        'tieupRequested': _tieup,
        'kyc': _kyc,
        'repaymentConsent': {'tripartite': _tripartite, 'noCostService': _noCost},
      });
      if (res['success'] == true) {
        if (!mounted) return;
        await showDialog<void>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: Text(l10n.kccAppSavedTitle),
            content: Text(l10n.kccAppSavedMsg),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(),
                child: Text(l10n.commonOk),
              ),
            ],
          ),
        );
        if (mounted) context.pushReplacement('/kcc');
      } else {
        final msg = apiErrorMessage(res, fallback: l10n.commonRetry);
        _showAlert(
          l10n.kccCouldNotApply,
          msg.toLowerCase().contains('society') ? l10n.kccJoinSocietyMsg : msg,
        );
      }
    } catch (_) {
      _showAlert(l10n.commonError, l10n.kccCannotConnectCheck);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _showAlert(String title, String msg) {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(msg),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: Text(AppLocalizations.of(context).commonOk),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);

    if (_loading) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.kccApplyKcc)),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    if (_member == false) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.kccApplyKcc)),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('🤝', style: TextStyle(fontSize: 44)),
                const SizedBox(height: 8),
                Text(
                  l10n.kccJoinFirstTitle,
                  style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: AppColors.brandDark),
                ),
                const SizedBox(height: 8),
                Text(
                  l10n.kccJoinFirstMsg,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: AppColors.muted),
                ),
                const SizedBox(height: 20),
                ElevatedButton(
                  onPressed: () => context.push('/society'),
                  child: Text(l10n.kccGoToSociety),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final kycLabel = {
      'aadhaar': l10n.kccKycAadhaar,
      'pan': l10n.kccKycPan,
      'land': l10n.kccKycLand,
      'photo': l10n.kccKycPhoto,
    };

    return Scaffold(
      appBar: AppBar(title: Text(l10n.kccApplyKcc)),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          Text(
            l10n.kccApplyLead,
            style: const TextStyle(fontSize: 13, color: AppColors.muted, height: 1.35),
          ),
          const SizedBox(height: AppSpacing.md),

          AppCard(
            title: l10n.kccYourDairy,
            child: Column(
              children: [
                _row(
                  widget.chosenAnimalUuids.isNotEmpty
                      ? l10n.kccAnimalsInKcc
                      : l10n.kccAnimalsInRegister,
                  widget.chosenAnimalUuids.isNotEmpty
                      ? '${widget.chosenAnimalUuids.length} ${l10n.kccSelectedWord}'
                      : '$_animalsCount',
                ),
                _row(l10n.kccSocietyMember, l10n.kccLinked),
                if (_preview != null)
                  _row(l10n.kccEstimatedLimitSof, formatRupees(_preview?['cmpl']), strong: true),
                const SizedBox(height: 6),
                Text(
                  l10n.kccLimitFixedHint,
                  style: const TextStyle(fontSize: 12, color: AppColors.muted, height: 1.35),
                ),
              ],
            ),
          ),

          AppCard(
            title: '${l10n.kccKycDocuments} ($_kycCount/4)',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(l10n.kccKycConfirmHint, style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                const SizedBox(height: 4),
                for (final d in _kycDocs) _checkRow(kycLabel[d.$1]!, _kyc[d.$1]!, () {
                  setState(() => _kyc[d.$1] = !_kyc[d.$1]!);
                }),
              ],
            ),
          ),

          AppCard(
            title: l10n.kccBankForDbt,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                BigInput(controller: _bankCtrl, placeholder: l10n.kccBankPlaceholder, numeric: true),
                const SizedBox(height: 6),
                Text(l10n.kccBankHint, style: const TextStyle(fontSize: 12, color: AppColors.muted)),
              ],
            ),
          ),

          AppCard(
            title: l10n.kccMilkUnionTieupTitle,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _checkRow(l10n.kccTieupCheck, _tieup, () => setState(() => _tieup = !_tieup)),
                Text(l10n.kccTieupHint, style: const TextStyle(fontSize: 12, color: AppColors.brandDark, fontWeight: FontWeight.w600)),
              ],
            ),
          ),

          AppCard(
            title: l10n.kccRepaySupport,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _checkRow(l10n.kccTripartiteCheck, _tripartite, () => setState(() => _tripartite = !_tripartite)),
                _checkRow(l10n.kccNocostCheck, _noCost, () => setState(() => _noCost = !_noCost)),
                Text(l10n.kccRepayHint, style: const TextStyle(fontSize: 12, color: AppColors.brandDark, fontWeight: FontWeight.w600)),
              ],
            ),
          ),

          _checkRow(l10n.kccDeclaration, _consent, () => setState(() => _consent = !_consent)),
          const SizedBox(height: AppSpacing.sm),

          ElevatedButton(
            onPressed: (_busy || !_consent) ? null : _submit,
            child: _busy
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : Text(l10n.kccSaveApplication),
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            l10n.kccApplyFooter,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 12, color: AppColors.muted, height: 1.35),
          ),
        ],
      ),
    );
  }

  Widget _row(String label, String value, {bool strong = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(child: Text(label, style: const TextStyle(fontSize: 14, color: AppColors.ink))),
          Text(
            value,
            style: TextStyle(
              fontSize: strong ? 16 : 14,
              fontWeight: FontWeight.w700,
              color: strong ? AppColors.brandDark : AppColors.ink,
            ),
          ),
        ],
      ),
    );
  }

  Widget _checkRow(String label, bool value, VoidCallback onTap) {
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
            Expanded(
              child: Text(label, style: const TextStyle(fontSize: 13, color: AppColors.ink, height: 1.3)),
            ),
          ],
        ),
      ),
    );
  }
}
