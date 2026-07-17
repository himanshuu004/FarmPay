import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_client.dart';
import '../../../design_system/tokens.dart';
import '../../../design_system/widgets/app_card.dart';
import '../../../design_system/widgets/limit_meter.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../providers/kcc_providers.dart';

const _bandColor = {
  'STRONG': Color(0xFF1B5E20),
  'ESTABLISHED': AppColors.brand,
  'EMERGING': AppColors.warnAmber,
  'THIN': AppColors.danger,
};

/// KCC eligibility + TRUST — the 1000-pt score with SHAP-style reason
/// codes. Decision support only; the sanctioned number is always the
/// engine's statutory math. Mirrors app/app/kcc-eligibility.tsx.
class KccEligibilityScreen extends ConsumerStatefulWidget {
  const KccEligibilityScreen({super.key});

  @override
  ConsumerState<KccEligibilityScreen> createState() => _KccEligibilityScreenState();
}

class _KccEligibilityScreenState extends ConsumerState<KccEligibilityScreen> {
  bool _loading = true;
  Map? _data;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await ref.read(kccApiProvider).eligibility();
      if (res['success'] == true) setState(() => _data = res['data']);
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
        appBar: AppBar(title: Text(l10n.kccTrustScore)),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final trust = _data?['trust'] as Map?;
    final band = (trust?['band'] as String?) ?? 'THIN';
    final score = asNum(trust?['score']);
    final scale = asNum(trust?['scale'], fallback: 1000);
    final fill = scale == 0 ? 0.0 : (score / scale).clamp(0.0, 1.0).toDouble();
    final reasonCodes = (trust?['reasonCodes'] as List?) ?? const [];
    final pillarsPending = (trust?['pillarsPending'] as List?) ?? const [];
    final ceiling = _data?['collateralFreeCeiling'] ?? 200000;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.kccTrustScore)),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          AppCard(
            title: l10n.kccTrustScore,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      score.round().toString(),
                      style: const TextStyle(fontSize: 34, fontWeight: FontWeight.w800, color: AppColors.brandDark),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                      decoration: BoxDecoration(
                        color: _bandColor[band] ?? AppColors.danger,
                        borderRadius: BorderRadius.circular(AppRadii.button),
                      ),
                      child: Text(
                        band,
                        style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w800),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                LimitMeter(fraction: fill),
                const SizedBox(height: 6),
                Text(l10n.kccDecisionSupport, style: const TextStyle(color: AppColors.muted, fontSize: 12)),
              ],
            ),
          ),
          AppCard(
            title: l10n.kccWhy,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final r in reasonCodes)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 7),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Text(
                            '${(r as Map)['direction'] == 'positive' ? '✅ ' : '• '}${r['label']}',
                            style: const TextStyle(fontSize: 14, color: AppColors.ink),
                          ),
                        ),
                        Text(
                          '${asNum(r['points']) > 0 ? '+' : ''}${r['points']}',
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: asNum(r['points']) > 0 ? AppColors.brand : AppColors.muted,
                          ),
                        ),
                      ],
                    ),
                  ),
                if (pillarsPending.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(
                      '${l10n.kccPillarsPending} ${pillarsPending.join(' · ').toLowerCase()}.',
                      style: const TextStyle(color: AppColors.muted, fontSize: 12),
                    ),
                  ),
              ],
            ),
          ),
          AppCard(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(l10n.kccCollateralCeiling, style: const TextStyle(fontSize: 14, color: AppColors.ink)),
                Text(
                  '≤ ${formatRupees(ceiling)}',
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.brandDark),
                ),
              ],
            ),
          ),
          ElevatedButton(
            onPressed: () => context.push('/kcc'),
            child: Text(l10n.kccApplyKcc),
          ),
        ],
      ),
    );
  }
}
