/**
 * apricot-budget — seed
 *
 * Seeds:
 *   1. System (global) categories, derived from the BNC CSV vocabulary
 *      plus a few common ones (Restaurant, Voyages, Cadeaux, ...).
 *   2. A demo user (only in NODE_ENV !== 'production').
 *
 * Run:  npx prisma db seed
 */

import { PrismaClient, CategoryDirection } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

type SeedCategory = {
  slug: string;
  name: string;
  direction: CategoryDirection;
  icon: string;
  color: string;
  sortOrder: number;
};

const CATEGORIES: SeedCategory[] = [
  // --- Dépenses (mirrors BNC categories) --------------------------
  { slug: 'epicerie',              name: 'Épicerie',              direction: 'EXPENSE', icon: 'shopping-cart',   color: 'coral',  sortOrder: 10 },
  { slug: 'nourriture-boisson',    name: 'Nourriture et boisson', direction: 'EXPENSE', icon: 'coffee',          color: 'coral',  sortOrder: 11 },
  { slug: 'restaurant',            name: 'Restaurant',            direction: 'EXPENSE', icon: 'tools-kitchen-2', color: 'coral',  sortOrder: 12 },
  { slug: 'loisirs',               name: 'Loisirs',               direction: 'EXPENSE', icon: 'device-gamepad',  color: 'purple', sortOrder: 20 },
  { slug: 'magasinage',            name: 'Magasinage',            direction: 'EXPENSE', icon: 'shopping-bag',    color: 'pink',   sortOrder: 30 },
  { slug: 'vetements',             name: 'Vêtements',             direction: 'EXPENSE', icon: 'hanger',          color: 'pink',   sortOrder: 31 },
  { slug: 'essence',               name: 'Essence',               direction: 'EXPENSE', icon: 'gas-station',     color: 'amber',  sortOrder: 40 },
  { slug: 'garage-entretien',      name: 'Garage et entretien',   direction: 'EXPENSE', icon: 'car-crash',       color: 'amber',  sortOrder: 41 },
  { slug: 'paiement-auto',         name: 'Paiement d\'auto',      direction: 'EXPENSE', icon: 'car',             color: 'amber',  sortOrder: 42 },
  { slug: 'hypotheque-loyer',      name: 'Hypothèque et loyer',   direction: 'EXPENSE', icon: 'home',            color: 'teal',   sortOrder: 50 },
  { slug: 'services-publics',      name: 'Services publics',      direction: 'EXPENSE', icon: 'bolt',            color: 'teal',   sortOrder: 51 },
  { slug: 'taxe-scolaire',         name: 'Taxe scolaire',         direction: 'EXPENSE', icon: 'school',          color: 'blue',   sortOrder: 52 },
  { slug: 'taxe-municipale',       name: 'Taxe municipale',       direction: 'EXPENSE', icon: 'building-community', color: 'blue', sortOrder: 53 },
  { slug: 'assurance',             name: 'Assurance',             direction: 'EXPENSE', icon: 'shield',          color: 'green',  sortOrder: 60 },
  { slug: 'assurance-vie',         name: 'Assurance vie',         direction: 'EXPENSE', icon: 'shield-heart',    color: 'green',  sortOrder: 61 },
  { slug: 'sante',                 name: 'Santé',                 direction: 'EXPENSE', icon: 'stethoscope',     color: 'pink',   sortOrder: 70 },
  { slug: 'education',             name: 'Éducation',             direction: 'EXPENSE', icon: 'school',          color: 'blue',   sortOrder: 71 },
  { slug: 'cadeaux',               name: 'Cadeaux',               direction: 'EXPENSE', icon: 'gift',            color: 'pink',   sortOrder: 72 },
  { slug: 'voyages',               name: 'Voyages',               direction: 'EXPENSE', icon: 'plane',           color: 'blue',   sortOrder: 73 },
  { slug: 'mon-entreprise',        name: 'Mon entreprise',        direction: 'EXPENSE', icon: 'building',        color: 'purple', sortOrder: 80 },
  { slug: 'frais',                 name: 'Frais',                 direction: 'EXPENSE', icon: 'receipt',         color: 'gray',   sortOrder: 90 },
  { slug: 'frais-bancaires',       name: 'Frais bancaires',       direction: 'EXPENSE', icon: 'building-bank',   color: 'gray',   sortOrder: 91 },
  { slug: 'paiement-carte-credit', name: 'Paiement carte de crédit', direction: 'EXPENSE', icon: 'credit-card',  color: 'red',    sortOrder: 92 },
  // --- Revenus -----------------------------------------------------------
  { slug: 'salaire',               name: 'Salaire',               direction: 'INCOME',  icon: 'cash',            color: 'green',  sortOrder: 100 },
  { slug: 'retour-impot',          name: 'Retour d\'impôt',       direction: 'INCOME',  icon: 'receipt-tax',     color: 'green',  sortOrder: 101 },
  { slug: 'investissements',       name: 'Investissements',       direction: 'INCOME',  icon: 'trending-up',     color: 'green',  sortOrder: 102 },
  { slug: 'remboursements-gouv',   name: 'Remboursements gouv.',  direction: 'INCOME',  icon: 'receipt-tax',     color: 'green',  sortOrder: 103 },
  // --- Transferts / neutre -----------------------------------------------
  { slug: 'transfert',             name: 'Transfert entre comptes', direction: 'TRANSFER', icon: 'arrows-exchange', color: 'gray', sortOrder: 200 },
  // Staging — utilisé uniquement à l'import quand le BNC classe un crédit
  // comme "Remboursement" sans info sur la source. Direction NEUTRAL pour
  // rester hors des rapports revenus/dépenses ; visible dans "À reclasser"
  // sur la page Budget pour forcer la classification manuelle vers soit :
  //   - la catégorie DÉPENSE originale (remb. marchand, ex. Santé pour un
  //     remboursement d'assurance physio ; nette contre le poste)
  //   - une catégorie REVENU (ex. Remboursements gouv. pour un crédit d'impôt)
  { slug: 'remboursement',         name: 'Remboursement (à reclasser)', direction: 'NEUTRAL', icon: 'refresh',    color: 'gray',   sortOrder: 210 },
  { slug: 'non-categorise',        name: 'Non catégorisé',        direction: 'NEUTRAL', icon: 'help',            color: 'gray',   sortOrder: 999 },
];

async function seedCategories() {
  console.log(`→ Seeding ${CATEGORIES.length} system categories...`);
  // Prisma's compound `upsert` rejects null in the unique key,
  // so we emulate upsert with findFirst + update/create.
  for (const c of CATEGORIES) {
    const existing = await prisma.category.findFirst({
      where: { userId: null, slug: c.slug },
      select: { id: true },
    });
    if (existing) {
      await prisma.category.update({
        where: { id: existing.id },
        data: {
          name:      c.name,
          direction: c.direction,
          icon:      c.icon,
          color:     c.color,
          sortOrder: c.sortOrder,
          isSystem:  true,
        },
      });
    } else {
      await prisma.category.create({
        data: {
          userId:    null,
          name:      c.name,
          slug:      c.slug,
          direction: c.direction,
          icon:      c.icon,
          color:     c.color,
          isSystem:  true,
          sortOrder: c.sortOrder,
        },
      });
    }
  }
}

async function seedDemoUser() {
  if (process.env.NODE_ENV === 'production') return;
  const email = 'demo@apricot.local';
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return;
  console.log('→ Creating demo user (demo@apricot.local / demo1234)');
  await prisma.user.create({
    data: {
      email,
      displayName: 'Démo',
      passwordHash: await bcrypt.hash('demo1234', 10),
      accounts: {
        create: [
          { name: 'Compte chèque BNC', type: 'ASSET',     subtype: 'CHECKING',    initialBalance: 3200,   institution: 'BNC', icon: 'building-bank', color: 'teal'  },
          { name: 'REER',                     type: 'ASSET',     subtype: 'INVESTMENT',  initialBalance: 42000,  institution: 'BNC', icon: 'trending-up',  color: 'green' },
          { name: 'Maison',                   type: 'ASSET',     subtype: 'REAL_ESTATE', initialBalance: 320000, icon: 'home',           color: 'blue' },
          { name: 'Hypothèque',               type: 'LIABILITY', subtype: 'MORTGAGE',    initialBalance: 118500, institution: 'BNC', icon: 'home',           color: 'red'  },
          { name: 'Mastercard',               type: 'LIABILITY', subtype: 'CREDIT_CARD', initialBalance: 1240,   institution: 'BNC', icon: 'credit-card',    color: 'red'  },
        ],
      },
    },
  });
}

async function main() {
  await seedCategories();
  await seedDemoUser();
  console.log('✓ Seed complete');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
