import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_client.dart';
import '../offline/offline_queue.dart';
import '../offline/offline_queue_db.dart';
import '../storage/secure_store.dart';

final apiClientProvider = Provider<ApiClient>((ref) => ApiClient.instance);

final secureStoreProvider = Provider<SecureStore>(
  (ref) => SecureStore.instance,
);

final offlineQueueDbProvider = Provider<OfflineQueueDb>((ref) {
  final db = OfflineQueueDb();
  ref.onDispose(db.close);
  return db;
});

final offlineQueueProvider = Provider<OfflineQueue>((ref) {
  return OfflineQueue(
    ref.watch(offlineQueueDbProvider),
    ref.watch(apiClientProvider),
  );
});
