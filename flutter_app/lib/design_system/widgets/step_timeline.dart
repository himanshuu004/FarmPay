import 'package:flutter/material.dart';
import '../tokens.dart';

/// One row in a [StepTimeline] — an actor-grouped workflow step. Mirrors
/// kcc-limit.tsx's inline `Timeline` component (`.step`/`.dot`/`.dot.done`/
/// `.dot.now`), lifted into `design_system` since insurance claims and CIA
/// state machines will need the same actor-grouped-progress pattern later.
class TimelineStep {
  const TimelineStep({
    required this.title,
    required this.actorLabel,
    required this.actorColor,
    required this.actorBg,
    this.done = false,
    this.current = false,
  });

  final String title;
  final String actorLabel;
  final Color actorColor;
  final Color actorBg;
  final bool done;
  final bool current;
}

/// Vertical dotted progress list, grouped by who acts next (You / Society /
/// Bank / Ongoing, or any other actor set). `done` steps get a green tick,
/// the first not-done step is highlighted amber as `current`.
class StepTimeline extends StatelessWidget {
  const StepTimeline({super.key, required this.steps});

  final List<TimelineStep> steps;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        for (int i = 0; i < steps.length; i++) _StepRow(steps[i], last: i == steps.length - 1),
      ],
    );
  }
}

class _StepRow extends StatelessWidget {
  const _StepRow(this.step, {required this.last});

  final TimelineStep step;
  final bool last;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 9),
      decoration: BoxDecoration(
        border: last
            ? null
            : const Border(bottom: BorderSide(color: AppColors.line)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 3),
            child: Container(
              width: 12,
              height: 12,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: step.done
                    ? AppColors.brand
                    : step.current
                    ? AppColors.warnAmber
                    : AppColors.line,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  step.title,
                  style: TextStyle(
                    fontSize: 13.5,
                    height: 1.3,
                    color: step.current
                        ? AppColors.brandDark
                        : step.done
                        ? AppColors.ink
                        : AppColors.muted,
                    fontWeight: step.current ? FontWeight.w800 : FontWeight.w400,
                  ),
                ),
                const SizedBox(height: 4),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                  decoration: BoxDecoration(
                    color: step.actorBg,
                    borderRadius: BorderRadius.circular(AppRadii.chip),
                  ),
                  child: Text(
                    step.actorLabel,
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                      color: step.actorColor,
                    ),
                  ),
                ),
              ],
            ),
          ),
          if (step.done)
            const Text(
              '✓',
              style: TextStyle(color: AppColors.brand, fontWeight: FontWeight.w800, fontSize: 15),
            )
          else if (step.current)
            const Text(
              '●',
              style: TextStyle(color: AppColors.warnAmber, fontWeight: FontWeight.w800, fontSize: 14),
            ),
        ],
      ),
    );
  }
}
