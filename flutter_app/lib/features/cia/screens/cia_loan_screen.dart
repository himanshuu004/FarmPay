import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_client.dart';
import '../../../design_system/tokens.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../models/cia_status.dart' show ciaShortDate;
import '../providers/cia_providers.dart';

/// CIA — loan & subsidy status. Once the bank sanctions, the farmer sees
/// the money breakdown and watches subsidy → disbursement land; when
/// disbursed the guided purchase unlocks. Mirrors app/app/cia-loan.tsx.
/// Reuses GET /applications/:uuid/status (the financials block).
class CiaLoanScreen extends ConsumerStatefulWidget {
  const CiaLoanScreen({super.key, this.appUuid});

  final String? appUuid;

  @override
  ConsumerState<CiaLoanScreen> createState() => _CiaLoanScreenState();
}

class _CiaLoanScreenState extends ConsumerState<CiaLoanScreen> {
  bool _loading = true;
  bool _err = false;
  Map? _status;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _err = false;
    });
    try {
      final api = ref.read(ciaApiProvider);
      var uuid = widget.appUuid;
      if (uuid == null) {
        final appsRes = await api.myApplications();
        final apps = appsRes['success'] == true ? List<Map>.from(appsRes['data'] ?? []) : <Map>[];
        if (apps.isEmpty) {
          setState(() => _err = true);
          return;
        }
        uuid = apps.first['applicationUuid'].toString();
      }
      final res = await api.getStatus(uuid);
      if (res['success'] == true) {
        setState(() => _status = Map.from(res['data']));
      } else {
        setState(() => _err = true);
      }
    } catch (_) {
      setState(() => _err = true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.ciaNavLoan)),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _err || _status == null
          ? _errorView(l10n)
          : _body(l10n, _status!),
    );
  }

  Widget _errorView(AppLocalizations l10n) => Center(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(l10n.ciaLoadError, style: const TextStyle(color: AppColors.muted)),
        const SizedBox(height: 12),
        ElevatedButton(onPressed: _load, child: Text(l10n.commonRetry)),
      ],
    ),
  );

  Widget _body(AppLocalizations l10n, Map st) {
    final fin = st['financials'];
    if (fin == null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('🏦', style: TextStyle(fontSize: 46)),
            const SizedBox(height: 8),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 28),
              child: Text(l10n.ciaLoanNotSanctioned, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.muted)),
            ),
          ],
        ),
      );
    }

    final hasSubsidy = st['subsidyTransfer'] != null;
    final hasDisb = st['disbursement'] != null;
    final status = st['status'].toString();
    final ready = st['purchaseUnlocked'] == true || ['CATTLE_PURCHASE_PENDING', 'PURCHASE_INITIATED'].contains(status);
    final stage = ready ? 3 : (hasDisb ? 2 : (hasSubsidy ? 1 : 0));

    final stages = [
      (h: l10n.ciaLoanStSanctioned, sub: ciaShortDate(st['asOf']?.toString())),
      (h: l10n.ciaLoanStSubsidy, sub: hasSubsidy ? ciaShortDate(st['subsidyTransfer']['recordedAt']?.toString()) : '${l10n.ciaWhoDuss} → ${l10n.ciaEmiCBank}'),
      (h: l10n.ciaLoanStDisbursed, sub: l10n.ciaLoanToLoanAc),
      (h: l10n.ciaLoanStReady, sub: ''),
    ];

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          margin: const EdgeInsets.only(bottom: 12),
          decoration: BoxDecoration(color: AppColors.blueBg, borderRadius: BorderRadius.circular(10)),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(child: Text(l10n.ciaEmiAsOf, style: const TextStyle(color: AppColors.blue, fontSize: 12, fontWeight: FontWeight.w600))),
              if (st['disbursement']?['loanAccount'] != null)
                Text('${l10n.ciaEmiLoanAc} ${st['disbursement']['loanAccount']}', style: const TextStyle(color: AppColors.blue, fontSize: 11.5, fontWeight: FontWeight.w800)),
            ],
          ),
        ),
        Container(
          padding: const EdgeInsets.all(16),
          margin: const EdgeInsets.only(bottom: 14),
          decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.line)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text.rich(TextSpan(children: [
                TextSpan(text: formatRupees(fin['sanctionedAmount']), style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: AppColors.brandDark)),
                TextSpan(text: '  ${l10n.ciaLoanSanctioned}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.muted)),
              ])),
              const SizedBox(height: 10),
              _row(l10n.ciaLoanSubsidy, formatRupees(fin['subsidyAmount']), pct: fin['subsidyPct']),
              _row(l10n.ciaLoanComponent, formatRupees(fin['loanComponent'])),
              _row(l10n.ciaLoanContribution, formatRupees(fin['farmerContribution']), pct: fin['beneficiaryContributionPct']),
            ],
          ),
        ),
        for (int i = 0; i < stages.length; i++) _stageRow(i, stage, stages[i], last: i == stages.length - 1, l10n: l10n),
        if (ready) ...[
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(onPressed: () => context.push('/cia-purchase'), child: Text('${l10n.ciaLoanStartPurchase} →')),
          ),
        ],
      ],
    );
  }

  Widget _row(String label, String value, {num? pct}) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 7),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text('$label${pct != null ? ' · $pct%' : ''}', style: const TextStyle(fontSize: 13, color: AppColors.muted)),
        Text(value, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.ink)),
      ],
    ),
  );

  Widget _stageRow(int i, int stage, ({String h, String sub}) s, {required bool last, required AppLocalizations l10n}) {
    final state = i < stage ? 'done' : (i == stage ? 'now' : 'future');
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 18,
            child: Column(
              children: [
                Container(
                  width: 14,
                  height: 14,
                  margin: const EdgeInsets.only(top: 3),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: state == 'done' ? AppColors.brand : (state == 'now' ? Colors.white : AppColors.line),
                    border: state == 'now' ? Border.all(color: AppColors.brand, width: 3) : null,
                  ),
                ),
                if (!last)
                  Expanded(child: Container(width: 2, color: i < stage ? AppColors.brand : AppColors.line)),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    s.h,
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: state == 'future' ? AppColors.muted : (state == 'now' ? AppColors.brandDark : AppColors.ink),
                    ),
                  ),
                  Text(
                    state == 'future' ? l10n.ciaLoanPending : s.sub,
                    style: TextStyle(fontSize: 12, color: state == 'future' ? AppColors.muted.withValues(alpha: 0.7) : AppColors.muted),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
