import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/core_providers.dart';
import '../api/coop_api.dart';
import '../offline/coop_offline_sync.dart';

final coopApiProvider = Provider<CoopApi>(
  (ref) => CoopApi(ref.watch(apiClientProvider)),
);

final coopOfflineSyncProvider = Provider<CoopOfflineSync>(
  (ref) => CoopOfflineSync(
    ref.watch(offlineQueueDbProvider),
    ref.watch(coopApiProvider),
  ),
);
