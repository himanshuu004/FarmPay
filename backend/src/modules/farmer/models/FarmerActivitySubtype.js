/**
 * FarmerActivitySubtype — per-farmer sub-type selections.
 *
 * One row per (farmer, activity_code, subtype_code). Unselects are soft
 * (is_active=false) so history is preserved for TRUST / DICE. Only the 4
 * activities that need sub-type capture are in the ENUM — dairy/fishery
 * carry their sub-dimension in their own profile tables.
 */

module.exports = (sequelize, DataTypes) => {
  const FarmerActivitySubtype = sequelize.define(
    'FarmerActivitySubtype',
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
      },
      farmerId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'farmer_id',
      },
      activityCode: {
        type: DataTypes.ENUM('CROP', 'HORTI', 'POULTRY', 'GOATERY'),
        allowNull: false,
        field: 'activity_code',
      },
      subtypeCode: {
        type: DataTypes.STRING(32),
        allowNull: false,
        field: 'subtype_code',
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'is_active',
      },
    },
    {
      tableName: 'farmer_activity_subtypes',
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: 'uniq_farmer_activity_subtype',
          unique: true,
          fields: ['farmer_id', 'activity_code', 'subtype_code'],
        },
        {
          name: 'idx_farmer_activity_active',
          fields: ['farmer_id', 'activity_code', 'is_active'],
        },
      ],
    }
  );

  return FarmerActivitySubtype;
};
