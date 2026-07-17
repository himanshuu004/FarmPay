// App boot smoke test: an unauthenticated session must land on the login
// screen (go_router redirect logic in lib/routes/app_router.dart) and the
// screen must expose the mobile + MPIN fields with no password field.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:flutter_app/main.dart';

void main() {
  // flutter_secure_storage has no native implementation under `flutter
  // test` (no platform channel host) — its method calls never resolve on
  // their own, which would otherwise hang the boot-check spinner forever.
  // Mock the channel to behave like "nothing stored yet".
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('plugins.it_nomads.com/flutter_secure_storage');
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(
        channel,
        (call) async => call.method == 'readAll' ? <String, String>{} : null,
      );

  testWidgets('unauthenticated boot lands on login with no password field', (
    tester,
  ) async {
    await tester.pumpWidget(const ProviderScope(child: AlliedKccApp()));
    await tester.pumpAndSettle();

    expect(find.byType(TextField), findsWidgets);
    expect(
      find.byWidgetPredicate((w) => w is TextField && w.obscureText),
      findsOneWidget,
      reason:
          'Only the MPIN field should be obscured — there must be no password field anywhere.',
    );
  });
}
