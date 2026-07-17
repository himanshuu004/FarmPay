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
import '../features/kcc/screens/kcc_apply_screen.dart';
import '../features/kcc/screens/kcc_calculator_screen.dart';
import '../features/kcc/screens/kcc_drawdown_screen.dart';
import '../features/kcc/screens/kcc_eligibility_screen.dart';
import '../features/kcc/screens/kcc_limit_screen.dart';
import '../features/kcc/screens/kcc_pack_screen.dart';
import '../features/kcc/screens/kcc_transactions_screen.dart';
import '../features/logbook/screens/activity_dairy_screen.dart';
import '../features/logbook/screens/dairy_animals_screen.dart';
import '../features/logbook/screens/dairy_breeding_screen.dart';
import '../features/logbook/screens/dairy_log_cost_screen.dart';
import '../features/logbook/screens/dairy_log_revenue_screen.dart';
import '../features/logbook/screens/dairy_logbook_screen.dart';
import '../features/logbook/screens/dairy_onboarding_screen.dart';
import '../features/logbook/screens/dairy_pnl_screen.dart';
import '../features/logbook/screens/dairy_treatment_screen.dart';
import '../features/logbook/screens/farm_tab_screen.dart';
import '../features/logbook/screens/setup_dairy_screen.dart';
import '../features/insurance/screens/pashu_animals_screen.dart';
import '../features/insurance/screens/pashu_claim_screen.dart';
import '../features/insurance/screens/pashu_enrol_screen.dart';
import '../features/insurance/screens/pashu_home_screen.dart';
import '../features/insurance/screens/pashu_quote_screen.dart';
import '../features/insurance/screens/pashu_renew_screen.dart';
import '../features/insurance/screens/pashu_vault_screen.dart';
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

      // ── Dairy logbook (Phase 3) — same route names as the RN app ──
      GoRoute(
        path: '/dairy-log-revenue',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const DairyLogRevenueScreen(),
      ),
      GoRoute(
        path: '/dairy-log-cost',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const DairyLogCostScreen(),
      ),
      GoRoute(
        path: '/dairy-logbook',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const DairyLogbookScreen(),
      ),
      GoRoute(
        path: '/dairy-animals',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const DairyAnimalsScreen(),
      ),
      GoRoute(
        path: '/dairy-treatment',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const DairyTreatmentScreen(),
      ),
      GoRoute(
        path: '/dairy-breeding',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const DairyBreedingScreen(),
      ),
      GoRoute(
        path: '/dairy-pnl',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const DairyPnlScreen(),
      ),
      GoRoute(
        path: '/dairy-onboarding',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const DairyOnboardingScreen(),
      ),
      GoRoute(
        path: '/setup-dairy',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => SetupDairyScreen(
          editMode: state.uri.queryParameters['mode'] == 'edit',
        ),
      ),
      GoRoute(
        path: '/activity-dairy',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const ActivityDairyScreen(),
      ),
      // Goat/poultry reuse the shared register+logbook+P&L pattern per
      // CLAUDE.md's module map, but aren't in this phase's scope.
      _pendingRoute(
        '/activity-goatery',
        'Goatery',
        'Goatery registers ship in a later phase.',
        _rootNavigatorKey,
      ),
      _pendingRoute(
        '/activity-poultry',
        'Poultry',
        'Poultry registers ship in a later phase.',
        _rootNavigatorKey,
      ),

      // ── KCC (Phase 4) — same route names as the RN app ──
      GoRoute(
        path: '/kcc-calculator',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const KccCalculatorScreen(),
      ),
      GoRoute(
        path: '/kcc-eligibility',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const KccEligibilityScreen(),
      ),
      GoRoute(
        path: '/kcc-apply',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => KccApplyScreen(
          chosenAnimalUuids: (state.extra as List<String>?) ?? const [],
        ),
      ),
      GoRoute(
        path: '/kcc-drawdown',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const KccDrawdownScreen(),
      ),
      GoRoute(
        path: '/kcc-transactions',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const KccTransactionsScreen(),
      ),
      GoRoute(
        path: '/kcc-pack',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const KccPackScreen(),
      ),

      // ── Pashu Suraksha (Phase 5) — same route names as the RN app ──
      GoRoute(
        path: '/pashu-animals',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const PashuAnimalsScreen(),
      ),
      GoRoute(
        path: '/pashu-quote',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => PashuQuoteScreen(
          animalId: state.uri.queryParameters['animalId'],
        ),
      ),
      GoRoute(
        path: '/pashu-enrol',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => PashuEnrolScreen(
          planCode: state.uri.queryParameters['planCode'],
          marketValue: state.uri.queryParameters['marketValue'],
          preselectAnimalId: state.uri.queryParameters['animalId'],
        ),
      ),
      GoRoute(
        path: '/pashu-vault',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => PashuVaultScreen(
          policyUuid: state.uri.queryParameters['policyUuid'],
        ),
      ),
      GoRoute(
        path: '/pashu-renew',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const PashuRenewScreen(),
      ),
      GoRoute(
        path: '/pashu-claim',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const PashuClaimScreen(),
      ),
      _pendingRoute(
        '/cia-schemes',
        'Cattle induction',
        'The CIA loan-cum-subsidy programme ships in Phase 6.',
        _rootNavigatorKey,
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
                builder: (context, state) => const FarmTabScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/kcc',
                builder: (context, state) => const KccLimitScreen(),
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
                builder: (context, state) => const PashuHomeScreen(),
              ),
            ],
          ),
        ],
      ),
    ],
  );
});

GoRoute _pendingRoute(
  String path,
  String title,
  String phaseLabel,
  GlobalKey<NavigatorState> rootKey,
) {
  return GoRoute(
    path: path,
    parentNavigatorKey: rootKey,
    builder: (context, state) =>
        PhasePendingScreen(title: title, phaseLabel: phaseLabel),
  );
}

class _SessionListenable extends ChangeNotifier {
  _SessionListenable(this.ref) {
    ref.listen(sessionProvider, (prev, next) {
      if (prev?.isAuthenticated != next.isAuthenticated) notifyListeners();
    });
  }
  final Ref ref;
}
