import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_client.dart';
import '../../../design_system/tokens.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../models/cia_status.dart' show ciaDocIcon;
import '../providers/cia_providers.dart';

/// CIA — one scheme's detail (terms + document checklist), read-only.
/// Mirrors app/app/cia-scheme.tsx. Wired to GET /cattle-induction/schemes/:version.
class CiaSchemeScreen extends ConsumerStatefulWidget {
  const CiaSchemeScreen({super.key, required this.schemeVersion});

  final String schemeVersion;

  @override
  ConsumerState<CiaSchemeScreen> createState() => _CiaSchemeScreenState();
}

class _CiaSchemeScreenState extends ConsumerState<CiaSchemeScreen> {
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
      final res = await ref.read(ciaApiProvider).getScheme(widget.schemeVersion);
      setState(() => _data = res['success'] == true ? Map.from(res['data']) : null);
    } catch (_) {
      setState(() => _data = null);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.ciaNavScheme)),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _data == null
          ? Center(child: Text(l10n.ciaLoadError, style: const TextStyle(color: AppColors.muted)))
          : _body(l10n, _data!),
    );
  }

  Widget _body(AppLocalizations l10n, Map data) {
    final r = Map.from(data['rules'] ?? {});
    final docs = List<Map>.from(data['documentChecklist'] ?? []);
    final version = data['schemeVersion'].toString();

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: AppColors.brandDark, borderRadius: BorderRadius.circular(16)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                (data['title'] ?? version).toString(),
                style: const TextStyle(color: Colors.white, fontSize: 19, fontWeight: FontWeight.w800, height: 1.3),
              ),
              const SizedBox(height: 8),
              Text(version, style: const TextStyle(color: Color(0xFFCDEEDA), fontSize: 11, fontWeight: FontWeight.w700)),
            ],
          ),
        ),
        const SizedBox(height: 18),
        _sectionLabel(l10n.ciaSchemeWhatYouGet),
        Wrap(
          spacing: 9,
          runSpacing: 9,
          children: [
            _fact('${r['subsidyPct'] ?? '—'}%', l10n.ciaSchemeSubsidyOnAnimal),
            _fact('${r['beneficiaryContributionPct'] ?? '—'}%', l10n.ciaSchemeYourContribution),
            _fact(formatRupees(r['priceCeiling']), l10n.ciaSchemePriceCeiling),
            _fact('${l10n.ciaSchemeUpTo} ${r['maxCattlePerBeneficiary'] ?? '—'}', l10n.ciaSchemePerMember),
          ],
        ),
        const SizedBox(height: 14),
        _sectionLabel(l10n.ciaSchemeWhoCanApply),
        Wrap(
          spacing: 9,
          runSpacing: 9,
          children: [
            _fact('${r['minMembershipMonths'] ?? 0} ${l10n.ciaSchemeMonths}', l10n.ciaSchemeMinMembership),
            _fact('${formatRupees(r['minAvgMonthlyMilkValue'])}+', l10n.ciaSchemeMinMilk),
          ],
        ),
        const SizedBox(height: 14),
        _sectionLabel(l10n.ciaSchemeWhatNeeded),
        for (final d in docs) _docRow(d),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: ElevatedButton(
                onPressed: () => context.push('/cia-eligibility?scheme=${Uri.encodeComponent(version)}'),
                child: Text(l10n.ciaSchemeCheckEligibility),
              ),
            ),
            const SizedBox(width: 8),
            OutlinedButton(
              onPressed: () => context.push('/cia-eoi?scheme=${Uri.encodeComponent(version)}'),
              child: Text(l10n.ciaSchemeInterested),
            ),
          ],
        ),
      ],
    );
  }

  Widget _sectionLabel(String text) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Text(
      text.toUpperCase(),
      style: const TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w800, letterSpacing: 0.5),
    ),
  );

  Widget _fact(String value, String label) => Container(
    width: 160,
    padding: const EdgeInsets.all(11),
    decoration: BoxDecoration(
      color: AppColors.card,
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: AppColors.line),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(value, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.brandDark)),
        const SizedBox(height: 2),
        Text(
          label.toUpperCase(),
          style: const TextStyle(fontSize: 11, color: AppColors.muted, fontWeight: FontWeight.w700),
        ),
      ],
    ),
  );

  Widget _docRow(Map d) {
    final required = (d['required'] ?? 'MANDATORY').toString();
    final optional = required == 'OPTIONAL';
    return Container(
      padding: const EdgeInsets.all(10),
      margin: const EdgeInsets.only(bottom: 7),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(11),
        border: Border.all(color: AppColors.line),
      ),
      child: Row(
        children: [
          Text(ciaDocIcon(d['key'].toString()), style: const TextStyle(fontSize: 18)),
          const SizedBox(width: 10),
          Expanded(
            child: Text((d['label'] ?? d['key']).toString(), style: const TextStyle(fontWeight: FontWeight.w600)),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
            decoration: BoxDecoration(
              color: optional ? AppColors.blueBg : AppColors.dangerBg,
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              required,
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w800,
                color: optional ? AppColors.blue : AppColors.danger,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
