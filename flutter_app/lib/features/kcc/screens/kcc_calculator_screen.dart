import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_client.dart';
import '../../../design_system/tokens.dart';
import '../../../design_system/widgets/app_card.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../../logbook/providers/dairy_providers.dart';
import '../providers/kcc_providers.dart';

const _speciesIcon = {
  'CATTLE': '🐄',
  'BUFFALO': '🐃',
  'GOAT': '🐐',
  'SHEEP': '🐑',
};

/// KCC calculator — the composite limit built from the farmer's ACTUAL
/// animals on record, not a typed number. Mirrors app/app/kcc-calculator.tsx
/// exactly: units come LIVE from the register, the farmer picks a subset,
/// and a sold animal auto-drops. Statutory math stays server-side.
class KccCalculatorScreen extends ConsumerStatefulWidget {
  const KccCalculatorScreen({super.key});

  @override
  ConsumerState<KccCalculatorScreen> createState() => _KccCalculatorScreenState();
}

class _KccCalculatorScreenState extends ConsumerState<KccCalculatorScreen> {
  bool _loading = true;
  bool _computing = false;
  List<Map> _animals = [];
  List<Map> _sold = [];
  final Set<String> _selected = {};
  Map? _result;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _compute(List<String> uuids) async {
    if (uuids.isEmpty) {
      setState(() => _result = null);
      return;
    }
    setState(() => _computing = true);
    try {
      final res = await ref
          .read(kccApiProvider)
          .calculate([
            {'code': 'DAIRY', 'animalUuids': uuids},
          ]);
      setState(() => _result = res['success'] == true ? res['data'] : null);
    } catch (_) {
      // offline-tolerant
    } finally {
      if (mounted) setState(() => _computing = false);
    }
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final api = ref.read(dairyApiProvider);
      final results = await Future.wait([
        api.listAnimals(),
        api.listAnimals(status: 'SOLD').catchError((_) => {'success': false}),
      ]);
      final act = results[0];
      final sld = results[1];
      final list = act['success'] == true
          ? List<Map>.from(act['data'] ?? [])
          : <Map>[];
      setState(() {
        _animals = list;
        _sold = sld['success'] == true ? List<Map>.from(sld['data'] ?? []) : [];
        _selected
          ..clear()
          ..addAll(list.map((a) => a['animal_uuid'].toString()));
      });
      await _compute(_selected.toList());
    } catch (_) {
      // offline-tolerant
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _toggle(String uuid) {
    setState(() {
      if (_selected.contains(uuid)) {
        _selected.remove(uuid);
      } else {
        _selected.add(uuid);
      }
    });
    _compute(_selected.toList());
  }

  Future<void> _markSold(Map a) async {
    final l10n = AppLocalizations.of(context);
    final name = (a['tag_number'] ?? a['name'] ?? l10n.kccAnimalWord).toString();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.kccSoldConfirmTitle),
        content: Text('$name ${l10n.kccSoldConfirmMsg}'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(l10n.commonCancel),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(l10n.kccYesSold),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      final res = await ref.read(dairyApiProvider).exitAnimal(
        a['animal_uuid'].toString(),
        {
          'exitReason': 'SOLD',
          'exitDate': DateTime.now().toIso8601String().substring(0, 10),
          'exitValue': asNum(a['current_market_value']),
          'buyerName': '',
        },
      );
      if (res['success'] == true) {
        await _load();
      } else if (mounted) {
        _showSnack(l10n.kccCouldNotUpdate, error: true);
      }
    } catch (_) {
      if (mounted) _showSnack(l10n.kccCouldNotUpdate, error: true);
    }
  }

  void _showSnack(String message, {bool error = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: error ? AppColors.danger : null,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);

    if (_loading) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.kccCalcMyLimit)),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    if (_animals.isEmpty && _sold.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.kccCalcMyLimit)),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('🐄', style: TextStyle(fontSize: 44)),
                const SizedBox(height: 8),
                Text(
                  l10n.kccNoAnimals,
                  style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: AppColors.brandDark),
                ),
                const SizedBox(height: 8),
                Text(
                  l10n.kccNoAnimalsMsg,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: AppColors.muted),
                ),
                const SizedBox(height: 20),
                ElevatedButton(
                  onPressed: () => context.push('/dairy-animals'),
                  child: Text(l10n.kccGoToAnimals),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final yearly = _result?['yearly'] as List?;
    final year1 = (yearly != null && yearly.isNotEmpty) ? yearly.first as Map : null;
    final mpl = (_result?['mpl'] as List?) ?? const [];

    return Scaffold(
      appBar: AppBar(title: Text(l10n.kccCalcMyLimit)),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            margin: const EdgeInsets.only(bottom: AppSpacing.md),
            decoration: BoxDecoration(
              color: AppColors.blueBg,
              borderRadius: BorderRadius.circular(AppRadii.button),
            ),
            child: Text(
              l10n.kccCalcBanner,
              style: const TextStyle(color: AppColors.blue, fontSize: 13, height: 1.35),
            ),
          ),

          AppCard(
            title:
                '${l10n.kccYourAnimals} (${_selected.length}/${_animals.length} ${l10n.kccSelectedWord})',
            child: Column(
              children: [
                for (final a in _animals) _animalRow(l10n, a),
                const SizedBox(height: 6),
                Text(
                  l10n.kccUnitsLiveHint,
                  style: const TextStyle(fontSize: 12, color: AppColors.muted, height: 1.3),
                ),
              ],
            ),
          ),

          if (_sold.isNotEmpty)
            AppCard(
              title: l10n.kccSoldExited,
              child: Column(
                children: [
                  for (final a in _sold)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      child: Row(
                        children: [
                          Text(_speciesIcon[a['species']] ?? '🐾', style: const TextStyle(fontSize: 22)),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              (a['name'] ?? a['tag_number'] ?? l10n.kccAnimalWord).toString(),
                              style: const TextStyle(
                                color: AppColors.muted,
                                decoration: TextDecoration.lineThrough,
                              ),
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: AppColors.goldBg,
                              borderRadius: BorderRadius.circular(AppRadii.chip),
                            ),
                            child: Text(
                              (a['status'] ?? '').toString(),
                              style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AppColors.gold),
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),

          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(AppSpacing.lg),
            margin: const EdgeInsets.only(bottom: AppSpacing.md),
            decoration: BoxDecoration(
              color: AppColors.brand,
              borderRadius: BorderRadius.circular(AppRadii.card),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  l10n.kccCompositeLimit.toUpperCase(),
                  style: const TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: 0.3),
                ),
                const SizedBox(height: 4),
                _computing
                    ? const Padding(
                        padding: EdgeInsets.symmetric(vertical: 8),
                        child: CircularProgressIndicator(color: Colors.white),
                      )
                    : Text(
                        _result != null ? formatRupees(_result?['cmpl']) : '—',
                        style: const TextStyle(color: Colors.white, fontSize: 34, fontWeight: FontWeight.w800),
                      ),
                Text(
                  '${_selected.length} ${_selected.length == 1 ? l10n.kccAnimalOne : l10n.kccAnimalMany} · ${l10n.kccCollateralFreeFull}',
                  style: const TextStyle(color: Colors.white, fontSize: 12, height: 1.3),
                ),
              ],
            ),
          ),

          if (year1 != null && !_computing)
            AppCard(
              title: l10n.kccYear1Breakdown,
              child: Column(
                children: [
                  _row(l10n.kccWcBase, formatRupees(year1['sumWc'])),
                  _row(l10n.kccConsumptionOnce, formatRupees(year1['consumption'])),
                  _row(l10n.kccMaintenanceTech, formatRupees(year1['maintenance'])),
                  _row(l10n.kccInsurancePremiumRow, formatRupees(year1['insurance'])),
                  _row(l10n.kccMplYear1, formatRupees(year1['mpl']), strong: true),
                ],
              ),
            ),

          if (mpl.isNotEmpty && !_computing)
            AppCard(
              title: l10n.kccSixYearSchedule,
              child: Column(
                children: [
                  for (int i = 0; i < mpl.length; i++)
                    _row('${l10n.kccYearWord} ${i + 1}', formatRupees(mpl[i])),
                ],
              ),
            ),

          ElevatedButton(
            onPressed: _selected.isEmpty
                ? null
                : () => context.push('/kcc-apply', extra: _selected.toList()),
            child: Text(l10n.kccApplyThisKcc),
          ),
          const SizedBox(height: AppSpacing.sm),
          TextButton(
            onPressed: () => context.push('/kcc-eligibility'),
            child: Text(l10n.kccCheckEligibility),
          ),
        ],
      ),
    );
  }

  Widget _animalRow(AppLocalizations l10n, Map a) {
    final uuid = a['animal_uuid'].toString();
    final on = _selected.contains(uuid);
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: AppColors.line)),
      ),
      child: Row(
        children: [
          Expanded(
            child: InkWell(
              onTap: () => _toggle(uuid),
              child: Row(
                children: [
                  Container(
                    width: 24,
                    height: 24,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(7),
                      color: on ? AppColors.brand : Colors.transparent,
                      border: Border.all(color: on ? AppColors.brand : AppColors.line, width: 2),
                    ),
                    alignment: Alignment.center,
                    child: on
                        ? const Icon(Icons.check, size: 15, color: Colors.white)
                        : null,
                  ),
                  const SizedBox(width: 10),
                  Text(_speciesIcon[a['species']] ?? '🐾', style: const TextStyle(fontSize: 24)),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          (a['name'] ?? a['tag_number'] ?? l10n.kccAnimalWord).toString(),
                          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                        ),
                        Text(
                          '${a['species'] ?? '—'}${a['current_market_value'] != null ? ' · ${l10n.kccValueWord} ${formatRupees(a['current_market_value'])}' : ''}',
                          style: const TextStyle(fontSize: 12, color: AppColors.muted),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          TextButton(
            style: TextButton.styleFrom(
              backgroundColor: AppColors.dangerBg,
              foregroundColor: AppColors.danger,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            ),
            onPressed: () => _markSold(a),
            child: Text(l10n.kccSoldQ, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
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
