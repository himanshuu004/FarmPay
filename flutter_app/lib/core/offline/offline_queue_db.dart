import 'dart:io';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

part 'offline_queue_db.g.dart';

/// Local write queue, mirroring app/lib/offlineQueue.ts's QueueOp shape and
/// state machine EXACTLY (CLAUDE.md "Offline queue item" state machine):
/// QUEUED_LOCAL → SYNCING → SYNCED | CONFLICT (| FAILED).
class QueueOps extends Table {
  TextColumn get opUuid => text()();
  TextColumn get entityType => text()();
  TextColumn get entityRef => text().nullable()();
  TextColumn get action => text()(); // CREATE | UPDATE
  TextColumn get payloadJson => text()();
  TextColumn get clientTs => text()();
  TextColumn get status =>
      text()(); // QUEUED_LOCAL | SYNCING | SYNCED | CONFLICT | FAILED

  @override
  Set<Column> get primaryKey => {opUuid};
}

/// Direct-endpoint retry queue for coop receipt confirmation. This is
/// deliberately NOT routed through QueueOps/POST /api/v1/sync — the
/// backend's generic offline-sync applier (offlineSyncService.js) only
/// supports DairyCostEvent/DairyRevenueEvent today (explicitly documented
/// as "Phase 0 — extend per phase"). Confirming receipt is a state-machine
/// transition with side effects (auto feed-cost logging), not a raw field
/// patch, so it goes straight to the existing, already-idempotent
/// POST /coop/orders/:id/receipt endpoint once connectivity returns.
class CoopPendingReceipts extends Table {
  TextColumn get orderUuid => text()();
  TextColumn get queuedAt => text()();

  @override
  Set<Column> get primaryKey => {orderUuid};
}

/// Direct-endpoint retry queue for the dairy logbook (revenue/cost/
/// treatment/breeding events) — the hard offline-first requirement for
/// "logbook entry" (CLAUDE.md Convention 26). Same rationale as
/// CoopPendingReceipts: the generic /api/v1/sync applier does a raw,
/// business-logic-free `Model.create(payload)` keyed by exact snake_case
/// DB columns (including farmer_id, which the client would have to know
/// and supply itself — the sync service never injects it from the
/// authenticated user). Retrying against the real POST /livestock/*
/// endpoints instead keeps every validation/UUID-generation/auto-cost-event
/// side effect where CLAUDE.md requires it: server-side only.
class DairyPendingEvents extends Table {
  TextColumn get opUuid => text()();
  TextColumn get kind => text()(); // revenue | cost | treatment | breeding
  TextColumn get path => text()(); // e.g. /livestock/revenue-events
  TextColumn get payloadJson => text()();
  TextColumn get queuedAt => text()();

  @override
  Set<Column> get primaryKey => {opUuid};
}

@DriftDatabase(tables: [QueueOps, CoopPendingReceipts, DairyPendingEvents])
class OfflineQueueDb extends _$OfflineQueueDb {
  OfflineQueueDb() : super(_openConnection());
  OfflineQueueDb.forTesting(super.e);

  @override
  int get schemaVersion => 1;

  static LazyDatabase _openConnection() {
    return LazyDatabase(() async {
      final dir = await getApplicationDocumentsDirectory();
      final file = File(p.join(dir.path, 'akcc_offline_queue.sqlite'));
      return NativeDatabase.createInBackground(file);
    });
  }
}
