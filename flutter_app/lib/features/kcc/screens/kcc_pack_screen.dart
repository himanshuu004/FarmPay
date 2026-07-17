import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../design_system/tokens.dart';
import '../../../design_system/widgets/app_card.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../providers/kcc_providers.dart';

/// KCC application / renewal pack — the banker interface in v1. A
/// generated document from the farmer's own data (zero re-paperwork).
/// Mirrors app/app/kcc-pack.tsx.
class KccPackScreen extends ConsumerStatefulWidget {
  const KccPackScreen({super.key});

  @override
  ConsumerState<KccPackScreen> createState() => _KccPackScreenState();
}

class _KccPackScreenState extends ConsumerState<KccPackScreen> {
  bool _loading = true;
  Map? _pack;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final fac = await ref.read(kccApiProvider).getFacility();
      if (fac['success'] != true || fac['data']?['hasFacility'] != true) return;
      final res = await ref
          .read(kccApiProvider)
          .getPack(fac['data']['facilityUuid'].toString());
      if (res['success'] == true) setState(() => _pack = res['data']);
    } catch (_) {
      // offline-tolerant
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);

    if (_loading) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.kccRenewalPack)),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final pack = _pack;
    if (pack == null) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.kccRenewalPack)),
        body: Center(child: Text(l10n.kccApplyFirst, style: const TextStyle(color: AppColors.muted))),
      );
    }

    final f = pack['facility'] as Map? ?? const {};
    final farmer = pack['farmer'] as Map? ?? const {};
    final activities = (pack['activities'] as List?) ?? const [];
    final dp = pack['drawingPower'] as Map?;
    final scheme = pack['scheme'] as Map? ?? const {};

    return Scaffold(
      appBar: AppBar(title: Text(l10n.kccRenewalPack)),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(AppSpacing.lg),
            margin: const EdgeInsets.only(bottom: AppSpacing.md),
            decoration: BoxDecoration(color: AppColors.blueBg, borderRadius: BorderRadius.circular(AppRadii.button)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  pack['kind'] == 'RENEWAL_PACK' ? l10n.kccRenewalPack : l10n.kccApplicationPack,
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.blue),
                ),
                const SizedBox(height: 2),
                Text(
                  '${scheme['version'] ?? ''} · ${scheme['stateCode'] ?? ''} · ${l10n.kccBankerInterfaceSuffix}',
                  style: const TextStyle(fontSize: 12, color: AppColors.blue),
                ),
              ],
            ),
          ),

          AppCard(
            title: l10n.kccApplicant,
            child: Column(
              children: [
                _row(l10n.kccName, (farmer['name'] ?? '—').toString()),
                _row(l10n.kccMobile, (farmer['mobile'] ?? '—').toString()),
              ],
            ),
          ),

          AppCard(
            title: l10n.kccSanctionedLimit,
            child: Column(
              children: [
                _row(l10n.kccCompositeMpl, formatRupees(f['cmpl']), strong: true),
                _row(l10n.kccStSublimit, formatRupees(f['stSubLimit'])),
                _row(l10n.kccLtSublimit, formatRupees(f['ltSubLimit'])),
                _row(l10n.kccSixthYearMpl, formatRupees(f['mplFinal'])),
                _row(l10n.kccCollateralFreeLabel, f['collateralFree'] == true ? l10n.kccYes2lakh : l10n.kccNo),
              ],
            ),
          ),

          AppCard(
            title: l10n.kccActivitiesTitle,
            child: Column(
              children: [
                for (final a in activities)
                  _row((a as Map)['code'].toString(), '${a['units']} ${a['unitType']}'),
              ],
            ),
          ),

          if (dp != null)
            AppCard(
              title: l10n.kccDrawingPowerTitle,
              child: Column(
                children: [
                  _row(l10n.kccDrawingPower, formatRupees(dp['value']), strong: true),
                  _row(l10n.kccMilkReceivables, formatRupees(dp['milkReceivables'])),
                  _row(l10n.kccStocks, formatRupees(dp['stocks'])),
                ],
              ),
            ),

          Text(
            l10n.kccPackFooter,
            style: const TextStyle(fontSize: 12, color: AppColors.muted, height: 1.35),
          ),
          const SizedBox(height: AppSpacing.md),
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
              fontSize: 14,
              fontWeight: strong ? FontWeight.w800 : FontWeight.w600,
              color: strong ? AppColors.brandDark : AppColors.ink,
            ),
          ),
        ],
      ),
    );
  }
}
