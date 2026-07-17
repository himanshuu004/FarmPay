import 'package:flutter/material.dart';

import '../../../design_system/tokens.dart';
import '../../../l10n/generated/app_localizations.dart';

/// Flutter port of app/components/FormKit.tsx — the shared form-building
/// blocks every dairy logbook screen is built from (field labels, big
/// touch-friendly inputs, choice grids, chips, date stepper, collapsible
/// "more details", save button). Colors come from the app's design_system
/// tokens rather than FormKit's own hardcoded #2e7d32/#1b5e20 (an
/// RN-only inline palette, not the /prototypes-derived system this app
/// uses elsewhere) — everything else (structure, behavior, copy,
/// field-by-field layout) mirrors the RN component exactly.

String todayYMD() {
  final now = DateTime.now();
  return _toYMD(now);
}

String _toYMD(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

String shiftYMD(String ymd, int days) {
  final d = DateTime.parse(ymd).add(Duration(days: days));
  return _toYMD(d);
}

const _weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const _months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

String prettyYMD(String ymd) {
  final d = DateTime.parse(ymd);
  return '${_weekdays[d.weekday - 1]}, ${d.day} ${_months[d.month - 1]}';
}

/// FieldLabel({ en, hi, required })
class FieldLabel extends StatelessWidget {
  const FieldLabel({
    super.key,
    required this.en,
    this.hi,
    this.required = false,
  });

  final String en;
  final String? hi;
  final bool required;

  @override
  Widget build(BuildContext context) {
    final isHi = Localizations.localeOf(context).languageCode == 'hi';
    final text = (isHi && hi != null) ? hi! : en;
    return Padding(
      padding: const EdgeInsets.only(top: 14, bottom: 8),
      child: Text(
        required ? '$text *' : text,
        style: const TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w700,
          color: Color(0xFF444444),
        ),
      ),
    );
  }
}

/// DateField({ value, onChange })
class DateField extends StatelessWidget {
  const DateField({super.key, required this.value, required this.onChange});

  final String value;
  final ValueChanged<String> onChange;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final today = todayYMD();
    final yesterday = shiftYMD(today, -1);
    final isFuture = value.compareTo(today) >= 0;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: _quickChip(
                l10n.commonToday,
                value == today,
                () => onChange(today),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _quickChip(
                l10n.commonYesterday,
                value == yesterday,
                () => onChange(yesterday),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            _stepBtn('‹', true, () => onChange(shiftYMD(value, -1))),
            Expanded(
              child: Center(
                child: Text(
                  prettyYMD(value),
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
            _stepBtn('›', !isFuture, () => onChange(shiftYMD(value, 1))),
          ],
        ),
      ],
    );
  }

  Widget _quickChip(String label, bool selected, VoidCallback onTap) {
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected ? AppColors.brand : const Color(0xFFDDDDDD),
            width: 1.5,
          ),
          color: selected ? AppColors.accent : const Color(0xFFFAFAFA),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: selected ? AppColors.brandDark : const Color(0xFF444444),
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }

  Widget _stepBtn(String glyph, bool enabled, VoidCallback onTap) {
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: enabled ? onTap : null,
      child: Opacity(
        opacity: enabled ? 1 : 0.35,
        child: Container(
          width: 52,
          height: 52,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFFDDDDDD), width: 1.5),
            color: Colors.white,
          ),
          child: Text(
            glyph,
            style: const TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.w700,
              color: AppColors.brandDark,
            ),
          ),
        ),
      ),
    );
  }
}

/// BigInput({ value, onChangeText, placeholder, numeric, prefix, suffix, strong })
class BigInput extends StatelessWidget {
  const BigInput({
    super.key,
    required this.controller,
    this.placeholder,
    this.numeric = false,
    this.prefix,
    this.suffix,
    this.strong = false,
  });

  final TextEditingController controller;
  final String? placeholder;
  final bool numeric;
  final String? prefix;
  final String? suffix;
  final bool strong;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minHeight: 54),
      padding: const EdgeInsets.symmetric(horizontal: 14),
      decoration: BoxDecoration(
        border: Border.all(color: const Color(0xFFDDDDDD), width: 1.5),
        borderRadius: BorderRadius.circular(12),
        color: const Color(0xFFFAFAFA),
      ),
      child: Row(
        children: [
          if (prefix != null)
            Padding(
              padding: const EdgeInsets.only(right: 4),
              child: Text(
                prefix!,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: Color(0xFF888888),
                ),
              ),
            ),
          Expanded(
            child: TextField(
              controller: controller,
              keyboardType: numeric
                  ? const TextInputType.numberWithOptions(decimal: true)
                  : TextInputType.text,
              style: strong
                  ? const TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      color: AppColors.brandDark,
                    )
                  : const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF222222),
                    ),
              decoration: InputDecoration(
                border: InputBorder.none,
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(vertical: 12),
                hintText: placeholder,
                hintStyle: const TextStyle(color: Color(0xFFBBBBBB)),
              ),
            ),
          ),
          if (suffix != null)
            Padding(
              padding: const EdgeInsets.only(left: 4),
              child: Text(
                suffix!,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: Color(0xFF888888),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class ChoiceOption<T> {
  const ChoiceOption({required this.value, required this.label, this.icon});
  final T value;
  final String label;
  final String? icon;
}

/// `ChoiceGrid<T>({ options, value, onChange })` — ~3-per-row icon tiles.
class ChoiceGrid<T> extends StatelessWidget {
  const ChoiceGrid({
    super.key,
    required this.options,
    required this.value,
    required this.onChange,
  });

  final List<ChoiceOption<T>> options;
  final T value;
  final ValueChanged<T> onChange;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final opt in options)
          FractionallySizedBox(
            widthFactor: 0.31,
            child: _Tile(
              opt: opt,
              selected: opt.value == value,
              onTap: () => onChange(opt.value),
            ),
          ),
      ],
    );
  }
}

class _Tile<T> extends StatelessWidget {
  const _Tile({required this.opt, required this.selected, required this.onTap});
  final ChoiceOption<T> opt;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: selected ? AppColors.brand : const Color(0xFFE6E6E6),
            width: 1.5,
          ),
          color: selected ? AppColors.accent : const Color(0xFFFAFAFA),
        ),
        child: Column(
          children: [
            if (opt.icon != null)
              Text(opt.icon!, style: const TextStyle(fontSize: 28)),
            const SizedBox(height: 4),
            Text(
              opt.label,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: selected ? AppColors.brandDark : const Color(0xFF666666),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// `Chips<T>({ options, value, onChange })` — pill chips, value may be null.
class ChipsField<T> extends StatelessWidget {
  const ChipsField({
    super.key,
    required this.options,
    required this.value,
    required this.onChange,
  });

  final List<ChoiceOption<T>> options;
  final T? value;
  final ValueChanged<T> onChange;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final opt in options)
          InkWell(
            borderRadius: BorderRadius.circular(999),
            onTap: () => onChange(opt.value),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(999),
                border: Border.all(
                  color: opt.value == value
                      ? AppColors.brand
                      : const Color(0xFFDDDDDD),
                  width: 1.5,
                ),
                color: opt.value == value
                    ? AppColors.accent
                    : const Color(0xFFFAFAFA),
              ),
              child: Text(
                opt.label,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: opt.value == value
                      ? AppColors.brandDark
                      : const Color(0xFF666666),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

/// MoreDetails({ children, label }) — collapsed by default, instant toggle.
class MoreDetails extends StatefulWidget {
  const MoreDetails({super.key, required this.children, this.label});

  final List<Widget> children;
  final String? label;

  @override
  State<MoreDetails> createState() => _MoreDetailsState();
}

class _MoreDetailsState extends State<MoreDetails> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final label = widget.label ?? l10n.commonMoreDetails;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        InkWell(
          onTap: () => setState(() => _open = !_open),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Text(
              '${_open ? '▾' : '▸'} $label',
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: AppColors.brand,
              ),
            ),
          ),
        ),
        if (_open)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Column(children: widget.children),
          ),
      ],
    );
  }
}

/// SaveButton({ en, hi, onPress, saving, disabled })
class SaveButton extends StatelessWidget {
  const SaveButton({
    super.key,
    required this.en,
    this.hi,
    required this.onPressed,
    this.saving = false,
    this.disabled = false,
  });

  final String en;
  final String? hi;
  final VoidCallback onPressed;
  final bool saving;
  final bool disabled;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final isHi = Localizations.localeOf(context).languageCode == 'hi';
    final label = saving
        ? l10n.commonSaving
        : ((isHi && hi != null) ? hi! : en);
    final isDisabled = saving || disabled;
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton(
        onPressed: isDisabled ? null : onPressed,
        style: ElevatedButton.styleFrom(
          padding: const EdgeInsets.symmetric(vertical: 18),
        ),
        child: saving
            ? const SizedBox(
                height: 20,
                width: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Colors.white,
                ),
              )
            : Text(
                label,
                style: const TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w800,
                ),
              ),
      ),
    );
  }
}
