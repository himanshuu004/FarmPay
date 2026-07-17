import '../../../core/offline/offline_queue_db.dart';
import '../api/coop_api.dart';

/// Statuses a retried receipt-confirm can land in — mirrors the CLAUDE.md
/// offline-queue state machine (QUEUED_LOCAL → SYNCING → SYNCED | CONFLICT)
/// at the granularity this direct-endpoint path actually has.
enum ReceiptSyncOutcome { synced, stillOffline, conflict }

/// Queues + retries coop receipt confirmations locally. See
/// offline_queue_db.dart's CoopPendingReceipts doc comment for why this
/// bypasses the generic /api/v1/sync queue.
class CoopOfflineSync {
  CoopOfflineSync(this._db, this._api);

  final OfflineQueueDb _db;
  final CoopApi _api;

  Future<void> enqueue(String orderUuid) async {
    await _db
        .into(_db.coopPendingReceipts)
        .insertOnConflictUpdate(
          CoopPendingReceiptsCompanion.insert(
            orderUuid: orderUuid,
            queuedAt: DateTime.now().toIso8601String(),
          ),
        );
  }

  Future<List<String>> pendingOrderUuids() async {
    final rows = await _db.select(_db.coopPendingReceipts).get();
    return rows.map((r) => r.orderUuid).toList();
  }

  /// Retries every queued receipt confirmation. Returns the set of order
  /// UUIDs that changed state (synced or conflicted) so the caller can
  /// refresh its order list / notify the farmer.
  Future<Map<String, ReceiptSyncOutcome>> flush() async {
    final pending = await pendingOrderUuids();
    final outcomes = <String, ReceiptSyncOutcome>{};
    for (final orderUuid in pending) {
      try {
        final res = await _api.confirmReceipt(orderUuid);
        if (res['success'] == true) {
          await _remove(orderUuid);
          outcomes[orderUuid] = ReceiptSyncOutcome.synced;
        } else {
          final code = res['errorCode'];
          if (code == 'COOP_ORDER_BAD_STATE') {
            // Already confirmed (by this device earlier, or the ERP moved it
            // on) — server-wins: drop the local intent, don't keep retrying.
            await _remove(orderUuid);
            outcomes[orderUuid] = ReceiptSyncOutcome.conflict;
          }
          // Other failures (e.g. not yet DISPATCHED) stay queued for retry.
        }
      } catch (_) {
        outcomes[orderUuid] = ReceiptSyncOutcome.stillOffline;
      }
    }
    return outcomes;
  }

  Future<void> _remove(String orderUuid) async {
    await (_db.delete(
      _db.coopPendingReceipts,
    )..where((t) => t.orderUuid.equals(orderUuid))).go();
  }
}
