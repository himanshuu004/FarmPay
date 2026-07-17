import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../design_system/tokens.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../providers/dairy_providers.dart';

/// Mirrors app/app/dairy-animals.tsx — the herd register. Unlike the other
/// dairy screens this one is NOT FormKit-based in the RN reference (its own
/// plain TextInput/TouchableOpacity layout), replicated faithfully rather
/// than retrofitted onto FormKit.
class DairyAnimalsScreen extends ConsumerStatefulWidget {
  const DairyAnimalsScreen({super.key});

  @override
  ConsumerState<DairyAnimalsScreen> createState() => _DairyAnimalsScreenState();
}

const _speciesOptions = [
  ('CATTLE', '🐄'),
  ('BUFFALO', '🐃'),
  ('GOAT', '🐐'),
  ('SHEEP', '🐑'),
  ('PIG', '🐖'),
  ('POULTRY', '🐔'),
];

const _lifecycleOptions = [
  'CALF',
  'HEIFER',
  'DRY',
  'EARLY_LACTATION',
  'PEAK_LACTATION',
  'LATE_LACTATION',
  'PREGNANT',
  'BREEDING',
];

class _DairyAnimalsScreenState extends ConsumerState<DairyAnimalsScreen> {
  bool _loading = true;
  bool _saving = false;
  bool _showForm = false;
  List<Map> _animals = [];

  final _tagCtrl = TextEditingController();
  final _nameCtrl = TextEditingController();
  final _breedCtrl = TextEditingController();
  final _dobCtrl = TextEditingController();
  final _purchaseCostCtrl = TextEditingController();
  final _purchaseDateCtrl = TextEditingController();
  String _species = 'CATTLE';
  String _gender = 'FEMALE';
  String _lifecycle = 'HEIFER';

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _tagCtrl.dispose();
    _nameCtrl.dispose();
    _breedCtrl.dispose();
    _dobCtrl.dispose();
    _purchaseCostCtrl.dispose();
    _purchaseDateCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await ref.read(dairyApiProvider).listAnimals();
      if (res['success'] == true) {
        setState(() => _animals = List<Map>.from(res['data'] ?? []));
      }
    } catch (_) {
      // offline-tolerant
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _resetForm() {
    _tagCtrl.clear();
    _nameCtrl.clear();
    _breedCtrl.clear();
    _dobCtrl.clear();
    _purchaseCostCtrl.clear();
    _purchaseDateCtrl.clear();
    _species = 'CATTLE';
    _gender = 'FEMALE';
    _lifecycle = 'HEIFER';
  }

  void _showSnack(String message, {bool error = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: error ? AppColors.danger : null,
      ),
    );
  }

  Future<void> _save() async {
    final l10n = AppLocalizations.of(context);
    if (_nameCtrl.text.trim().isEmpty && _tagCtrl.text.trim().isEmpty) {
      _showSnack(l10n.dairyAnimalsMissingMsg, error: true);
      return;
    }
    setState(() => _saving = true);
    try {
      final isDairySpecies = _species == 'CATTLE' || _species == 'BUFFALO';
      final res = await ref.read(dairyApiProvider).addAnimal({
        'tagNumber': _tagCtrl.text.trim().isEmpty ? null : _tagCtrl.text.trim(),
        'name': _nameCtrl.text.trim().isEmpty ? null : _nameCtrl.text.trim(),
        'species': _species,
        'breedCode': _breedCtrl.text.trim().isEmpty
            ? null
            : _breedCtrl.text.trim(),
        'gender': _gender,
        'dateOfBirth': _dobCtrl.text.trim().isEmpty
            ? null
            : _dobCtrl.text.trim(),
        'purchaseDate': _purchaseDateCtrl.text.trim().isEmpty
            ? null
            : _purchaseDateCtrl.text.trim(),
        'purchaseCost': _purchaseCostCtrl.text.trim().isEmpty
            ? null
            : double.tryParse(_purchaseCostCtrl.text.trim()),
        'lifecycleStage': isDairySpecies ? _lifecycle : null,
        'acquisitionMode': 'PURCHASED',
        'paymentMode': 'CASH',
      });
      if (res['success'] == true) {
        _showSnack(l10n.dairyAnimalsAddedMsg);
        _resetForm();
        setState(() => _showForm = false);
        await _load();
      } else {
        _showSnack(res['message'] ?? l10n.dairyAnimalsAddFailed, error: true);
      }
    } catch (e) {
      _showSnack(l10n.dairyOnbNetworkError, error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.dairyAnimalsTitle),
        actions: [
          if (!_showForm)
            TextButton(
              onPressed: () => setState(() => _showForm = true),
              child: Text(
                l10n.dairyAnimalsAdd,
                style: const TextStyle(color: Colors.white),
              ),
            ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(AppSpacing.lg),
                children: [
                  if (_showForm) _form(l10n),
                  if (!_showForm && _animals.isEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 80),
                      child: Center(
                        child: Column(
                          children: [
                            const Text('🐄', style: TextStyle(fontSize: 64)),
                            const SizedBox(height: 12),
                            Text(
                              l10n.dairyAnimalsEmpty,
                              style: const TextStyle(color: AppColors.muted),
                            ),
                          ],
                        ),
                      ),
                    ),
                  if (!_showForm)
                    for (final a in _animals) _animalCard(a),
                ],
              ),
            ),
    );
  }

  Widget _animalCard(Map a) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      margin: const EdgeInsets.only(bottom: AppSpacing.sm),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.line),
      ),
      child: Row(
        children: [
          Text(
            _speciesOptions
                .firstWhere(
                  (s) => s.$1 == a['species'],
                  orElse: () => ('CATTLE', '🐄'),
                )
                .$2,
            style: const TextStyle(fontSize: 28),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  (a['name'] ?? a['tag_number'] ?? '—').toString(),
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                Text(
                  [
                    if (a['tag_number'] != null) a['tag_number'],
                    if (a['current_lifecycle_stage'] != null)
                      a['current_lifecycle_stage'].toString().replaceAll(
                        '_',
                        ' ',
                      ),
                  ].join(' · '),
                  style: const TextStyle(fontSize: 12, color: AppColors.muted),
                ),
              ],
            ),
          ),
          if (a['purchase_cost'] != null)
            Text(formatRupees(a['purchase_cost'] as num?)),
        ],
      ),
    );
  }

  Widget _form(AppLocalizations l10n) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _label(l10n.dairyAnimalsTag),
        TextField(
          controller: _tagCtrl,
          textCapitalization: TextCapitalization.characters,
          decoration: const InputDecoration(hintText: 'e.g., RG-001'),
        ),
        _label(l10n.dairyAnimalsName),
        TextField(
          controller: _nameCtrl,
          decoration: const InputDecoration(hintText: 'e.g., Ganga'),
        ),
        _label(l10n.dairyAnimalsSpecies),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final s in _speciesOptions)
              _chip(
                '${s.$2} ${s.$1}',
                s.$1 == _species,
                () => setState(() => _species = s.$1),
              ),
          ],
        ),
        _label(l10n.dairyAnimalsBreed),
        TextField(
          controller: _breedCtrl,
          textCapitalization: TextCapitalization.characters,
          decoration: const InputDecoration(hintText: 'e.g., HF_CROSS, MURRAH'),
        ),
        _label(l10n.dairyAnimalsGender),
        Wrap(
          spacing: 8,
          children: [
            _chip(
              l10n.dairyGenderFemale,
              _gender == 'FEMALE',
              () => setState(() => _gender = 'FEMALE'),
            ),
            _chip(
              l10n.dairyGenderMale,
              _gender == 'MALE',
              () => setState(() => _gender = 'MALE'),
            ),
          ],
        ),
        _label(l10n.dairyAnimalsDob),
        TextField(
          controller: _dobCtrl,
          decoration: const InputDecoration(hintText: '2022-03-15'),
        ),
        if (_species == 'CATTLE' || _species == 'BUFFALO') ...[
          _label(l10n.dairyAnimalsLifecycle),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final lc in _lifecycleOptions)
                _chip(
                  lc.replaceAll('_', ' '),
                  lc == _lifecycle,
                  () => setState(() => _lifecycle = lc),
                  small: true,
                ),
            ],
          ),
        ],
        _label(l10n.dairyAnimalsPurchaseCost),
        TextField(
          controller: _purchaseCostCtrl,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(hintText: '65000'),
        ),
        _label(l10n.dairyAnimalsPurchaseDate),
        TextField(
          controller: _purchaseDateCtrl,
          decoration: const InputDecoration(hintText: '2024-08-10'),
        ),
        const SizedBox(height: AppSpacing.lg),
        Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: () {
                  _resetForm();
                  setState(() => _showForm = false);
                },
                child: Text(l10n.commonCancel),
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: ElevatedButton(
                onPressed: _saving ? null : _save,
                child: _saving
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : Text(l10n.dairyAnimalsSave),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _label(String text) => Padding(
    padding: const EdgeInsets.only(top: 14, bottom: 6),
    child: Text(
      text,
      style: const TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.w600,
        color: Color(0xFF444444),
      ),
    ),
  );

  Widget _chip(
    String label,
    bool selected,
    VoidCallback onTap, {
    bool small = false,
  }) {
    return InkWell(
      borderRadius: BorderRadius.circular(999),
      onTap: onTap,
      child: Container(
        padding: EdgeInsets.symmetric(
          horizontal: small ? 10 : 14,
          vertical: small ? 6 : 9,
        ),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: selected ? AppColors.brand : const Color(0xFFDDDDDD),
            width: 1.5,
          ),
          color: selected ? AppColors.accent : const Color(0xFFFAFAFA),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: small ? 11 : 13,
            fontWeight: FontWeight.w600,
            color: selected ? AppColors.brandDark : const Color(0xFF666666),
          ),
        ),
      ),
    );
  }
}
