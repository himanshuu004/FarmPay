import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/core_providers.dart';
import '../api/insurance_api.dart';

final insuranceApiProvider = Provider<InsuranceApi>(
  (ref) => InsuranceApi(ref.watch(apiClientProvider)),
);
