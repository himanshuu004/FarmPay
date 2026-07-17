import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/core_providers.dart';
import '../../../core/storage/secure_store.dart';
import '../api/auth_api.dart';

final authApiProvider = Provider<AuthApi>(
  (ref) => AuthApi(ref.watch(apiClientProvider)),
);

class SessionState {
  const SessionState({this.token, this.user});
  final String? token;
  final Map<String, dynamic>? user;
  bool get isAuthenticated => token != null;
}

/// Holds the current auth session in memory, backed by SecureStore. Screens
/// call [SessionController.hydrate] on boot and [setSession]/[clear] after
/// login/logout. This does NOT decide navigation — the router redirect logic
/// reads this provider (see lib/routes/app_router.dart).
class SessionController extends Notifier<SessionState> {
  @override
  SessionState build() => const SessionState();

  Future<void> hydrate() async {
    final token = await SecureStore.instance.getToken();
    final user = await SecureStore.instance.getUser();
    state = SessionState(token: token, user: user);
  }

  Future<void> setSession({
    required String accessToken,
    String? refreshToken,
    Map<String, dynamic>? user,
  }) async {
    await SecureStore.instance.setToken(accessToken);
    if (refreshToken != null)
      await SecureStore.instance.setRefreshToken(refreshToken);
    if (user != null) await SecureStore.instance.setUser(user);
    state = SessionState(token: accessToken, user: user ?? state.user);
  }

  Future<void> clear() async {
    await SecureStore.instance.clearAllTokens();
    state = const SessionState();
  }
}

final sessionProvider = NotifierProvider<SessionController, SessionState>(
  SessionController.new,
);
