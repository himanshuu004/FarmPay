/**
 * CIA notification templates (PRD Part 11). Seeded idempotently by ensureCiaTemplates
 * (findOrCreate on template_code) — there is no seeder migration for notification
 * templates, so the dispatcher ensures them on demand. Bodies are plain English;
 * local-language bodies go through NotificationTemplateTranslation (a follow-up).
 * Kept placeholder-free so substitution never leaks a raw {token}.
 */
let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

const TEMPLATES = [
  { code: 'CIA_EOI_RECEIVED', name: 'CIA interest received', body: 'Your interest in the cattle induction scheme has been received and shared with your dairy society.' },
  { code: 'CIA_DCS_DECISION', name: 'CIA society decision', body: 'Your dairy society board has recorded a decision on your cattle induction application. Open the app to see the status.' },
  { code: 'CIA_APPLICATION_RETURNED', name: 'CIA application returned', body: 'Your cattle induction application has been returned for correction. Please review and resubmit.' },
  { code: 'CIA_APPLICATION_INCOMPLETE', name: 'CIA application incomplete', body: 'Some documents in your cattle induction application need attention. Please check the app.' },
  { code: 'CIA_LOAN_SANCTIONED', name: 'CIA loan sanctioned', body: 'Good news — your cattle induction loan has been sanctioned by the bank.' },
  { code: 'CIA_SUBSIDY_TRANSFERRED', name: 'CIA subsidy transferred', body: 'The subsidy on your cattle induction loan has been transferred to the bank.' },
  { code: 'CIA_LOAN_DISBURSED', name: 'CIA loan disbursed', body: 'Your cattle induction loan has been disbursed. You can now begin the guided cattle purchase.' },
  { code: 'CIA_PURCHASE_APPROVED', name: 'CIA purchase approved', body: 'The veterinary officer has certified your cattle purchase. It can now proceed.' },
  { code: 'CIA_PURCHASE_REJECTED', name: 'CIA purchase rejected', body: 'The veterinary officer did not certify this cattle purchase. Please select another animal.' },
  { code: 'CIA_INSURANCE_ISSUED', name: 'CIA insurance issued', body: 'Insurance has been issued for your inducted cattle. The policy is in your vault.' },
  { code: 'CIA_SELLER_PAID', name: 'CIA seller paid', body: 'Payment to the cattle seller has been completed for your purchase.' },
  { code: 'CIA_EMI_OVERDUE', name: 'CIA EMI overdue', body: 'An EMI on your cattle induction loan is overdue. Please ensure milk supply so recovery can continue.' },
  { code: 'CIA_EMI_DEFAULT', name: 'CIA EMI default', body: 'An EMI on your cattle induction loan is in default. Please contact your dairy society.' },
  { code: 'CIA_LOAN_CLOSED', name: 'CIA loan closed', body: 'Your cattle induction loan is fully repaid and now closed. A no-dues certificate is available.' },
  { code: 'CIA_GRIEVANCE_RESOLVED', name: 'CIA grievance resolved', body: 'Your grievance has been resolved. Open the app to see the resolution.' },
];

/**
 * Idempotently ensure the CIA templates exist (findOrCreate by template_code).
 * Called once per relay run (not memoized — a test sync({force}) wipes the table,
 * and findOrCreate is a no-op when the rows already exist).
 */
const ensureCiaTemplates = async () => {
  const { NotificationTemplate } = getDb();
  for (const t of TEMPLATES) {
    // eslint-disable-next-line no-await-in-loop
    await NotificationTemplate.findOrCreate({
      where: { template_code: t.code },
      defaults: {
        template_code: t.code, template_name: t.name, category: 'cattle_induction',
        body_template: t.body, supported_channels: 'in_app,sms', priority: 'normal', is_active: true,
      },
    });
  }
};

module.exports = { TEMPLATES, ensureCiaTemplates };
