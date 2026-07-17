import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../design_system/tokens.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../providers/cia_providers.dart';

/// CIA — grievances (PRD Part 6 screen #21 / Part 14B category ladder).
/// No RN precedent and no HTML prototype exist for this screen — the
/// backend routes (POST/GET /cattle-induction/grievances) were fully built
/// but RN never wired a client for them. Built fresh here, following the
/// same list+raise pattern used elsewhere in the app (claims/coop orders),
/// since CLAUDE.md requires every grievance be farmer-visible with status
/// and never silently closed.
class CiaGrievanceScreen extends ConsumerStatefulWidget {
  const CiaGrievanceScreen({super.key, this.appUuid});

  final String? appUuid;

  @override
  ConsumerState<CiaGrievanceScreen> createState() => _CiaGrievanceScreenState();
}

const _kCategories = [
  'not_selected',
  'cattle_rejected',
  'payment_delay',
  'emi_wrong',
  'already_repaid',
  'eartag_loss',
  'transport_dispute',
  'other',
];

class _CiaGrievanceScreenState extends ConsumerState<CiaGrievanceScreen> {
  bool _loading = true;
  List<Map> _mine = [];
  String _category = _kCategories.first;
  final _descCtrl = TextEditingController();
  bool _submitting = false;

  @override
  void dispose() {
    _descCtrl.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await ref.read(ciaApiProvider).listMyGrievances();
      setState(() => _mine = res['success'] == true ? List<Map>.from(res['data'] ?? []) : []);
    } catch (_) {
      // list is best-effort; the raise form still works
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context);
    setState(() => _submitting = true);
    try {
      final res = await ref.read(ciaApiProvider).raiseGrievance(
        category: _category,
        description: _descCtrl.text.trim(),
        applicationUuid: widget.appUuid,
      );
      if (res['success'] == true) {
        _descCtrl.clear();
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.ciaGrievanceFiled)));
        await _load();
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text((res['message'] ?? l10n.ciaLoadError).toString()), backgroundColor: AppColors.danger));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  String _categoryLabel(AppLocalizations l10n, String key) {
    switch (key) {
      case 'not_selected':
        return l10n.ciaGrievanceCatNotSelected;
      case 'cattle_rejected':
        return l10n.ciaGrievanceCatCattleRejected;
      case 'payment_delay':
        return l10n.ciaGrievanceCatPaymentDelay;
      case 'emi_wrong':
        return l10n.ciaGrievanceCatEmiWrong;
      case 'already_repaid':
        return l10n.ciaGrievanceCatAlreadyRepaid;
      case 'eartag_loss':
        return l10n.ciaGrievanceCatEartagLoss;
      case 'transport_dispute':
        return l10n.ciaGrievanceCatTransportDispute;
      default:
        return l10n.ciaGrievanceCatOther;
    }
  }

  ({String label, Color color, Color bg}) _statusStyle(AppLocalizations l10n, String status) {
    switch (status) {
      case 'ack':
        return (label: l10n.ciaGrievanceStAck, color: AppColors.blue, bg: AppColors.blueBg);
      case 'in_progress':
        return (label: l10n.ciaGrievanceStInProgress, color: AppColors.warnAmber, bg: AppColors.warnAmberBg);
      case 'resolved':
        return (label: l10n.ciaGrievanceStResolved, color: AppColors.brandDark, bg: const Color(0xFFE9F8EF));
      case 'escalated':
        return (label: l10n.ciaGrievanceStEscalated, color: AppColors.danger, bg: AppColors.dangerBg);
      default:
        return (label: l10n.ciaGrievanceStOpen, color: AppColors.muted, bg: AppColors.line);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.ciaNavGrievance)),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(AppSpacing.lg),
              children: [
                Text(l10n.ciaGrievanceRaiseTitle, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.ink)),
                const SizedBox(height: 6),
                Text(l10n.ciaGrievanceRaiseSub, style: const TextStyle(fontSize: 13, color: AppColors.muted, height: 1.35)),
                const SizedBox(height: 16),
                Text(l10n.ciaGrievanceCategory, style: const TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final c in _kCategories) _catChip(c, l10n),
                  ],
                ),
                const SizedBox(height: 14),
                Text(l10n.ciaGrievanceDescription, style: const TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 6),
                TextField(
                  controller: _descCtrl,
                  maxLines: 3,
                  decoration: InputDecoration(hintText: l10n.ciaGrievanceDescriptionPh),
                ),
                const SizedBox(height: 14),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _submitting ? null : _submit,
                    child: _submitting
                        ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : Text(l10n.ciaGrievanceSubmit),
                  ),
                ),
                const SizedBox(height: 24),
                Text(
                  l10n.ciaGrievanceMine.toUpperCase(),
                  style: const TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w800, letterSpacing: 0.5),
                ),
                const SizedBox(height: 10),
                if (_mine.isEmpty)
                  Text(l10n.ciaGrievanceNone, style: const TextStyle(color: AppColors.muted))
                else
                  for (final g in _mine) _grievanceRow(l10n, g),
              ],
            ),
    );
  }

  Widget _catChip(String key, AppLocalizations l10n) {
    final on = _category == key;
    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: () => setState(() => _category = key),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
        decoration: BoxDecoration(
          color: on ? AppColors.accent : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: on ? AppColors.brand : AppColors.line),
        ),
        child: Text(
          _categoryLabel(l10n, key),
          style: TextStyle(fontSize: 13, fontWeight: on ? FontWeight.w700 : FontWeight.w400, color: on ? AppColors.brandDark : AppColors.muted),
        ),
      ),
    );
  }

  Widget _grievanceRow(AppLocalizations l10n, Map g) {
    final status = (g['status'] ?? 'open').toString();
    final style = _statusStyle(l10n, status);
    return Container(
      padding: const EdgeInsets.all(12),
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.line)),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(_categoryLabel(l10n, (g['category'] ?? 'other').toString()), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
                if ((g['description'] ?? '').toString().isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text((g['description']).toString(), style: const TextStyle(fontSize: 12, color: AppColors.muted), maxLines: 2, overflow: TextOverflow.ellipsis),
                  ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(color: style.bg, borderRadius: BorderRadius.circular(999)),
            child: Text(style.label, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: style.color)),
          ),
        ],
      ),
    );
  }
}
