import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:flutter_app/core/api/api_client.dart';
import 'package:flutter_app/core/offline/offline_queue_db.dart';
import 'package:flutter_app/features/logbook/offline/dairy_offline_sync.dart';

class MockApiClient extends Mock implements ApiClient {}

void main() {
  late OfflineQueueDb db;
  late MockApiClient apiClient;
  late DairyOfflineSync sync;

  setUp(() {
    db = OfflineQueueDb.forTesting(NativeDatabase.memory());
    apiClient = MockApiClient();
    sync = DairyOfflineSync(db, apiClient);
  });

  tearDown(() => db.close());

  // Guards the "Log Milk"/"Log Expense" offline-first hard requirement
  // (CLAUDE.md Convention 26) — dairy_offline_sync.dart deliberately
  // bypasses the generic /api/v1/sync queue (see its doc comment) and
  // retries against the real, validated POST /livestock/* endpoints.

  test(
    'enqueue works with no network call, then flush posts to the real endpoint',
    () async {
      when(() => apiClient.post('/livestock/revenue-events', any())).thenAnswer(
        (_) async => {
          'success': true,
          'data': {'event_uuid': 'e-1'},
        },
      );

      await sync.enqueue(
        kind: 'revenue',
        path: '/livestock/revenue-events',
        payload: {'amount': 100},
      );
      expect(await sync.pending(), hasLength(1));

      final synced = await sync.flush();

      expect(synced, 1);
      expect(await sync.pending(), isEmpty);
    },
  );

  test(
    'flush leaves the entry queued when still offline (never drops it)',
    () async {
      when(
        () => apiClient.post('/livestock/cost-events', any()),
      ).thenThrow(Exception('SocketException'));

      await sync.enqueue(
        kind: 'cost',
        path: '/livestock/cost-events',
        payload: {'amount': 50},
      );
      final synced = await sync.flush();

      expect(synced, 0);
      expect(await sync.pending(), hasLength(1));
    },
  );

  test(
    'a validation failure (success:false) stays queued rather than being silently dropped',
    () async {
      when(() => apiClient.post('/livestock/cost-events', any())).thenAnswer(
        (_) async => {'success': false, 'message': 'Invalid quantity'},
      );

      await sync.enqueue(
        kind: 'cost',
        path: '/livestock/cost-events',
        payload: {'amount': -1},
      );
      final synced = await sync.flush();

      expect(synced, 0);
      expect(await sync.pending(), hasLength(1));
    },
  );

  test('each enqueue gets a distinct opUuid (idempotency key)', () async {
    await sync.enqueue(
      kind: 'revenue',
      path: '/livestock/revenue-events',
      payload: {},
    );
    await sync.enqueue(
      kind: 'revenue',
      path: '/livestock/revenue-events',
      payload: {},
    );
    final rows = await sync.pending();
    expect(rows.map((r) => r.opUuid).toSet(), hasLength(2));
  });
}
