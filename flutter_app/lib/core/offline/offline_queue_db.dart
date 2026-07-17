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

@DriftDatabase(tables: [QueueOps])
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
