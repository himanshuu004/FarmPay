import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:flutter_app/core/api/api_client.dart';
import 'package:flutter_app/core/offline/offline_queue_db.dart';
import 'package:flutter_app/features/coop/api/coop_api.dart';
import 'package:flutter_app/features/coop/offline/coop_offline_sync.dart';

class MockApiClient extends Mock implements ApiClient {}

void main() {
  late OfflineQueueDb db;
  late MockApiClient apiClient;
  late CoopApi coopApi;
  late CoopOfflineSync sync;

  setUp(() {
    db = OfflineQueueDb.forTesting(NativeDatabase.memory());
    apiClient = MockApiClient();
    coopApi = CoopApi(apiClient);
    sync = CoopOfflineSync(db, coopApi);
  });

  tearDown(() => db.close());

  // Guards the highest-risk-of-regression path per FLUTTER-CONVERSION-PRD.md
  // §5/§7: receipt confirmation must survive no-signal capture and later
  // sync idempotently, since it isn't routed through the generic
  // /api/v1/sync queue (see coop_offline_sync.dart's doc comment for why).

  test(
    'enqueue works with no network call, then flush retries against the real endpoint',
    () async {
      when(
        () => apiClient.post('/coop/orders/order-1/receipt', any()),
      ).thenAnswer(
        (_) async => {
          'success': true,
          'data': {'orderUuid': 'order-1', 'status': 'RECEIPT_CONFIRMED'},
        },
      );

      await sync.enqueue('order-1');
      expect(await sync.pendingOrderUuids(), ['order-1']);

      final outcomes = await sync.flush();

      expect(outcomes['order-1'], ReceiptSyncOutcome.synced);
      expect(await sync.pendingOrderUuids(), isEmpty);
    },
  );

  test(
    'flush leaves the op queued when still offline (never drops it)',
    () async {
      when(
        () => apiClient.post('/coop/orders/order-1/receipt', any()),
      ).thenThrow(Exception('SocketException'));

      await sync.enqueue('order-1');
      final outcomes = await sync.flush();

      expect(outcomes['order-1'], ReceiptSyncOutcome.stillOffline);
      expect(await sync.pendingOrderUuids(), [
        'order-1',
      ]); // still there for the next retry
    },
  );

  test(
    'a COOP_ORDER_BAD_STATE response (already confirmed) resolves as a conflict, not an infinite retry',
    () async {
      when(
        () => apiClient.post('/coop/orders/order-1/receipt', any()),
      ).thenAnswer(
        (_) async => {
          'success': false,
          'errorCode': 'COOP_ORDER_BAD_STATE',
          'message': 'Cannot confirm receipt from RECEIPT_CONFIRMED',
        },
      );

      await sync.enqueue('order-1');
      final outcomes = await sync.flush();

      expect(outcomes['order-1'], ReceiptSyncOutcome.conflict);
      expect(
        await sync.pendingOrderUuids(),
        isEmpty,
      ); // server-wins: local intent dropped
    },
  );

  test(
    're-enqueuing the same order does not duplicate the pending row (idempotent by orderUuid)',
    () async {
      await sync.enqueue('order-1');
      await sync.enqueue('order-1');
      expect(await sync.pendingOrderUuids(), ['order-1']);
    },
  );
}
