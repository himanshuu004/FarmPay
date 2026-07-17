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

    // Regression test for the "type 'String' is not a subtype of type
    // 'num?' in type cast" crash on the My Animals screen: Sequelize
    // DECIMAL columns (purchase_cost, total_amount, etc.) serialize as
    // JSON strings, not numbers, in raw CRUD-echo responses.
    test('accepts stringified decimals from raw Sequelize CRUD echoes', () {
      expect(formatRupees('65000.00'), '₹65,000');
      expect(formatRupees('3000.00'), '₹3,000');
      expect(formatRupees('0.00'), '₹0');
      expect(formatRupees('not-a-number'), '₹0');
    });
  });

  group('asNum', () {
    test('passes through real numbers unchanged', () {
      expect(asNum(42), 42);
      expect(asNum(42.5), 42.5);
    });

    test('parses stringified decimals', () {
      expect(asNum('9800.00'), 9800.0);
    });

    test('falls back on null or unparsable input', () {
      expect(asNum(null), 0);
      expect(asNum('garbage'), 0);
      expect(asNum(null, fallback: 1), 1);
    });
  });
}
