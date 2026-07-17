import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_client.dart';
import '../../../design_system/tokens.dart';
import '../../../design_system/widgets/app_card.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../providers/insurance_providers.dart';

const _terms = [12, 24, 36];

/// Pashu Suraksha quote — NLM premium: farmer 15% / govt 85% (90:10 for
/// Uttarakhand), region ceilings, cattle-unit cap. Mirrors
/// app/app/pashu-quote.tsx, plus the term selector (1/2/3-yr) and
/// centre:state subsidy split the prototype specifies (RN bakes term into
/// the plan and never shows the centre:state breakdown).
class PashuQuoteScreen extends ConsumerStatefulWidget {
  const PashuQuoteScreen({super.key, this.animalId});

  final String? animalId;

  @override
  ConsumerState<PashuQuoteScreen> createState() => _PashuQuoteScreenState();
}

class _PashuQuoteScreenState extends ConsumerState<PashuQuoteScreen> {
  List<Map> _plans = [];
  String? _planCode;
  final _marketValueCtrl = TextEditingController(text: '60000');
  int _term = 36;
  Map? _quote;
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _loadPlans();
  }

  @override
  void dispose() {
    _marketValueCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadPlans() async {
    final res = await ref.read(insuranceApiProvider).getPlans();
    if (res['success'] == true) {
      final list = List<Map>.from(res['data'] ?? []);
      if (list.isNotEmpty) {
        setState(() {
          _plans = list;
          _planCode = list.first['plan_code'].toString();
        });
        await _getQuote();
      }
    }
  }

  Future<void> _getQuote() async {
    final code = _planCode;
    final val = num.tryParse(_marketValueCtrl.text.trim());
    if (code == null || val == null || val <= 0) {
      setState(() => _quote = null);
      return;
    }
    setState(() => _loading = true);
    try {
      final res = await ref.read(insuranceApiProvider).quote(
        planCode: code,
        marketValue: val,
        termMonths: _term,
      );
      setState(() => _quote = res['success'] == true ? res['data'] : null);
    } catch (_) {
      setState(() => _quote = null);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final termLabel = {12: l10n.pashuQuoteTerm12, 24: l10n.pashuQuoteTerm24, 36: l10n.pashuQuoteTerm36};

    return Scaffold(
      appBar: AppBar(title: Text(l10n.pashuActQuote)),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          AppCard(
            title: l10n.pashuQuoteChoosePlan,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final p in _plans)
                      _chip(
                        (p['species'] ?? '').toString(),
                        _planCode == p['plan_code'],
                        () {
                          setState(() => _planCode = p['plan_code'].toString());
                          _getQuote();
                        },
                      ),
                  ],
                ),
                const SizedBox(height: 12),
                Text(l10n.pashuQuoteTermLabel, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.ink)),
                const SizedBox(height: 6),
                Row(
                  children: [
                    for (final t in _terms)
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: _chip(termLabel[t]!, _term == t, () {
                          setState(() => _term = t);
                          _getQuote();
                        }),
                      ),
                  ],
                ),
                const SizedBox(height: 12),
                Text(l10n.pashuQuoteMarketValue, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.ink)),
                const SizedBox(height: 6),
                TextField(
                  controller: _marketValueCtrl,
                  keyboardType: TextInputType.number,
                  onSubmitted: (_) => _getQuote(),
                  onEditingComplete: _getQuote,
                ),
                const SizedBox(height: 6),
                Text(l10n.pashuQuoteRegionNote, style: const TextStyle(color: AppColors.muted, fontSize: 12)),
              ],
            ),
          ),

          if (_loading) const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator())),

          if (_quote != null && !_loading) ...[
            AppCard(
              title: '${l10n.pashuQuotePremiumPre} (${_quote?['termMonths']}-${l10n.pashuQuoteMonthTerm} ${_quote?['statutoryCeilingPct']}%)',
              child: Column(
                children: [
                  _row(l10n.pashuQuoteSumInsured, formatRupees(_quote?['sumInsured'])),
                  _row(l10n.pashuQuoteTotalPremium, formatRupees(_quote?['premiumTotal'])),
                  _row(l10n.pashuQuoteYouPay15, formatRupees(_quote?['farmerShare']), strong: true),
                  _row(l10n.pashuQuoteGovt85, formatRupees(_quote?['govtShare'])),
                  if (_quote?['govtCentre'] != null)
                    _row(l10n.pashuQuoteGovtCentre, formatRupees(_quote?['govtCentre']), sub: true),
                  if (_quote?['govtState'] != null)
                    _row(l10n.pashuQuoteGovtState, formatRupees(_quote?['govtState']), sub: true),
                  const SizedBox(height: 6),
                  Text(
                    '${l10n.pashuQuoteCuCap} ${(_quote?['cu'] as Map?)?['cap']} · ${l10n.pashuQuoteCuUsing} ${(_quote?['cu'] as Map?)?['total']}',
                    style: const TextStyle(color: AppColors.muted, fontSize: 12),
                  ),
                ],
              ),
            ),
            ElevatedButton(
              onPressed: () => context.push(
                '/pashu-enrol?planCode=$_planCode&marketValue=${_marketValueCtrl.text.trim()}'
                '${widget.animalId != null ? '&animalId=${widget.animalId}' : ''}',
              ),
              child: Text(l10n.pashuQuoteInsureThis),
            ),
          ],
        ],
      ),
    );
  }

  Widget _chip(String label, bool selected, VoidCallback onTap) {
    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          color: selected ? AppColors.accent : Colors.transparent,
          border: Border.all(color: selected ? AppColors.brand : AppColors.line),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 13,
            fontWeight: selected ? FontWeight.w700 : FontWeight.w400,
            color: selected ? AppColors.brandDark : AppColors.muted,
          ),
        ),
      ),
    );
  }

  Widget _row(String label, String value, {bool strong = false, bool sub = false}) {
    return Padding(
      padding: EdgeInsets.only(left: sub ? 12 : 0, top: 6, bottom: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: TextStyle(fontSize: sub ? 12 : 14, color: sub ? AppColors.muted : AppColors.ink),
          ),
          Text(
            value,
            style: TextStyle(
              fontSize: sub ? 12 : 14,
              fontWeight: strong ? FontWeight.w800 : FontWeight.w600,
              color: strong ? AppColors.brandDark : (sub ? AppColors.muted : AppColors.ink),
            ),
          ),
        ],
      ),
    );
  }
}
