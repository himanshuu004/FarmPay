import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/core/api/api_client.dart';
import 'package:flutter_app/core/offline/offline_queue.dart';
import 'package:flutter_app/core/offline/offline_queue_db.dart';

void main() {
  late OfflineQueueDb db;
  late OfflineQueue queue;

  setUp(() {
    db = OfflineQueueDb.forTesting(NativeDatabase.memory());
    queue = OfflineQueue(db, ApiClient.instance);
  });

  tearDown(() => db.close());

  test('enqueue writes a QUEUED_LOCAL op with no network call', () async {
    final op = await queue.enqueue(
      entityType: 'DairyRevenueEvent',
      action: 'CREATE',
      payload: {'litres': 10, 'rate': 45},
    );

    expect(op.status, SyncStatus.queuedLocal);
    expect(op.entityType, 'DairyRevenueEvent');

    final pending = await queue.pending();
    expect(pending, hasLength(1));
    expect(pending.first.opUuid, op.opUuid);
  });

  test('each enqueue gets a distinct idempotency key (opUuid)', () async {
    final a = await queue.enqueue(
      entityType: 'CoopInputOrder',
      action: 'CREATE',
      payload: {},
    );
    final b = await queue.enqueue(
      entityType: 'CoopInputOrder',
      action: 'CREATE',
      payload: {},
    );
    expect(a.opUuid, isNot(equals(b.opUuid)));
  });
}
