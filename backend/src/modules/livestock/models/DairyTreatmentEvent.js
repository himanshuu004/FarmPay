/**
 * DairyTreatmentEvent Model
 * Vet visits and treatments. Captures medicine cost, vet fee and other (e.g.
 * transport) cost separately, plus formal/informal split. Service layer
 * auto-creates a corresponding DairyCostEvent on save.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class DairyTreatmentEvent extends Model {
    static associate(models) {
      DairyTreatmentEvent.belongsTo(models.User, { foreignKey: 'farmer_id', as: 'farmer' });
    }
  }

  DairyTreatmentEvent.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      event_uuid: { type: DataTypes.STRING(36), allowNull: false, unique: true },
      farmer_id: { type: DataTypes.INTEGER, allowNull: false },
      animal_id: { type: DataTypes.STRING(36), allowNull: true },
      treatment_date: { type: DataTypes.DATEONLY, allowNull: false },
      condition: { type: DataTypes.STRING(200), allowNull: true },
      treatment_type: {
        type: DataTypes.ENUM(
          'VACCINATION', 'DEWORMING', 'MASTITIS', 'FEVER', 'INJURY',
          'REPRODUCTIVE', 'NUTRITIONAL', 'OTHER',
        ),
        allowNull: false,
        defaultValue: 'OTHER',
      },
      vet_name: { type: DataTypes.STRING(120), allowNull: true },
      vet_type: {
        type: DataTypes.ENUM('GOVT', 'PRIVATE', 'PARAVET', 'SELF'),
        allowNull: true,
      },
      medicine_cost: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      vet_fee: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      other_cost: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      cost_formal: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      cost_informal: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      cost_total: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      outcome: {
        type: DataTypes.ENUM('RECOVERED', 'IMPROVING', 'NO_CHANGE', 'WORSENED', 'DIED'),
        allowNull: true,
      },
      notes: { type: DataTypes.TEXT, allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize,
      modelName: 'DairyTreatmentEvent',
      tableName: 'dairy_treatment_events',
      timestamps: true,
      underscored: true,
    },
  );

  return DairyTreatmentEvent;
};
