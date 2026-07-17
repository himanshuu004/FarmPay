import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/core_providers.dart';
import '../api/cia_api.dart';

final ciaApiProvider = Provider<CiaApi>((ref) => CiaApi(ref.watch(apiClientProvider)));
