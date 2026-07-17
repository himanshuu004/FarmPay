import 'package:flutter/widgets.dart';

/// Design tokens lifted directly from `/prototypes` CSS custom properties —
/// the settled UI/UX spec (see prototypes/kcc/index.html :root and
/// prototypes/mobile-app.html :root). Every feature module must consume
/// these instead of hardcoding colors/spacing, so the whole app reads as
/// one system.
class AppColors {
  AppColors._();

  static const brand = Color(0xFF0F7A4D);
  static const brandDark = Color(0xFF0A5C3A);
  static const accent = Color(0xFFE8F5EE);

  static const ink = Color(0xFF14201B);
  static const muted = Color(0xFF6B7C74);
  static const line = Color(0xFFE2E8E4);
  static const bg = Color(0xFFF4F6F5);
  static const card = Color(0xFFFFFFFF);

  static const warnAmber = Color(0xFFB45309);
  static const warnAmberBg = Color(0xFFFEF3E2);

  static const danger = Color(0xFFB3261E);
  static const dangerBg = Color(0xFFFBE9E7);

  static const gold = Color(0xFF8A6D1F);
  static const goldBg = Color(0xFFFBF3D9);

  static const blue = Color(0xFF0B5C8A);
  static const blueBg = Color(0xFFE6F0F6);

  static const meterBg = Color(0xFFE2ECE7);
}

class AppSpacing {
  AppSpacing._();

  static const xs = 4.0;
  static const sm = 8.0;
  static const md = 12.0;
  static const lg = 16.0;
  static const xl = 20.0;
  static const xxl = 28.0;
}

class AppRadii {
  AppRadii._();

  static const card = 16.0;
  static const button = 12.0;
  static const chip = 999.0;
  static const phone = 28.0;
}

class AppTextSizes {
  AppTextSizes._();

  static const kpi = 26.0;
  static const kpiSmall = 20.0;
  static const title = 22.0;
  static const body = 15.0;
  static const label = 13.0;
  static const caption = 11.0;
}

/// Status-badge colors mapped 1:1 onto the state-machine enums in
/// CLAUDE.md — never invent a UI-only status color; every enum value used
/// anywhere in the app must be registered here.
enum StatusTone { neutral, brand, warn, danger, gold, blue }

class StatusColors {
  StatusColors._();

  static Color fg(StatusTone tone) {
    switch (tone) {
      case StatusTone.neutral:
        return AppColors.muted;
      case StatusTone.brand:
        return AppColors.brandDark;
      case StatusTone.warn:
        return AppColors.warnAmber;
      case StatusTone.danger:
        return AppColors.danger;
      case StatusTone.gold:
        return AppColors.gold;
      case StatusTone.blue:
        return AppColors.blue;
    }
  }

  static Color bg(StatusTone tone) {
    switch (tone) {
      case StatusTone.neutral:
        return AppColors.line;
      case StatusTone.brand:
        return AppColors.accent;
      case StatusTone.warn:
        return AppColors.warnAmberBg;
      case StatusTone.danger:
        return AppColors.dangerBg;
      case StatusTone.gold:
        return AppColors.goldBg;
      case StatusTone.blue:
        return AppColors.blueBg;
    }
  }
}
