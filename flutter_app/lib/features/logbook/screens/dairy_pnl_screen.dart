import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../design_system/tokens.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../api/dairy_api.dart';
import '../providers/dairy_providers.dart';
import '../widgets/form_kit.dart' show todayYMD, shiftYMD;

/// Mirrors app/app/dairy-pnl.tsx — read-only report, herd vs per-animal
/// view, 7/14/30/90-day range. Category bar-chart colors match the RN
/// screen's CAT_COLORS map (mapped through design-system-adjacent tones
/// where possible; the category palette itself doesn't have a
/// design-system equivalent so it's kept as its own local constant).
class DairyPnlScreen extends ConsumerStatefulWidget {
  const DairyPnlScreen({super.key});

  @override
  ConsumerState<DairyPnlScreen> createState() => _DairyPnlScreenState();
}

const _catColors = {
  'FEED': Color(0xFF2E7D32),
  'FODDER': Color(0xFF558B2F),
  'LABOR': Color(0xFF1565C0),
  'MEDICINE': Color(0xFFC62828),
  'VET_TREATMENT': Color(0xFFD84315),
  'VACCINATION': Color(0xFF6A1B9A),
  'ELECTRICITY': Color(0xFFF9A825),
  'WATER': Color(0xFF0288D1),
  'TRANSPORT': Color(0xFF5D4037),
  'EQUIPMENT': Color(0xFF455A64),
  'HOUSING': Color(0xFF6D4C41),
  'INSURANCE': Color(0xFF00838F),
  'PURCHASE_ANIMAL': Color(0xFF4E342E),
  'AI_BREEDING': Color(0xFF7B1FA2),
  'NATURAL_SERVICE': Color(0xFF8E24AA),
  'OTHER': Color(0xFF616161),
};

class _DairyPnlScreenState extends ConsumerState<DairyPnlScreen> {
  bool _loading = true;
  int _range = 14;
  String _view = 'herd';
  Map? _herd;
  List<Map> _perAnimal = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final api = ref.read(dairyApiProvider);
      final start = shiftYMD(todayYMD(), -_range);
      final end = todayYMD();
      final results = await Future.wait([
        api.getHerdPnl(startDate: start, endDate: end),
        api.getPerAnimalPnl(startDate: start, endDate: end),
      ]);
      if (results[0]['success'] == true) _herd = results[0]['data'];
      if (results[1]['success'] == true)
        _perAnimal = List<Map>.from(results[1]['data'] ?? []);
    } catch (_) {
      // offline-tolerant
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);

    return Scaffold(
      appBar: AppBar(title: Text(l10n.dairyPnlTitle)),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(AppSpacing.lg),
                children: [
                  Row(
                    children: [
                      for (final r in [7, 14, 30, 90])
                        Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: _rangeChip('${r}d', r == _range, () {
                            setState(() => _range = r);
                            _load();
                          }),
                        ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.md),
                  Row(
                    children: [
                      Expanded(
                        child: _viewToggle(
                          l10n.dairyPnlHerdTotal,
                          _view == 'herd',
                          () => setState(() => _view = 'herd'),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: _viewToggle(
                          l10n.dairyPnlPerAnimal,
                          _view == 'animal',
                          () => setState(() => _view = 'animal'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.md),
                  if (_view == 'herd')
                    _herdView(l10n)
                  else
                    _perAnimalView(l10n),
                ],
              ),
            ),
    );
  }

  Widget _rangeChip(String label, bool selected, VoidCallback onTap) => InkWell(
    borderRadius: BorderRadius.circular(999),
    onTap: onTap,
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        color: selected ? AppColors.brand : AppColors.card,
        border: Border.all(color: selected ? AppColors.brand : AppColors.line),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: selected ? Colors.white : AppColors.muted,
          fontWeight: FontWeight.w700,
          fontSize: 12,
        ),
      ),
    ),
  );

  Widget _viewToggle(String label, bool selected, VoidCallback onTap) =>
      InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            color: selected ? AppColors.accent : AppColors.card,
            border: Border.all(
              color: selected ? AppColors.brand : AppColors.line,
            ),
          ),
          child: Text(
            label,
            style: TextStyle(
              color: selected ? AppColors.brandDark : AppColors.muted,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      );

  Widget _herdView(AppLocalizations l10n) {
    final totalCost = parseNum(_herd?['totalCost']);
    final totalRev = parseNum(_herd?['totalRevenue']);
    final net = parseNum(_herd?['netProfit']);
    final formal = parseNum(_herd?['formalCost']);
    final informal = parseNum(_herd?['informalCost']);
    final byCategory = Map<String, dynamic>.from(
      _herd?['costByCategory'] ?? {},
    );
    final entries =
        byCategory.entries
            .map((e) => MapEntry(e.key, parseNum(e.value)))
            .where((e) => e.value > 0)
            .toList()
          ..sort((a, b) => b.value.compareTo(a.value));
    final maxVal = entries.isEmpty ? 1 : entries.first.value;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.all(AppSpacing.lg),
          decoration: BoxDecoration(
            color: AppColors.brandDark,
            borderRadius: BorderRadius.circular(16),
          ),
          child: Column(
            children: [
              Text(
                l10n.dairyPnlNetProfit,
                style: const TextStyle(color: Color(0xFFA5D6A7), fontSize: 12),
              ),
              Text(
                formatRupees(net),
                style: TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.w800,
                  color: net >= 0
                      ? const Color(0xFF81C784)
                      : const Color(0xFFEF9A9A),
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              Row(
                children: [
                  Expanded(
                    child: _summaryBox(
                      l10n.dairyPnlRevenue,
                      formatRupees(totalRev),
                    ),
                  ),
                  Expanded(
                    child: _summaryBox(
                      l10n.dairyPnlCost,
                      formatRupees(totalCost),
                    ),
                  ),
                ],
              ),
              Row(
                children: [
                  Expanded(
                    child: _summaryBox(
                      l10n.dairyPnlFormal,
                      formatRupees(formal),
                    ),
                  ),
                  Expanded(
                    child: _summaryBox(
                      l10n.dairyPnlInformal,
                      formatRupees(informal),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        Container(
          padding: const EdgeInsets.all(AppSpacing.lg),
          margin: const EdgeInsets.only(top: AppSpacing.md),
          decoration: BoxDecoration(
            color: AppColors.card,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.line),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                l10n.dairyPnlCostBreakdown,
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: AppColors.muted,
                ),
              ),
              const SizedBox(height: AppSpacing.sm),
              if (entries.isEmpty)
                Text(
                  l10n.dairyPnlNoCosts,
                  style: const TextStyle(color: AppColors.muted),
                )
              else
                for (final e in entries)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              e.key.replaceAll('_', ' '),
                              style: const TextStyle(fontSize: 12),
                            ),
                            Text(
                              formatRupees(e.value),
                              style: const TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(4),
                          child: LinearProgressIndicator(
                            value: (e.value / maxVal)
                                .clamp(0.0, 1.0)
                                .toDouble(),
                            minHeight: 6,
                            backgroundColor: AppColors.line,
                            valueColor: AlwaysStoppedAnimation(
                              _catColors[e.key] ?? _catColors['OTHER']!,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _summaryBox(String label, String value) => Padding(
    padding: const EdgeInsets.all(4),
    child: Column(
      children: [
        Text(
          label,
          style: const TextStyle(color: Color(0xFFA5D6A7), fontSize: 11),
        ),
        Text(
          value,
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w700,
            fontSize: 14,
          ),
        ),
      ],
    ),
  );

  Widget _perAnimalView(AppLocalizations l10n) {
    if (_perAnimal.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(AppSpacing.lg),
        decoration: BoxDecoration(
          color: AppColors.card,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.line),
        ),
        child: Text(
          l10n.dairyPnlNoAnimals,
          style: const TextStyle(color: AppColors.muted),
        ),
      );
    }
    return Column(
      children: [
        for (final a in _perAnimal)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(AppSpacing.lg),
            margin: const EdgeInsets.only(bottom: AppSpacing.sm),
            decoration: BoxDecoration(
              color: AppColors.card,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.line),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Text('🐄', style: TextStyle(fontSize: 20)),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        (a['name'] ?? a['tagNumber'] ?? l10n.dairyPnlUnnamed)
                            .toString(),
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ),
                    Text(
                      formatRupees(parseNum(a['netProfit'])),
                      style: TextStyle(
                        fontWeight: FontWeight.w800,
                        color: parseNum(a['netProfit']) >= 0
                            ? AppColors.brandDark
                            : AppColors.danger,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  '${l10n.dairyPnlRevenueLabel} ${formatRupees(parseNum(a['totalRevenue']))}',
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.brandDark,
                  ),
                ),
                Text(
                  '  ${l10n.dairyPnlDirect} ${formatRupees(parseNum(a['directRevenue']))}',
                  style: const TextStyle(fontSize: 11, color: AppColors.muted),
                ),
                Text(
                  '  ${l10n.dairyPnlAllocated} ${formatRupees(parseNum(a['allocatedRevenue']))}',
                  style: const TextStyle(fontSize: 11, color: AppColors.muted),
                ),
                Text(
                  '${l10n.dairyPnlCostLabel} ${formatRupees(parseNum(a['totalCost']))}',
                  style: const TextStyle(fontSize: 12, color: AppColors.danger),
                ),
                Text(
                  '  ${l10n.dairyPnlDirect} ${formatRupees(parseNum(a['directCost']))}',
                  style: const TextStyle(fontSize: 11, color: AppColors.muted),
                ),
                Text(
                  '  ${l10n.dairyPnlAllocated} ${formatRupees(parseNum(a['allocatedCost']))}',
                  style: const TextStyle(fontSize: 11, color: AppColors.muted),
                ),
              ],
            ),
          ),
      ],
    );
  }
}
