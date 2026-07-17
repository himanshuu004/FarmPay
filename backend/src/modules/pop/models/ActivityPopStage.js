/**
 * ActivityPopStage — timeline stage definitions for an activity's Package
 * of Practices. One row per stage per activity (e.g. Crop → 10 stages).
 */

module.exports = (sequelize, DataTypes) => {
  const ActivityPopStage = sequelize.define(
    'ActivityPopStage',
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
      // '' = baseline template that applies to any subtype without its own
      // dedicated template. Specific values ('rice', 'broiler', ...) take
      // precedence when the service queries with a subtype code.
      subtypeCode: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: '',
        field: 'subtype_code',
      },
      stageKey: {
        type: DataTypes.STRING(64),
        allowNull: false,
        field: 'stage_key',
      },
      stageOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'stage_order',
      },
      labelEn: { type: DataTypes.STRING(120), allowNull: false, field: 'label_en' },
      labelHi: { type: DataTypes.STRING(120), allowNull: true, field: 'label_hi' },
      icon: { type: DataTypes.STRING(16), allowNull: true },
      descriptionEn: { type: DataTypes.TEXT, allowNull: true, field: 'description_en' },
      descriptionHi: { type: DataTypes.TEXT, allowNull: true, field: 'description_hi' },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'is_active' },
    },
    {
      tableName: 'activity_pop_stages',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['activity_code', 'subtype_code', 'stage_order'], name: 'idx_pop_stages_activity_order' },
      ],
    }
  );

  return ActivityPopStage;
};
