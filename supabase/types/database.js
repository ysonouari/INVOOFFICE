/**
 * Types de référence pour la base de données Supabase
 * Ce fichier est purement documentaire — il n'est pas utilisé par le code.
 * Il sert de référence pour le schéma de la base de données.
 *
 * Format : JSDoc (compatible avec l'autocomplétion dans VS Code)
 */

/**
 * @typedef {Object} Profile
 * @property {string} id - UUID, PK, FK → auth.users.id
 * @property {string} full_name - Nom complet
 * @property {string|null} email - Email
 * @property {string} whatsapp - Numéro WhatsApp
 * @property {'user'|'admin'} role - Rôle
 * @property {'pending'|'active'|'inactive'|'rejected'} status - Statut
 * @property {string} created_at - ISO 8601
 * @property {string} updated_at - ISO 8601
 */

/**
 * @typedef {Object} Plan
 * @property {string} id - UUID, PK
 * @property {string} name - Nom du plan
 * @property {string|null} description - Description
 * @property {number} price - Prix en centimes (30000 = 300 MAD)
 * @property {string} currency - Devise (MAD)
 * @property {boolean} is_lifetime - TRUE = accès à vie
 * @property {boolean} is_active - Plan actif
 * @property {number} sort_order - Ordre d'affichage
 * @property {string} created_at - ISO 8601
 * @property {string} updated_at - ISO 8601
 */

/**
 * @typedef {Object} Subscription
 * @property {string} id - UUID, PK
 * @property {string} user_id - UUID, FK → auth.users.id
 * @property {string} plan_id - UUID, FK → plans.id
 * @property {'pending'|'active'|'expired'|'cancelled'} status
 * @property {string|null} activated_at - ISO 8601
 * @property {string|null} expires_at - ISO 8601, NULL = à vie
 * @property {string} created_at - ISO 8601
 * @property {string} updated_at - ISO 8601
 */

/**
 * @typedef {Object} Payment
 * @property {string} id - UUID, PK
 * @property {string} user_id - UUID, FK → auth.users.id
 * @property {string|null} subscription_id - UUID, FK → subscriptions.id
 * @property {number} amount - Montant en centimes
 * @property {string} currency - Devise (MAD)
 * @property {'pending'|'completed'|'failed'|'refunded'} status
 * @property {'manual'|'online'|'wire_transfer'|'cash'} payment_method
 * @property {string|null} reference - Référence externe
 * @property {string|null} notes - Notes admin
 * @property {string|null} paid_at - ISO 8601
 * @property {string} created_at - ISO 8601
 * @property {string} updated_at - ISO 8601
 */

/**
 * @typedef {Object} AdminLog
 * @property {string} id - UUID, PK
 * @property {string} admin_id - UUID, FK → auth.users.id
 * @property {string|null} target_user_id - UUID, FK → auth.users.id
 * @property {string} action - Type d'action
 * @property {Object|null} details - Détails JSON
 * @property {string} created_at - ISO 8601
 */
