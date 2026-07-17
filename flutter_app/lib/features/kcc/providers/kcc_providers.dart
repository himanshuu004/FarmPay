import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/core_providers.dart';
import '../api/kcc_api.dart';

final kccApiProvider = Provider<KccApi>(
  (ref) => KccApi(ref.watch(apiClientProvider)),
);
