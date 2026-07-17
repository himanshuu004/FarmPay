/**
 * DairyAnimal Model
 * Individual dairy animal owned by a farmer. Tracks tag, breed, age, purchase
 * economics, current lifecycle stage and exit info. Belongs directly to a
 * farmer (farmer_id) — herd_register_id retained as a soft anchor for legacy
 * grouping but no longer required.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class DairyAnimal extends Model {
    static associate(models) {
      DairyAnimal.belongsTo(models.User, { foreignKey: 'farmer_id', as: 'farmer' });
      DairyAnimal.belongsTo(models.DairyHerdRegister, { foreignKey: 'herd_register_id', as: 'herd' });
      DairyAnimal.hasMany(models.DairyAnimalHealthRecord, { foreignKey: 'animal_id', as: 'healthRecords' });
      DairyAnimal.hasMany(models.DairyMilkProductionLog, { foreignKey: 'animal_id', as: 'productionLogs' });
      DairyAnimal.hasMany(models.DairyBreedingRecord, { foreignKey: 'animal_id', as: 'legacyBreedingRecords' });
      if (models.DairyAnimalPhoto) {
        DairyAnimal.hasMany(models.DairyAnimalPhoto, { foreignKey: 'animal_id', sourceKey: 'animal_uuid', as: 'photos' });
      }
    }
  }

  DairyAnimal.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      animal_uuid: { type: DataTypes.STRING(36), allowNull: false, unique: true },
      farmer_id: { type: DataTypes.INTEGER, allowNull: true },
      herd_register_id: { type: DataTypes.INTEGER, allowNull: true },

      // Legacy fields (kept for backward compatibility)
      animal_type: {
        type: DataTypes.ENUM('cow', 'buffalo', 'goat', 'sheep'),
        allowNull: true,
      },
      breed: { type: DataTypes.STRING(100), allowNull: true },
      animal_identification_number: { type: DataTypes.STRING(50), allowNull: true },
      age_years: { type: DataTypes.INTEGER, allowNull: true },
      acquisition_date: { type: DataTypes.DATEONLY, allowNull: true },
      acquisition_cost: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
      current_market_value: { type: DataTypes.DECIMAL(15, 2), allowNull: true },

      // V2 fields (extended schema)
      tag_number: { type: DataTypes.STRING(50), allowNull: true },
      name: { type: DataTypes.STRING(80), allowNull: true },
      // v1: DAIRY full; goatery/poultry/piggery/sheep = register + logbook (CLAUDE.md).
      species: { type: DataTypes.ENUM('CATTLE', 'BUFFALO', 'GOAT', 'SHEEP', 'PIG', 'POULTRY'), allowNull: true },
      breed_code: { type: DataTypes.STRING(50), allowNull: true },
      gender: { type: DataTypes.ENUM('FEMALE', 'MALE'), allowNull: true },
      date_of_birth: { type: DataTypes.DATEONLY, allowNull: true },
      age_months: { type: DataTypes.INTEGER, allowNull: true },
      purchase_date: { type: DataTypes.DATEONLY, allowNull: true },
      purchase_cost: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      purchase_source: { type: DataTypes.STRING(120), allowNull: true },
      acquisition_mode: {
        type: DataTypes.ENUM('PURCHASED', 'BORN_ON_FARM', 'GIFTED'),
        allowNull: true,
      },
      current_lifecycle_stage: {
        type: DataTypes.ENUM(
          'CALF', 'HEIFER', 'DRY', 'EARLY_LACTATION', 'PEAK_LACTATION',
          'LATE_LACTATION', 'PREGNANT', 'BREEDING',
        ),
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM('ACTIVE', 'SOLD', 'DIED', 'CULLED'),
        allowNull: false,
        defaultValue: 'ACTIVE',
      },
      exit_date: { type: DataTypes.DATEONLY, allowNull: true },
      exit_reason: { type: DataTypes.STRING(200), allowNull: true },
      exit_value: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      primary_photo_url: { type: DataTypes.STRING(500), allowNull: true },
      notes: { type: DataTypes.TEXT, allowNull: true },

      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize,
      modelName: 'DairyAnimal',
      tableName: 'dairy_animals',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['animal_uuid'], unique: true },
        { fields: ['herd_register_id'] },
        { fields: ['farmer_id'] },
      ],
    },
  );

  return DairyAnimal;
};
