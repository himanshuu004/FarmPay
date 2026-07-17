import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/core_providers.dart';
import '../api/advisory_api.dart';

final advisoryApiProvider = Provider<AdvisoryApi>(
  (ref) => AdvisoryApi(ref.watch(apiClientProvider)),
);
