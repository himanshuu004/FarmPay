import 'dart:convert';

import 'package:uuid/uuid.dart';

import '../../../core/api/api_client.dart';
import '../../../core/offline/offline_queue_db.dart';

/// Queues + retries dairy logbook writes (revenue/cost entries — the two
/// entry points the "log milk"/"log expense" primary actions use) so they
/// work with no signal, per CLAUDE.md's offline-first hard requirement.
/// See offline_queue_db.dart's DairyPendingEvents doc comment for why this
/// bypasses the generic /api/v1/sync queue.
class DairyOfflineSync {
  DairyOfflineSync(this._db, this._api);

  final OfflineQueueDb _db;
  final ApiClient _api;
  static const _uuid = Uuid();

  Future<void> enqueue({
    required String kind,
    required String path,
    required Map<String, dynamic> payload,
  }) async {
    await _db
        .into(_db.dairyPendingEvents)
        .insert(
          DairyPendingEventsCompanion.insert(
            opUuid: _uuid.v4(),
            kind: kind,
            path: path,
            payloadJson: jsonEncode(payload),
            queuedAt: DateTime.now().toIso8601String(),
          ),
        );
  }

  Future<List<DairyPendingEvent>> pending() =>
      _db.select(_db.dairyPendingEvents).get();

  /// Retries every queued entry against its real endpoint. Successes are
  /// removed; failures (still offline, or a genuine validation error) stay
  /// queued for the next retry — never silently dropped.
  Future<int> flush() async {
    final rows = await pending();
    var synced = 0;
    for (final row in rows) {
      try {
        final res = await _api.post(
          row.path,
          jsonDecode(row.payloadJson) as Map<String, dynamic>,
        );
        if (res['success'] == true) {
          await (_db.delete(
            _db.dairyPendingEvents,
          )..where((t) => t.opUuid.equals(row.opUuid))).go();
          synced++;
        }
      } catch (_) {
        // still offline — leave queued
      }
    }
    return synced;
  }
}
