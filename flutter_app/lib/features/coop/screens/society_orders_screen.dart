import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/api_response.dart';
import '../../../design_system/tokens.dart';
import '../../../design_system/widgets/app_card.dart';
import '../../../design_system/widgets/status_chip.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../providers/coop_providers.dart';
import '../widgets/society_join_nudge_card.dart';

/// Mirrors CLAUDE.md's Coop input order state machine exactly — no
/// UI-only states. All statuses after SUBMITTED are ERP-authored; the app
/// only ever transitions DRAFT→SUBMITTED (society_order_screen.dart) and
/// DISPATCHED→RECEIPT_CONFIRMED (this screen).
const _flow = [
  'SUBMITTED',
  'SECRETARY_APPROVED',
  'SUPERVISOR_APPROVED',
  'DUSS_PROCESSING',
  'DISPATCHED',
  'RECEIPT_CONFIRMED',
];

String _statusLabel(AppLocalizations l10n, String status) {
  switch (status) {
    case 'DRAFT':
      return l10n.socStatusDraft;
    case 'SUBMITTED':
      return l10n.socStatusSubmitted;
    case 'SECRETARY_APPROVED':
      return l10n.socStatusSecretaryApproved;
    case 'SUPERVISOR_APPROVED':
      return l10n.socStatusSupervisorApproved;
    case 'DUSS_PROCESSING':
      return l10n.socStatusProcessing;
    case 'DISPATCHED':
      return l10n.socStatusDispatched;
    case 'RECEIPT_CONFIRMED':
      return l10n.socStatusReceived;
    case 'REJECTED':
      return l10n.socStatusRejected;
    default:
      return status;
  }
}

class SocietyOrdersScreen extends ConsumerStatefulWidget {
  const SocietyOrdersScreen({super.key});

  @override
  ConsumerState<SocietyOrdersScreen> createState() =>
      _SocietyOrdersScreenState();
}

class _SocietyOrdersScreenState extends ConsumerState<SocietyOrdersScreen> {
  bool _loading = true;
  List<Map> _orders = [];
  Map? _nudge; // non-null only when the caller isn't a linked member
  Set<String> _pendingReceiptUuids = {};
  String? _busyUuid;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    // Retry any receipt confirmations queued while offline before refreshing.
    await ref.read(coopOfflineSyncProvider).flush();
    try {
      final res = await ref.read(coopApiProvider).listOrders();
      if (res['success'] == true) {
        final data = res['data'];
        // Non-members get the same {isMember:false, nudge} shape as
        // /coop/passbook, not an array — never cast blindly.
        if (data is Map && data['isMember'] == false) {
          setState(() {
            _nudge = data['nudge'] as Map?;
            _orders = [];
          });
        } else if (data is List) {
          setState(() {
            _orders = List<Map>.from(data);
            _nudge = null;
          });
        }
      }
    } catch (_) {
      // offline-tolerant: keep showing the last-loaded list
    }
    final pending = await ref.read(coopOfflineSyncProvider).pendingOrderUuids();
    if (mounted) {
      setState(() {
        _pendingReceiptUuids = pending.toSet();
        _loading = false;
      });
    }
  }

  Future<void> _confirmReceipt(String orderUuid) async {
    final l10n = AppLocalizations.of(context);
    setState(() => _busyUuid = orderUuid);
    try {
      final res = await ref.read(coopApiProvider).confirmReceipt(orderUuid);
      if (res['success'] == true) {
        _showSnack(l10n.socReceiptConfirmedMsg);
        await _load();
      } else {
        _showSnack(
          apiErrorMessage(res, fallback: l10n.socNotConfirmedTitle),
          error: true,
        );
      }
    } catch (_) {
      // No connection — queue locally and retry automatically on next load
      // or connectivity regain, per the offline-first hard requirement.
      await ref.read(coopOfflineSyncProvider).enqueue(orderUuid);
      setState(
        () => _pendingReceiptUuids = {..._pendingReceiptUuids, orderUuid},
      );
      _showSnack(l10n.socQueuedOfflineMsg);
    } finally {
      if (mounted) setState(() => _busyUuid = null);
    }
  }

  void _showSnack(String message, {bool error = false}) {
    if (!mounted) return;
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
        appBar: AppBar(title: Text(l10n.socMyOrders)),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    if (_nudge != null) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.socMyOrders)),
        body: RefreshIndicator(
          onRefresh: _load,
          child: ListView(
            padding: const EdgeInsets.all(AppSpacing.lg),
            children: [SocietyJoinNudgeCard(nudge: _nudge)],
          ),
        ),
      );
    }

    if (_orders.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.socMyOrders)),
        body: RefreshIndicator(
          onRefresh: _load,
          child: ListView(
            children: [
              SizedBox(
                height: 400,
                child: Center(
                  child: Text(
                    l10n.socNoOrders,
                    style: const TextStyle(color: AppColors.muted),
                  ),
                ),
              ),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: Text(l10n.socMyOrders)),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(AppSpacing.lg),
          children: [for (final o in _orders) _orderCard(l10n, o)],
        ),
      ),
    );
  }

  Widget _orderCard(AppLocalizations l10n, Map o) {
    final status = o['status'] as String;
    final orderUuid = o['order_uuid'] as String;
    final rejected = status == 'REJECTED';
    final idx = _flow.indexOf(status);
    final items = (o['items'] as List?) ?? const [];
    final pendingLocalConfirm = _pendingReceiptUuids.contains(orderUuid);

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                formatRupees(o['total_amount'] as num?),
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                  color: AppColors.brandDark,
                ),
              ),
              StatusChip(
                label: pendingLocalConfirm
                    ? l10n.socQueuedOfflineTitle
                    : _statusLabel(l10n, status),
                tone: rejected
                    ? StatusTone.danger
                    : pendingLocalConfirm
                    ? StatusTone.warn
                    : StatusTone.brand,
              ),
            ],
          ),
          for (final it in items)
            Text(
              '${it['quantity']} × ${it['name']}',
              style: const TextStyle(color: AppColors.muted, fontSize: 13),
            ),
          if (!rejected) ...[
            const SizedBox(height: AppSpacing.md),
            for (var i = 0; i < _flow.length; i++)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Row(
                  children: [
                    Container(
                      width: 11,
                      height: 11,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: i <= idx ? AppColors.brand : AppColors.line,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      _statusLabel(l10n, _flow[i]),
                      style: TextStyle(
                        fontSize: 13,
                        color: i == idx ? AppColors.brandDark : AppColors.muted,
                        fontWeight: i == idx
                            ? FontWeight.w700
                            : FontWeight.w400,
                      ),
                    ),
                  ],
                ),
              ),
          ],
          if (status == 'DISPATCHED' || pendingLocalConfirm) ...[
            const SizedBox(height: AppSpacing.md),
            ElevatedButton(
              onPressed: _busyUuid == orderUuid || pendingLocalConfirm
                  ? null
                  : () => _confirmReceipt(orderUuid),
              child: _busyUuid == orderUuid
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : Text(
                      pendingLocalConfirm
                          ? l10n.socQueuedOfflineTitle
                          : l10n.socConfirmReceipt,
                    ),
            ),
          ],
        ],
      ),
    );
  }
}
