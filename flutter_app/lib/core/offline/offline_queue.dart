import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../api/api_client.dart';
import 'offline_queue_db.dart';

enum SyncStatus { queuedLocal, syncing, synced, conflict, failed }

SyncStatus _statusFromString(String s) => SyncStatus.values.firstWhere(
  (v) => v.name == _camel(s),
  orElse: () => SyncStatus.failed,
);

String _camel(String enumWireValue) {
  // QUEUED_LOCAL -> queuedLocal
  final parts = enumWireValue.toLowerCase().split('_');
  return parts.first +
      parts.skip(1).map((w) => w[0].toUpperCase() + w.substring(1)).join();
}

String _wire(SyncStatus s) {
  switch (s) {
    case SyncStatus.queuedLocal:
      return 'QUEUED_LOCAL';
    case SyncStatus.syncing:
      return 'SYNCING';
    case SyncStatus.synced:
      return 'SYNCED';
    case SyncStatus.conflict:
      return 'CONFLICT';
    case SyncStatus.failed:
      return 'FAILED';
  }
}

class QueuedOp {
  QueuedOp({
    required this.opUuid,
    required this.entityType,
    this.entityRef,
    required this.action,
    required this.payload,
    required this.clientTs,
    required this.status,
  });

  final String opUuid;
  final String entityType;
  final String? entityRef;
  final String action;
  final Map<String, dynamic> payload;
  final String clientTs;
  final SyncStatus status;
}

/// Local write queue: farmer app writes here FIRST with no signal, then
/// flushes to POST /api/v1/sync when connectivity returns. Mirrors
/// app/lib/offlineQueue.ts's OfflineQueue class 1:1, backed by drift/SQLite
/// instead of AsyncStorage/JSON blob, and the server is the same idempotent
/// (op_uuid), server-wins offlineSyncService.
class OfflineQueue {
  OfflineQueue(this._db, this._api);

  final OfflineQueueDb _db;
  final ApiClient _api;
  static const _uuid = Uuid();

  /// Enqueue a write locally. Works with no signal — never throws on
  /// network failure since it never touches the network.
  Future<QueuedOp> enqueue({
    required String entityType,
    String? entityRef,
    required String action,
    required Map<String, dynamic> payload,
  }) async {
    final op = QueueOpsCompanion.insert(
      opUuid: _uuid.v4(),
      entityType: entityType,
      entityRef: Value(entityRef),
      action: action,
      payloadJson: jsonEncode(payload),
      clientTs: DateTime.now().toIso8601String(),
      status: _wire(SyncStatus.queuedLocal),
    );
    await _db.into(_db.queueOps).insert(op);
    return QueuedOp(
      opUuid: op.opUuid.value,
      entityType: entityType,
      entityRef: entityRef,
      action: action,
      payload: payload,
      clientTs: op.clientTs.value,
      status: SyncStatus.queuedLocal,
    );
  }

  Future<List<QueueOp>> pending() =>
      (_db.select(_db.queueOps)..where(
            (t) => t.status.isIn([
              _wire(SyncStatus.queuedLocal),
              _wire(SyncStatus.failed),
            ]),
          ))
          .get();

  /// Flush pending ops to the server. Safe to call repeatedly (idempotent
  /// via op_uuid on the server). Conflicts are surfaced (never silently
  /// overwritten) so callers can notify the farmer per CLAUDE.md's
  /// "server-wins + farmer notify" offline queue state machine.
  Future<List<String>> flush() async {
    final pendingOps = await pending();
    if (pendingOps.isEmpty) return [];

    for (final op in pendingOps) {
      await (_db.update(_db.queueOps)..where((t) => t.opUuid.equals(op.opUuid)))
          .write(QueueOpsCompanion(status: Value(_wire(SyncStatus.syncing))));
    }

    final conflictedIds = <String>[];
    try {
      final body = {
        'ops': pendingOps
            .map(
              (o) => {
                'opUuid': o.opUuid,
                'entityType': o.entityType,
                'entityRef': o.entityRef,
                'action': o.action,
                'payload': jsonDecode(o.payloadJson),
                'clientTs': o.clientTs,
              },
            )
            .toList(),
      };
      final res = await _api.post('/sync', body);
      final results =
          (res is Map ? res['results'] ?? res['data'] ?? res : res) as List? ??
          [];
      final byId = {
        for (final r in results) r['opUuid'] as String: r['status'] as String,
      };

      for (final op in pendingOps) {
        final s = byId[op.opUuid];
        SyncStatus next;
        if (s == 'APPLIED' || s == 'DUPLICATE') {
          next = SyncStatus.synced;
        } else if (s == 'CONFLICT') {
          next = SyncStatus.conflict;
          conflictedIds.add(op.opUuid);
        } else {
          next = SyncStatus.failed;
        }
        await (_db.update(_db.queueOps)
              ..where((t) => t.opUuid.equals(op.opUuid)))
            .write(QueueOpsCompanion(status: Value(_wire(next))));
      }
    } catch (_) {
      // Still offline — roll back to QUEUED_LOCAL for the next attempt.
      for (final op in pendingOps) {
        await (_db.update(
          _db.queueOps,
        )..where((t) => t.opUuid.equals(op.opUuid))).write(
          QueueOpsCompanion(status: Value(_wire(SyncStatus.queuedLocal))),
        );
      }
    }
    return conflictedIds;
  }

  Stream<List<QueueOp>> watchAll() => _db.select(_db.queueOps).watch();

  SyncStatus statusOf(QueueOp row) => _statusFromString(row.status);
}
