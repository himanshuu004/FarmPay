import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/core/api/api_client.dart';

void main() {
  group('formatRupees', () {
    test('formats with Indian digit grouping and rupee sign', () {
      expect(formatRupees(18600), '₹18,600');
      expect(formatRupees(264500), '₹2,64,500');
      expect(formatRupees(0), '₹0');
      expect(formatRupees(null), '₹0');
      expect(formatRupees(999), '₹999');
      expect(formatRupees(1000), '₹1,000');
    });

    test('rounds fractional rupees — never invents statutory precision', () {
      expect(formatRupees(1234.6), '₹1,235');
    });
  });
}
