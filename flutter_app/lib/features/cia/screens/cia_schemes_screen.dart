import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_client.dart';
import '../../../design_system/tokens.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../models/cia_status.dart' show kCiaFillableStatuses;
import '../providers/cia_providers.dart';

/// CIA — schemes list. Several cattle-induction schemes can run at once;
/// the member browses them and opens one for details. Mirrors
/// app/app/cia-schemes.tsx. Wired to GET /cattle-induction/schemes, which
/// annotates each with a per-scheme likelyEligible for this farmer.
class CiaSchemesScreen extends ConsumerStatefulWidget {
  const CiaSchemesScreen({super.key});

  @override
  ConsumerState<CiaSchemesScreen> createState() => _CiaSchemesScreenState();
}

class _CiaSchemesScreenState extends ConsumerState<CiaSchemesScreen> {
  bool _loading = true;
  bool _err = false;
  List<Map> _schemes = [];
  bool _hasFillable = false;
  bool _hasApp = false;

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
      final results = await Future.wait([api.listSchemes(), api.myApplications()]);
      final schemesRes = results[0];
      final appsRes = results[1];
      final schemes = schemesRes['success'] == true ? List<Map>.from(schemesRes['data'] ?? []) : <Map>[];
      final apps = appsRes['success'] == true ? List<Map>.from(appsRes['data'] ?? []) : <Map>[];
      setState(() {
        _schemes = schemes;
        _hasApp = apps.isNotEmpty;
        _hasFillable = apps.any((a) => kCiaFillableStatuses.contains(a['status']));
      });
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
      appBar: AppBar(title: Text(l10n.ciaNavSchemes)),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _err
          ? _errorView(l10n)
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(AppSpacing.lg),
                children: [
                  if (_hasFillable)
                    _banner(l10n.ciaAppCompletePrompt, onTap: () => context.push('/cia-status'))
                  else if (_hasApp)
                    _trackLink(l10n.ciaAppTrackPrompt, onTap: () => context.push('/cia-status')),
                  if (_schemes.isEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 24),
                      child: Text(l10n.ciaSchemesNone, style: const TextStyle(color: AppColors.muted)),
                    )
                  else ...[
                    Text(
                      '${_schemes.length} ${l10n.ciaSchemesOpenCount}',
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.muted,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.5,
                      ),
                    ),
                    const SizedBox(height: 10),
                    for (final s in _schemes) _schemeCard(l10n, s),
                  ],
                ],
              ),
            ),
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

  Widget _banner(String text, {required VoidCallback onTap}) => InkWell(
    borderRadius: BorderRadius.circular(14),
    onTap: onTap,
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      margin: const EdgeInsets.only(bottom: 14),
      decoration: BoxDecoration(color: AppColors.brandDark, borderRadius: BorderRadius.circular(14)),
      child: Row(
        children: [
          Expanded(
            child: Text(text, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
          ),
          const Text('→', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 18)),
        ],
      ),
    ),
  );

  Widget _trackLink(String text, {required VoidCallback onTap}) => InkWell(
    borderRadius: BorderRadius.circular(12),
    onTap: onTap,
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
      margin: const EdgeInsets.only(bottom: 14),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.line),
      ),
      alignment: Alignment.center,
      child: Text('$text →', style: const TextStyle(color: AppColors.brandDark, fontWeight: FontWeight.w800)),
    ),
  );

  Widget _schemeCard(AppLocalizations l10n, Map s) {
    final rules = Map.from(s['rules'] ?? {});
    final eligible = s['likelyEligible'];
    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: () => context.push('/cia-scheme?scheme=${Uri.encodeComponent(s['schemeVersion'].toString())}'),
      child: Container(
        padding: const EdgeInsets.all(14),
        margin: const EdgeInsets.only(bottom: 12),
        decoration: BoxDecoration(
          color: AppColors.card,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.line),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(
                    (s['title'] ?? s['schemeVersion']).toString(),
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.ink),
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      '${rules['subsidyPct'] ?? '—'}%',
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.brandDark),
                    ),
                    Text(
                      l10n.ciaSchemesSubsidy.toUpperCase(),
                      style: const TextStyle(fontSize: 9, color: AppColors.muted, fontWeight: FontWeight.w700),
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 9),
            Wrap(
              spacing: 14,
              children: [
                _fact('${l10n.ciaSchemesCeiling} ', formatRupees(rules['priceCeiling'])),
                _fact('${l10n.ciaSchemesMax} ', '${rules['maxCattlePerBeneficiary'] ?? '—'}'),
                _fact('${l10n.ciaSchemesMin} ', '${rules['minMembershipMonths'] ?? 0}${l10n.ciaSchemeMonths}'),
              ],
            ),
            const SizedBox(height: 11),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                if (eligible == true)
                  Text(
                    '✓ ${l10n.ciaSchemesYouQualify}',
                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.brandDark),
                  )
                else if (eligible == false)
                  Text(
                    '△ ${l10n.ciaSchemesCheckCriteria}',
                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.warnAmber),
                  )
                else
                  const SizedBox.shrink(),
                Text(
                  '${l10n.ciaSchemesView} →',
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.brand),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _fact(String label, String value) => Text.rich(
    TextSpan(
      style: const TextStyle(fontSize: 12, color: AppColors.muted),
      children: [
        TextSpan(text: label),
        TextSpan(text: value, style: const TextStyle(color: AppColors.ink, fontWeight: FontWeight.w700)),
      ],
    ),
  );
}
