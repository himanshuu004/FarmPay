/**
 * CoopMembership — links a farmer (app user and/or ERP ref) to an Aanchal DCS.
 * Populated from the ERP member master (mock seed / filedrop / webhook / live).
 * The society graph is the group channel for NLM enrolment later (Phase 4).
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CoopMembership extends Model {
    static associate(models) {
      // Optional link to an app user once the member installs and links.
      if (models.User) {
        CoopMembership.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
      }
    }
  }
  CoopMembership.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    membership_uuid: { type: DataTypes.UUID, allowNull: false, unique: true },
    // ERP identity — the join key across all ERP-sourced records.
    farmer_ref: { type: DataTypes.STRING(40), allowNull: false, unique: true },
    society_ref: { type: DataTypes.STRING(40), allowNull: false },
    union_ref: { type: DataTypes.STRING(40), allowNull: true },
    federation_ref: { type: DataTypes.STRING(40), allowNull: true },
    member_name: { type: DataTypes.STRING(120), allowNull: true },
    mobile: { type: DataTypes.STRING(15), allowNull: true },
    joined_on: { type: DataTypes.DATEONLY, allowNull: true },
    // Nullable until the member links the app (ERP pre-link supported).
    user_id: { type: DataTypes.INTEGER, allowNull: true },
    link_status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'ERP_ONLY' }, // ERP_ONLY|LINKED
    // Freshness — honest "as of" for filedrop (T-1) data.
    source_mode: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'mock' },
    synced_at: { type: DataTypes.DATE, allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'CoopMembership', tableName: 'coop_memberships',
    timestamps: true, underscored: true,
  });
  return CoopMembership;
};
