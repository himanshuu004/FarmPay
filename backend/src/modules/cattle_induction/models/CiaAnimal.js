/**
 * CiaAnimal — the purchased animal. ear_tag_no is `^\d{12}$` and must be
 * registry-unique (Convention 32) — the same animal on two loans is blocked.
 * Photos/ear-tag image are live-captured and perceptual-hashed (reused-photo
 * detection). On disbursement/enrolment the animal also enters the `livestock`
 * register and the muzzle gallery (`identity`) — the asset-loan-policy triangle.
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CiaAnimal extends Model {
    static associate(models) {
      if (models.CiaPurchase) CiaAnimal.hasOne(models.CiaPurchase, { foreignKey: 'animal_id', as: 'purchase' });
    }
  }
  CiaAnimal.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    animal_uuid: { type: DataTypes.UUID, allowNull: false, unique: true },
    ear_tag_no: { type: DataTypes.STRING(12), allowNull: false, unique: true,
      validate: { is: /^\d{12}$/ } },
    ear_tag_photo_ref: { type: DataTypes.STRING(200), allowNull: false },
    species: { type: DataTypes.STRING(40), allowNull: false },
    breed: { type: DataTypes.STRING(60), allowNull: false },
    sex: { type: DataTypes.STRING(8), allowNull: false },
    age_months: { type: DataTypes.INTEGER, allowNull: true },
    pregnancy_status: { type: DataTypes.STRING(24), allowNull: true },
    daily_milk_yield: { type: DataTypes.DECIMAL(6, 2), allowNull: true },
    body_condition_score: { type: DataTypes.DECIMAL(3, 1), allowNull: true },
    colour_marks: { type: DataTypes.STRING(300), allowNull: true },
    estimated_market_value: { type: DataTypes.DECIMAL(12, 2), allowNull: true }, // vet (CIA-3)
    approved_purchase_price: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    photo_refs: { type: DataTypes.JSONB, allowNull: true },   // [{ref, phash}], live-capture
    video_ref: { type: DataTypes.STRING(200), allowNull: true },
    fitness_for_transport: { type: DataTypes.BOOLEAN, allowNull: true }, // vet e-sign (CIA-3)
    // Vet health/valuation data (PRD Part 7.3). Captured at the vet exam; previously
    // accepted by the validator but silently dropped (no column). Nullable — enforcing
    // PRD-mandatory-ness on APPROVE is a separate follow-up.
    test_milking: { type: DataTypes.DECIMAL(6, 2), allowNull: true },     // test-milking result (L/day)
    mastitis_screening: { type: DataTypes.STRING(24), allowNull: true },
    parity: { type: DataTypes.INTEGER, allowNull: true },
    lactation_number: { type: DataTypes.INTEGER, allowNull: true },
    last_calving_date: { type: DataTypes.DATEONLY, allowNull: true },
    expected_yield: { type: DataTypes.DECIMAL(6, 2), allowNull: true },
    horn_characteristics: { type: DataTypes.STRING(300), allowNull: true },
    dentition: { type: DataTypes.STRING(120), allowNull: true },
    vaccination_history: { type: DataTypes.JSONB, allowNull: true },      // [{vaccine, date}]
    deworming_history: { type: DataTypes.JSONB, allowNull: true },
    disease_history: { type: DataTypes.TEXT, allowNull: true },
    reproductive_history: { type: DataTypes.TEXT, allowNull: true },
    pregnancy_diagnosis: { type: DataTypes.STRING(24), allowNull: true },
  }, {
    sequelize, modelName: 'CiaAnimal', tableName: 'cia_animals',
    timestamps: true, underscored: true,
    indexes: [{ unique: true, fields: ['ear_tag_no'] }],
  });
  return CiaAnimal;
};
