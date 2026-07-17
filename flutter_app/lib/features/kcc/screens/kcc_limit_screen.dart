import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_client.dart';
import '../../../design_system/tokens.dart';
import '../../../design_system/widgets/app_card.dart';
import '../../../design_system/widgets/main_app_bar.dart';
import '../../../design_system/widgets/status_chip.dart';
import '../../../design_system/widgets/step_timeline.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../models/kcc_status.dart';
import '../providers/kcc_providers.dart';

/// KCC home — leads with Calculate/Apply when there's no application yet;
/// once applied, shows the sanctioned/estimated limit, drawing power
/// (¶16(4), a prototype-only card the RN reference never wired — see Phase-4
/// research §2), and the actor-grouped workflow timeline. Mirrors
/// app/app/kcc-limit.tsx, extended to handle the full 11-state backend
/// enum (RN's own ORDER array silently drops RENEWAL_DUE/RENEWED/REJECTED).
class KccLimitScreen extends ConsumerStatefulWidget {
  const KccLimitScreen({super.key});

  @override
  ConsumerState<KccLimitScreen> createState() => _KccLimitScreenState();
}

class _KccLimitScreenState extends ConsumerState<KccLimitScreen> {
  bool _loading = true;
  bool _busy = false;
  Map? _facility;
  Map? _drawingPower;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await ref.read(kccApiProvider).getFacility();
      if (res['success'] == true) {
        setState(() => _facility = res['data']);
        final uuid = _facility?['facilityUuid'];
        if (uuid != null) {
          try {
            final dp = await ref.read(kccApiProvider).getDrawingPower(uuid);
            if (dp['success'] == true) setState(() => _drawingPower = dp['data']);
          } catch (_) {
            // drawing power is evidence-only; a failure here never blocks the screen
          }
        }
      }
    } catch (_) {
      // offline-tolerant
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context);
    setState(() => _busy = true);
    try {
      final res = await ref.read(kccApiProvider).submitApplication(_facility!['facilityUuid']);
      if (res['success'] == true) {
        if (mounted) _showAlert(l10n.kccSubmittedTitle, l10n.kccSubmittedMsg);
        await _load();
      } else if (mounted) {
        _showAlert(l10n.kccNotSubmitted, (res['message'] ?? l10n.commonRetry).toString());
      }
    } catch (_) {
      if (mounted) _showAlert(l10n.commonError, l10n.kccCannotConnect);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _renew() async {
    final l10n = AppLocalizations.of(context);
    setState(() => _busy = true);
    try {
      final res = await ref.read(kccApiProvider).renew(_facility!['facilityUuid']);
      if (res['success'] == true) {
        if (mounted) _showAlert(l10n.kccRenewedTitle, l10n.kccRenewedMsg);
        await _load();
      } else if (mounted) {
        _showAlert(l10n.kccNotRenewed, (res['message'] ?? l10n.commonRetry).toString());
      }
    } catch (_) {
      if (mounted) _showAlert(l10n.commonError, l10n.kccCannotConnect);
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
        appBar: MainAppBar(title: l10n.tabKcc),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final f = _facility;
    if (f == null || f['hasFacility'] != true) {
      return Scaffold(
        appBar: MainAppBar(title: l10n.tabKcc),
        body: RefreshIndicator(
          onRefresh: _load,
          child: ListView(
            padding: const EdgeInsets.all(AppSpacing.lg),
            children: [
              Text(
                l10n.kccTitleDairy,
                style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: AppColors.brandDark),
              ),
              const SizedBox(height: 4),
              Text(l10n.kccHomeLead, style: const TextStyle(fontSize: 13, color: AppColors.muted, height: 1.35)),
              const SizedBox(height: AppSpacing.lg),
              _primaryAction(
                icon: '🧮',
                title: l10n.kccCalcMyLimit,
                subtitle: l10n.kccCalcSub,
                onTap: () => context.push('/kcc-calculator'),
                primary: true,
              ),
              _primaryAction(
                icon: '📝',
                title: l10n.kccApplyKcc,
                subtitle: l10n.kccApplySub,
                onTap: () => context.push('/kcc-apply'),
                primary: false,
              ),
              TextButton(
                onPressed: () => context.push('/kcc-eligibility'),
                child: Text(l10n.kccCheckEligibility),
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                l10n.kccHowItWorks.toUpperCase(),
                style: const TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w700, letterSpacing: 0.4),
              ),
              const SizedBox(height: AppSpacing.sm),
              AppCard(child: StepTimeline(steps: buildFacilityTimeline(l10n, null))),
            ],
          ),
        ),
      );
    }

    final status = (f['status'] ?? 'DRAFT').toString();
    final applied = status != 'DRAFT';
    final tone = facilityStatusTone(status);
    final collateralFree = f['collateralFree'] == true;
    final tieupCertified = f['tieupCertified'] == true;
    final tieupRequested = f['tieupRequested'] == true;
    final kyc = f['kyc'] as Map?;
    final repaymentConsent = f['repaymentConsent'] as Map?;
    final bankAccountRef = f['bankAccountRef']?.toString();

    return Scaffold(
      appBar: MainAppBar(title: l10n.tabKcc),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(AppSpacing.lg),
          children: [
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        status == 'DRAFT' ? l10n.kccEstimatedLimit : l10n.kccSanctionedLimit,
                        style: const TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w700, letterSpacing: 0.4),
                      ),
                      StatusChip(label: humanStatus(status), tone: tone),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    formatRupees(f['cmpl']),
                    style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w800, color: AppColors.brandDark),
                  ),
                  _row(l10n.kccCashCreditSt, formatRupees(f['stSubLimit'])),
                  _row(l10n.kccInvestmentLt, formatRupees(f['ltSubLimit'])),
                  if (collateralFree)
                    Container(
                      margin: const EdgeInsets.only(top: 8),
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(color: AppColors.accent, borderRadius: BorderRadius.circular(AppRadii.chip)),
                      child: Text(
                        '${l10n.kccCollateralFreeUpto} ${formatRupees(f['collateralFreeLimitApplied'] ?? 200000)}'
                        '${tieupCertified ? l10n.kccTieupOk : tieupRequested ? l10n.kccTieupRequested : ''}',
                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.brandDark),
                      ),
                    ),
                ],
              ),
            ),

            if (_drawingPower != null)
              AppCard(
                title: l10n.kccDrawingPowerTitle,
                child: Column(
                  children: [
                    _row(l10n.kccDrawingPower, formatRupees(_drawingPower?['value']), strong: true),
                    _row(l10n.kccMilkReceivables, formatRupees(_drawingPower?['milkReceivables'])),
                    _row(l10n.kccStocks, formatRupees(_drawingPower?['stocks'])),
                  ],
                ),
              ),

            AppCard(
              padding: const EdgeInsets.all(AppSpacing.md),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    l10n.kccCoopSeparateTitle,
                    style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.blue, fontSize: 13),
                  ),
                  const SizedBox(height: 4),
                  Text(l10n.kccCoopSeparateNote, style: const TextStyle(color: AppColors.blue, fontSize: 12, height: 1.35)),
                ],
              ),
            ),

            Text(
              l10n.kccAppProgress.toUpperCase(),
              style: const TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w700, letterSpacing: 0.4),
            ),
            const SizedBox(height: AppSpacing.sm),

            if (status == 'REJECTED')
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(AppSpacing.md),
                margin: const EdgeInsets.only(bottom: AppSpacing.md),
                decoration: BoxDecoration(color: AppColors.dangerBg, borderRadius: BorderRadius.circular(AppRadii.button)),
                child: Text(l10n.kccStatusRejectedNote, style: const TextStyle(color: AppColors.danger, fontSize: 13, fontWeight: FontWeight.w600)),
              )
            else
              AppCard(child: StepTimeline(steps: buildFacilityTimeline(l10n, status))),

            if (status == 'DRAFT')
              ElevatedButton(
                onPressed: _busy ? null : _submit,
                child: _busy
                    ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : Text(l10n.kccSubmitToSociety),
              ),
            if (['SUBMITTED', 'SOCIETY_CERTIFIED', 'UNDER_REVIEW', 'FORWARDED_TO_BANK'].contains(status))
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(AppSpacing.md),
                margin: const EdgeInsets.only(bottom: AppSpacing.md, top: AppSpacing.sm),
                decoration: BoxDecoration(color: AppColors.warnAmberBg, borderRadius: BorderRadius.circular(AppRadii.button)),
                child: Text(
                  status == 'SUBMITTED'
                      ? l10n.kccWaitSubmitted
                      : status == 'SOCIETY_CERTIFIED'
                      ? l10n.kccWaitCertified
                      : l10n.kccWaitBank,
                  style: const TextStyle(color: AppColors.warnAmber, fontSize: 13, height: 1.35, fontWeight: FontWeight.w600),
                ),
              ),
            if (status == 'RENEWAL_DUE') ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(AppSpacing.md),
                margin: const EdgeInsets.only(bottom: AppSpacing.md, top: AppSpacing.sm),
                decoration: BoxDecoration(color: AppColors.warnAmberBg, borderRadius: BorderRadius.circular(AppRadii.button)),
                child: Text(l10n.kccWaitRenewalDue, style: const TextStyle(color: AppColors.warnAmber, fontSize: 13, height: 1.35, fontWeight: FontWeight.w600)),
              ),
              ElevatedButton(
                onPressed: _busy ? null : _renew,
                child: _busy
                    ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : Text(l10n.kccRenewNow),
              ),
            ],

            if (applied)
              AppCard(
                title: l10n.kccYourApplication,
                child: Column(
                  children: [
                    if (bankAccountRef != null && bankAccountRef.isNotEmpty)
                      _row(
                        l10n.kccDbtAccount,
                        '••••${bankAccountRef.length >= 4 ? bankAccountRef.substring(bankAccountRef.length - 4) : bankAccountRef}',
                      ),
                    _row(l10n.kccMilkUnionTieup, tieupRequested ? l10n.kccTieupReqValue : l10n.kccNo),
                    if (kyc != null)
                      _row(l10n.kccKycReady, '${kyc.values.where((v) => v == true).length}/4 ${l10n.kccDocumentsWord}'),
                    if (repaymentConsent?['tripartite'] == true)
                      _row(l10n.kccTripartite, l10n.kccAgreed),
                  ],
                ),
              ),

            if (['DISBURSED', 'ACTIVE', 'RENEWAL_DUE', 'RENEWED'].contains(status)) ...[
              OutlinedButton(
                onPressed: () => context.push('/kcc-drawdown'),
                child: Text(l10n.kccBuyAnimalEquip),
              ),
              const SizedBox(height: AppSpacing.sm),
              OutlinedButton(
                onPressed: () => context.push('/kcc-transactions'),
                child: Text(l10n.kccViewTransactions),
              ),
              const SizedBox(height: AppSpacing.sm),
              OutlinedButton(
                onPressed: () => context.push('/kcc-pack'),
                child: Text(l10n.kccViewBankerPack),
              ),
              const SizedBox(height: AppSpacing.sm),
            ],

            TextButton(
              onPressed: () => context.push('/kcc-calculator'),
              child: Text(l10n.kccRecalculate),
            ),
          ],
        ),
      ),
    );
  }

  Widget _primaryAction({
    required String icon,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
    required bool primary,
  }) {
    return InkWell(
      borderRadius: BorderRadius.circular(AppRadii.card),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(18),
        margin: const EdgeInsets.only(bottom: AppSpacing.md),
        decoration: BoxDecoration(
          color: primary ? AppColors.brand : AppColors.card,
          borderRadius: BorderRadius.circular(AppRadii.card),
          border: primary ? null : Border.all(color: AppColors.brand, width: 2),
        ),
        child: Row(
          children: [
            Text(icon, style: const TextStyle(fontSize: 30)),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: primary ? Colors.white : AppColors.brandDark),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: TextStyle(fontSize: 12, color: primary ? Colors.white70 : AppColors.brand),
                  ),
                ],
              ),
            ),
            Text('›', style: TextStyle(fontSize: 26, color: primary ? Colors.white70 : AppColors.brandDark)),
          ],
        ),
      ),
    );
  }

  Widget _row(String label, String value, {bool strong = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(fontSize: 14, color: AppColors.ink)),
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
}
