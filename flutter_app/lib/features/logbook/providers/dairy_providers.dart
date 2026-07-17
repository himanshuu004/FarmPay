import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/core_providers.dart';
import '../api/dairy_api.dart';
import '../offline/dairy_offline_sync.dart';

final dairyApiProvider = Provider<DairyApi>(
  (ref) => DairyApi(ref.watch(apiClientProvider)),
);

final dairyOfflineSyncProvider = Provider<DairyOfflineSync>(
  (ref) => DairyOfflineSync(
    ref.watch(offlineQueueDbProvider),
    ref.watch(apiClientProvider),
  ),
);
