/**
 * ActivityPopTouchpoint — scoring touchpoints per activity. One row per
 * touchpoint per activity (e.g. Crop → 10 touchpoints). Optionally
 * linked to a stage via stageKey.
 */

module.exports = (sequelize, DataTypes) => {
  const ActivityPopTouchpoint = sequelize.define(
    'ActivityPopTouchpoint',
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
      },
      activityCode: {
        type: DataTypes.ENUM(
          'CROP', 'DAIRY', 'FISHERY', 'HORTI', 'VEG',
          'POULTRY', 'GOATERY', 'LABOUR_WAGE',
          'SHOP_BUSINESS', 'REMITTANCE', 'OTHER'
        ),
        allowNull: false,
        field: 'activity_code',
      },
      // '' = baseline; dedicated per-subtype templates override when present.
      subtypeCode: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: '',
        field: 'subtype_code',
      },
      touchpointNumber: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'touchpoint_number',
      },
      stageKey: {
        type: DataTypes.STRING(64),
        allowNull: true,
        field: 'stage_key',
      },
      cadence: {
        type: DataTypes.ENUM('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'PER_EVENT'),
        allowNull: true,
      },
      nameEn: { type: DataTypes.STRING(200), allowNull: false, field: 'name_en' },
      nameHi: { type: DataTypes.STRING(200), allowNull: true, field: 'name_hi' },
      descriptionEn: { type: DataTypes.TEXT, allowNull: true, field: 'description_en' },
      descriptionHi: { type: DataTypes.TEXT, allowNull: true, field: 'description_hi' },
      scoringCriteria: {
        type: DataTypes.JSON,
        allowNull: true,
        field: 'scoring_criteria',
      },
      requiredInputs: {
        type: DataTypes.JSON,
        allowNull: true,
        field: 'required_inputs',
      },
      expectedCostInr: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        field: 'expected_cost_inr',
      },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'is_active' },
    },
    {
      tableName: 'activity_pop_touchpoints',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['activity_code', 'subtype_code', 'touchpoint_number'], name: 'idx_pop_touchpoints_activity_number' },
      ],
    }
  );

  return ActivityPopTouchpoint;
};
