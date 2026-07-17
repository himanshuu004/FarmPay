import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../design_system/tokens.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../providers/cia_providers.dart';

/// CIA — express interest in a scheme (society-mediated, ★ farmer-authored).
/// One tap shares the request with the DCS secretary → PENDING_DCS_REVIEW.
/// Idempotent per scheme. Mirrors app/app/cia-eoi.tsx.
class CiaEoiScreen extends ConsumerStatefulWidget {
  const CiaEoiScreen({super.key, this.schemeVersion});

  final String? schemeVersion;

  @override
  ConsumerState<CiaEoiScreen> createState() => _CiaEoiScreenState();
}

class _CiaEoiScreenState extends ConsumerState<CiaEoiScreen> {
  bool _loading = true;
  bool _submitting = false;
  String _title = '';
  Map? _done;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final v = widget.schemeVersion;
      if (v != null) {
        final res = await ref.read(ciaApiProvider).getScheme(v);
        setState(() => _title = res['success'] == true ? (res['data']['title'] ?? v).toString() : v);
      }
    } catch (_) {
      setState(() => _title = widget.schemeVersion ?? '');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _submit() async {
    final v = widget.schemeVersion;
    if (v == null || _submitting) return;
    setState(() => _submitting = true);
    try {
      final res = await ref.read(ciaApiProvider).expressInterest(v);
      if (res['success'] == true) {
        setState(() => _done = Map.from(res['data']));
      } else if (mounted) {
        _showError(AppLocalizations.of(context).ciaLoadError);
      }
    } catch (_) {
      if (mounted) _showError(AppLocalizations.of(context).ciaLoadError);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _showError(String msg) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.ciaNavEoi)),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _done != null
          ? _successBody(l10n)
          : _confirmBody(l10n),
    );
  }

  Widget _confirmBody(AppLocalizations l10n) => ListView(
    padding: const EdgeInsets.all(24),
    children: [
      const Text('🐄', style: TextStyle(fontSize: 52), textAlign: TextAlign.center),
      const SizedBox(height: 4),
      Text(
        '${l10n.ciaEoiJoin} $_title?',
        textAlign: TextAlign.center,
        style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.ink),
      ),
      const SizedBox(height: 6),
      Text(
        l10n.ciaEoiTellSociety,
        textAlign: TextAlign.center,
        style: const TextStyle(fontSize: 14, color: AppColors.muted, height: 1.4),
      ),
      const SizedBox(height: 16),
      Container(
        decoration: BoxDecoration(
          color: AppColors.card,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.line),
        ),
        child: Column(
          children: [
            _row(l10n.ciaEoiScheme, _title, border: true),
            _row(l10n.ciaEoiSharedWith, l10n.ciaEoiSecretary, border: false),
          ],
        ),
      ),
      const SizedBox(height: 16),
      Text(
        '★ ${l10n.ciaEoiYouAuthor}',
        textAlign: TextAlign.center,
        style: const TextStyle(fontSize: 12, color: AppColors.muted),
      ),
      const SizedBox(height: 16),
      ElevatedButton(
        onPressed: _submitting ? null : _submit,
        child: _submitting
            ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
            : Text(l10n.ciaEoiSubmit),
      ),
    ],
  );

  Widget _successBody(AppLocalizations l10n) => ListView(
    padding: const EdgeInsets.all(24),
    children: [
      const Text('✅', style: TextStyle(fontSize: 52), textAlign: TextAlign.center),
      const SizedBox(height: 4),
      Text(
        l10n.ciaEoiSharedOk,
        textAlign: TextAlign.center,
        style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.ink),
      ),
      const SizedBox(height: 6),
      Text(
        l10n.ciaEoiBoardReview,
        textAlign: TextAlign.center,
        style: const TextStyle(fontSize: 14, color: AppColors.muted, height: 1.4),
      ),
      const SizedBox(height: 16),
      Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: const Color(0xFFE9F8EF),
          border: Border.all(color: const Color(0xFFBFE3CF)),
          borderRadius: BorderRadius.circular(14),
        ),
        alignment: Alignment.center,
        child: Column(
          children: [
            Text(_title, style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.ink), textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
              decoration: BoxDecoration(color: const Color(0xFFD8F0E1), borderRadius: BorderRadius.circular(999)),
              child: Text(
                l10n.ciaEoiStatusSubmitted.toUpperCase(),
                style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AppColors.brandDark),
              ),
            ),
          ],
        ),
      ),
      const SizedBox(height: 16),
      ElevatedButton(
        onPressed: () => context.pushReplacement('/cia-status'),
        child: Text(l10n.ciaEoiTrack),
      ),
      const SizedBox(height: 8),
      TextButton(
        onPressed: () => context.pushReplacement('/cia-schemes'),
        child: Text(l10n.ciaEoiDone),
      ),
    ],
  );

  Widget _row(String label, String value, {required bool border}) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      border: border ? const Border(bottom: BorderSide(color: Color(0xFFF2F2F2))) : null,
    ),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: const TextStyle(color: AppColors.muted, fontSize: 14)),
        Flexible(
          child: Text(
            value,
            textAlign: TextAlign.right,
            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: AppColors.ink),
          ),
        ),
      ],
    ),
  );
}
