import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/screens/aadhaar_verify_screen.dart';
import '../features/auth/screens/forgot_mpin_screen.dart';
import '../features/auth/screens/login_screen.dart';
import '../features/auth/screens/register_screen.dart';
import '../features/auth/providers/auth_providers.dart';
import '../features/coop/screens/society_order_screen.dart';
import '../features/coop/screens/society_orders_screen.dart';
import '../features/coop/screens/society_passbook_screen.dart';
import '../features/home/screens/home_screen.dart';
import '../features/shell/main_shell.dart';
import '../features/shell/phase_pending_screen.dart';

final _rootNavigatorKey = GlobalKey<NavigatorState>();

final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: '/login',
    refreshListenable: _SessionListenable(ref),
    redirect: (context, state) {
      final isAuthenticated = ref.read(sessionProvider).isAuthenticated;
      final loc = state.matchedLocation;
      final isAuthRoute =
          loc == '/login' || loc == '/register' || loc == '/forgot-mpin';
      if (!isAuthenticated && !isAuthRoute) return '/login';
      if (isAuthenticated && isAuthRoute) return '/home';
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      GoRoute(
        path: '/register',
        builder: (context, state) => const RegisterScreen(),
      ),
      GoRoute(
        path: '/forgot-mpin',
        builder: (context, state) => const ForgotMpinScreen(),
      ),
      GoRoute(
        path: '/aadhaar-verify',
        builder: (context, state) => AadhaarVerifyScreen(
          returnTo: state.uri.queryParameters['returnTo'],
        ),
      ),
      GoRoute(
        path: '/society-order',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const SocietyOrderScreen(),
      ),
      GoRoute(
        path: '/society-orders',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const SocietyOrdersScreen(),
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            MainShell(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/home',
                builder: (context, state) => const HomeScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/farm',
                builder: (context, state) => const PhasePendingScreen(
                  title: 'Farm',
                  phaseLabel: 'Dairy logbook & registers ship in Phase 3.',
                ),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/kcc',
                builder: (context, state) => const PhasePendingScreen(
                  title: 'KCC',
                  phaseLabel:
                      'KCC calculator, eligibility, application and drawdown ship in Phase 4.',
                ),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/society',
                builder: (context, state) => const SocietyPassbookScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/suraksha',
                builder: (context, state) => const PhasePendingScreen(
                  title: 'Pashu Suraksha',
                  phaseLabel:
                      'Animal tagging, quotes, enrolment and claims ship in Phase 5.',
                ),
              ),
            ],
          ),
        ],
      ),
    ],
  );
});

class _SessionListenable extends ChangeNotifier {
  _SessionListenable(this.ref) {
    ref.listen(sessionProvider, (prev, next) {
      if (prev?.isAuthenticated != next.isAuthenticated) notifyListeners();
    });
  }
  final Ref ref;
}
