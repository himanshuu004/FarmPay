import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../design_system/tokens.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../providers/cia_providers.dart';

/// CIA — non-binding eligibility check for one scheme. Advisory only,
/// NEVER a sanction (only the DCS board + bank decide). Mirrors
/// app/app/cia-eligibility.tsx. Wired to GET /cattle-induction/eligibility?scheme=.
class CiaEligibilityScreen extends ConsumerStatefulWidget {
  const CiaEligibilityScreen({super.key, this.schemeVersion});

  final String? schemeVersion;

  @override
  ConsumerState<CiaEligibilityScreen> createState() => _CiaEligibilityScreenState();
}

class _CiaEligibilityScreenState extends ConsumerState<CiaEligibilityScreen> {
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
      final res = await ref.read(ciaApiProvider).checkEligibility(scheme: widget.schemeVersion);
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
    final data = _data;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.ciaNavEligibility)),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : data != null && data['isMember'] == false
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(28),
                child: Text(
                  l10n.ciaEligLinkMembership,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: AppColors.muted),
                ),
              ),
            )
          : data == null
          ? Center(child: Text(l10n.ciaLoadError, style: const TextStyle(color: AppColors.muted)))
          : _body(l10n, data),
    );
  }

  Widget _body(AppLocalizations l10n, Map data) {
    final eligible = data['likelyEligible'] == true;
    final version = (data['schemeVersion'] ?? widget.schemeVersion ?? '').toString();
    final reasons = List<String>.from((data['reasons'] ?? []).map((e) => e.toString()));
    final checks = List<Map>.from(data['checks'] ?? []);

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        Container(
          padding: const EdgeInsets.all(11),
          margin: const EdgeInsets.only(bottom: 12),
          decoration: BoxDecoration(color: AppColors.accent, borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFCFE8DA))),
          child: Row(
            children: [
              Expanded(
                child: Text.rich(
                  TextSpan(
                    style: const TextStyle(fontSize: 13, color: AppColors.ink),
                    children: [
                      TextSpan(text: '${l10n.ciaEligCheckingFor} '),
                      TextSpan(text: version, style: const TextStyle(color: AppColors.brandDark, fontWeight: FontWeight.w700)),
                    ],
                  ),
                ),
              ),
              TextButton(
                onPressed: () => context.push('/cia-schemes'),
                child: Text(l10n.ciaEligChange, style: const TextStyle(color: AppColors.brandDark, fontWeight: FontWeight.w800)),
              ),
            ],
          ),
        ),
        Container(
          padding: const EdgeInsets.all(16),
          margin: const EdgeInsets.only(bottom: 14),
          decoration: BoxDecoration(
            color: eligible ? const Color(0xFFE9F8EF) : AppColors.warnAmberBg,
            border: Border.all(color: eligible ? const Color(0xFFBFE3CF) : const Color(0xFFF3E2C8)),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                eligible ? '✓ ${l10n.ciaEligLikely}' : l10n.ciaEligNotYet,
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: eligible ? AppColors.brandDark : AppColors.warnAmber),
              ),
              const SizedBox(height: 4),
              Text(
                eligible ? l10n.ciaEligLikelySub : reasons.join(' · '),
                style: const TextStyle(fontSize: 13, color: AppColors.muted),
              ),
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.card,
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: AppColors.line),
                ),
                child: Text(
                  '⚖ ${l10n.ciaEligGuide}',
                  style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AppColors.muted),
                ),
              ),
            ],
          ),
        ),
        for (final c in checks) _checkRow(c),
        const SizedBox(height: 14),
        ElevatedButton(
          onPressed: () => context.push('/cia-eoi?scheme=${Uri.encodeComponent(version)}'),
          child: Text(l10n.ciaEligExpress),
        ),
      ],
    );
  }

  Widget _checkRow(Map c) {
    final ok = c['ok'] == true;
    return Container(
      padding: const EdgeInsets.all(11),
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.line),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Container(
            width: 30,
            height: 30,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: ok ? const Color(0xFFD8F0E1) : AppColors.dangerBg,
              shape: BoxShape.circle,
            ),
            child: Text(
              ok ? '✓' : '✕',
              style: TextStyle(fontWeight: FontWeight.w800, color: ok ? AppColors.brandDark : AppColors.danger),
            ),
          ),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text((c['label'] ?? '').toString(), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                Text((c['detail'] ?? '').toString(), style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(color: AppColors.blueBg, borderRadius: BorderRadius.circular(999)),
            child: Text(
              (c['src'] ?? '').toString(),
              style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: AppColors.blue),
            ),
          ),
        ],
      ),
    );
  }
}
