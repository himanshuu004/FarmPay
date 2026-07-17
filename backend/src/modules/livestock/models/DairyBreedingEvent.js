/**
 * DairyBreedingEvent Model
 * Each row = one breeding attempt (AI or natural service) for an animal.
 * Tracks 1st/2nd/3rd attempts via ai_attempt_number, captures formal/informal
 * costs, and chains pregnancy + calving outcomes.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class DairyBreedingEvent extends Model {
    static associate(models) {
      DairyBreedingEvent.belongsTo(models.User, { foreignKey: 'farmer_id', as: 'farmer' });
    }
  }

  DairyBreedingEvent.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      event_uuid: { type: DataTypes.STRING(36), allowNull: false, unique: true },
      farmer_id: { type: DataTypes.INTEGER, allowNull: false },
      animal_id: { type: DataTypes.STRING(36), allowNull: false },

      service_type: { type: DataTypes.ENUM('AI', 'NATURAL_SERVICE'), allowNull: false },
      ai_attempt_number: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      ai_date: { type: DataTypes.DATEONLY, allowNull: false },

      bull_code: { type: DataTypes.STRING(50), allowNull: true },
      breed_used: { type: DataTypes.STRING(50), allowNull: true },
      service_provider: { type: DataTypes.STRING(120), allowNull: true },
      service_provider_type: {
        type: DataTypes.ENUM('GOVT_VET', 'PRIVATE_VET', 'COOP_INSEMINATOR', 'SELF'),
        allowNull: true,
      },

      bull_owner_name: { type: DataTypes.STRING(120), allowNull: true },
      bull_owner_type: {
        type: DataTypes.ENUM('OWN', 'PEER', 'VILLAGE_BULL', 'BULL_STATION'),
        allowNull: true,
      },
      service_charge: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      transport_cost: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      gratuity_cost: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },

      cost_formal: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      cost_informal: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      cost_total: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },

      pregnancy_check_date: { type: DataTypes.DATEONLY, allowNull: true },
      pregnancy_confirmed: {
        type: DataTypes.ENUM('YES', 'NO', 'PENDING'),
        allowNull: false,
        defaultValue: 'PENDING',
      },
      expected_calving_date: { type: DataTypes.DATEONLY, allowNull: true },
      actual_calving_date: { type: DataTypes.DATEONLY, allowNull: true },
      calving_outcome: {
        type: DataTypes.ENUM('LIVE', 'STILLBORN', 'ABORTION', 'NA'),
        allowNull: true,
      },
      calf_animal_id: { type: DataTypes.STRING(36), allowNull: true },

      notes: { type: DataTypes.TEXT, allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize,
      modelName: 'DairyBreedingEvent',
      tableName: 'dairy_breeding_events',
      timestamps: true,
      underscored: true,
    },
  );

  return DairyBreedingEvent;
};
