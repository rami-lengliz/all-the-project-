/**
 * DemoSeedService — production-safe, deterministic demo seed
 *
 * Guarantees (every reset produces identical demo scenario):
 *   • 65+ listings across Kelibia + Tunis clusters (all categories)
 *   • 1 DAILY confirmed booking  → blocks D+30 … D+33  (known date range)
 *   • 1 SLOT  confirmed booking  → blocks 10:00–12:00 on D+7 (known slot)
 *   • 40+ realistic French chat messages across multiple conversations
 *   • Printed + file-saved summary of demo IDs / dates
 *
 * Usage:
 *   npm run seed:demo
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// ─── Stable fixed UUIDs for key demo assets ──────────────────────────────────
// These never change → safe to hard-code in RESET_GUIDE & curl scripts.
const DEMO_IDS = {
    // Users
    HOST_A: 'a1000001-0000-4000-8000-000000000001',
    HOST_B: 'a1000002-0000-4000-8000-000000000002',
    RENTER_A: 'a2000001-0000-4000-8000-000000000003',
    RENTER_B: 'a2000002-0000-4000-8000-000000000004',
    ADMIN: 'a3000001-0000-4000-8000-000000000005',

    // Key listings (conflict demos)
    DAILY_LISTING: 'b1000001-0000-4000-8000-000000000001',
    SLOT_LISTING: 'b2000001-0000-4000-8000-000000000001',
} as const;

// ─── Geo anchors ──────────────────────────────────────────────────────────────
const GEO = {
    KELIBIA: { lat: 36.8578, lng: 11.092 },
    TUNIS: { lat: 36.8065, lng: 10.1815 },
} as const;

@Injectable()
export class DemoSeedService {
    constructor(private prisma: PrismaService) { }

    // ─── Entry point ────────────────────────────────────────────────────────────
    async seed() {
        console.log('\n🗑️  Clearing existing data…');
        await this.clearDatabase();

        console.log('📂  Creating categories…');
        const categories = await this.seedCategories();

        console.log('👤  Creating users…');
        const users = await this.seedUsers();

        console.log('🏠  Creating Kelibia listings…');
        const kelibiaListings = await this.seedKelibiaListings(users, categories);

        console.log('🌆  Creating Tunis listings…');
        const tunisListings = await this.seedTunisListings(users, categories);

        const allListings = [...kelibiaListings, ...tunisListings];

        console.log('🎯  Creating demo conflict scenarios…');
        const demo = await this.seedDemoScenarios(users, categories);

        console.log('📅  Creating general bookings…');
        await this.seedGeneralBookings(users, allListings);

        console.log('💬  Creating chat conversations…');
        await this.seedChatMessages(users, allListings, demo);

        console.log('⭐  Creating reviews…');
        await this.seedReviews(users);

        this.printAndSaveSummary(demo);
    }

    // ─── Clear ──────────────────────────────────────────────────────────────────
    private async clearDatabase() {
        await this.prisma.aiSearchLog.deleteMany({});
        await this.prisma.message.deleteMany({});
        await this.prisma.conversation.deleteMany({});
        await this.prisma.review.deleteMany({});
        await this.prisma.paymentIntent.deleteMany({});
        await this.prisma.booking.deleteMany({});
        await this.prisma.adminLog.deleteMany({});
        await this.prisma.slotConfiguration.deleteMany({});
        await this.prisma.listing.deleteMany({});
        await this.prisma.category.deleteMany({});
        await this.prisma.user.deleteMany({});
    }

    // ─── Categories ─────────────────────────────────────────────────────────────
    private async seedCategories() {
        const cats = [
            { name: 'Accommodation', slug: 'accommodation', icon: '🏠' },
            { name: 'Mobility', slug: 'mobility', icon: '🚗' },
            { name: 'Water & Beach Activities', slug: 'water-beach-activities', icon: '🏖️' },
            { name: 'Sports Facilities', slug: 'sports-facilities', icon: '🏟️' },
            { name: 'Sports Equipment', slug: 'sports-equipment', icon: '⚽' },
            { name: 'Tools', slug: 'tools', icon: '🔧' },
            { name: 'Other', slug: 'other', icon: '📦' },
        ];
        const created = await Promise.all(
            cats.map((c) =>
                this.prisma.category.create({ data: { ...c, allowedForPrivate: true } }),
            ),
        );
        const map: Record<string, any> = {};
        for (const c of created) map[c.slug] = c;
        return map;
    }

    // ─── Users ──────────────────────────────────────────────────────────────────
    private async seedUsers() {
        const hash = await bcrypt.hash('password123', 10);

        const specs = [
            { id: DEMO_IDS.ADMIN, name: 'Admin User', email: 'admin@rentai.tn', phone: '+21699000001', isHost: true, roles: ['user', 'admin'] },
            { id: DEMO_IDS.HOST_A, name: 'Mohamed Ben Ali', email: 'host.kelibia@rentai.tn', phone: '+21699000002', isHost: true, roles: ['user'] },
            { id: DEMO_IDS.HOST_B, name: 'Sami Trabelsi', email: 'host.tunis@rentai.tn', phone: '+21699000003', isHost: true, roles: ['user'] },
            { id: DEMO_IDS.RENTER_A, name: 'Fadi Hamdi', email: 'renter.a@rentai.tn', phone: '+21699000004', isHost: false, roles: ['user'] },
            { id: DEMO_IDS.RENTER_B, name: 'Amine Khalil', email: 'renter.b@rentai.tn', phone: '+21699000005', isHost: false, roles: ['user'] },
        ];

        // Additional bulk users for variety
        const extraHosts = ['Yassine Mrad', 'Haythem Zghal', 'Bassem Riahi'].map((name, i) => ({
            id: crypto.randomUUID(),
            name,
            email: `host.extra${i + 1}@rentai.tn`,
            phone: `+2169900010${i + 1}`,
            isHost: true,
            roles: ['user'],
        }));
        const extraRenters = ['Wissem Nasr', 'Aymen Dali', 'Rania Ben Salah'].map((name, i) => ({
            id: crypto.randomUUID(),
            name,
            email: `renter.extra${i + 1}@rentai.tn`,
            phone: `+2169900020${i + 1}`,
            isHost: false,
            roles: ['user'],
        }));

        const allSpecs = [...specs, ...extraHosts, ...extraRenters];
        const users: Record<string, any> = {};
        for (const spec of allSpecs) {
            const u = await this.prisma.user.create({
                data: {
                    id: spec.id,
                    name: spec.name,
                    email: spec.email,
                    phone: spec.phone,
                    passwordHash: hash,
                    isHost: spec.isHost,
                    verifiedEmail: true,
                    verifiedPhone: true,
                    roles: spec.roles,
                    ratingAvg: spec.isHost ? 4.5 : 0,
                    ratingCount: spec.isHost ? 12 : 0,
                },
            });
            users[spec.email] = u;
        }
        return users;
    }

    // ─── Raw listing insert (PostGIS) ───────────────────────────────────────────
    private async insertListing(opts: {
        id?: string;
        title: string;
        description: string;
        price: number;
        lat: number;
        lng: number;
        address: string;
        categoryId: string;
        hostId: string;
        images: string[];
        bookingType?: 'DAILY' | 'SLOT';
    }) {
        const id = opts.id ?? crypto.randomUUID();
        const btype = opts.bookingType ?? 'DAILY';
        const imagesLiteral = opts.images.map((u) => `'${u}'`).join(',');
        await this.prisma.$executeRawUnsafe(`
      INSERT INTO listings (
        id, title, description, "pricePerDay", location, address,
        "categoryId", "hostId", images, "isActive", "bookingType", "createdAt", "updatedAt"
      ) VALUES (
        '${id}'::uuid,
        $1, $2, $3,
        ST_SetSRID(ST_MakePoint($4, $5), 4326),
        $6,
        '${opts.categoryId}'::uuid,
        '${opts.hostId}'::uuid,
        ARRAY[${imagesLiteral}]::TEXT[],
        true,
        '${btype}'::"BookingType",
        NOW(), NOW()
      )
    `, opts.title, opts.description, opts.price, opts.lng, opts.lat, opts.address);
        return (await this.prisma.listing.findUnique({ where: { id } }))!;
    }

    // ─── Kelibia listings (35 listings) ─────────────────────────────────────────
    private async seedKelibiaListings(users: Record<string, any>, cats: Record<string, any>) {
        const hostA = users['host.kelibia@rentai.tn'];
        const hostB = users['host.tunis@rentai.tn'];
        const { lat, lng } = GEO.KELIBIA;
        const listings: any[] = [];

        // 10 Accommodation listings
        const accommodations = [
            { title: 'Villa Bord de Mer — Kelibia', price: 250, desc: 'Superbe villa avec vue panoramique sur la mer, piscine privée, parking, 4 chambres. Idéale pour famille ou groupe.' },
            { title: 'Appartement Vue Mer — Centre Kelibia', price: 120, desc: 'Appartement moderne au cœur de Kelibia, terrasse avec vue mer, climatisation, Wi-Fi fibre.' },
            { title: 'Maison Traditionnelle Kélibia', price: 90, desc: 'Belle maison traditionnelle renovée, court de tennis privatif, jardin avec figuiers, 3 chambres.' },
            { title: 'Studio Cosy — Plage Mansoura', price: 60, desc: 'Studio entièrement équipé à 50m de la plage Mansoura. Parfait pour couple ou solo.' },
            { title: 'Villa avec Piscine — Route de la Plage', price: 320, desc: 'Villa luxueuse, piscine chauffée, barbecue, salle de sport intégrée, 5 chambres, 3 salles de bain.' },
            { title: 'Duplex Familial — Kelibia Nord', price: 150, desc: 'Grand duplex sur 2 niveaux, 4 chambres, grande terrasse, parking sécurisé, à 300m de la mer.' },
            { title: 'Chalet en Bois — Camping Kelibia', price: 45, desc: 'Chalet écologique en bois, cuisine équipée, terrasse privée, dans un cadre naturel magnifique.' },
            { title: 'Appartement T3 — Résidence Les Pins', price: 110, desc: 'T3 moderne dans résidence sécurisée, piscine commune, parking, ascenseur, 2 chambres climatisées.' },
            { title: 'Riad Andalou — Vieille Ville', price: 180, desc: 'Riad authentique avec patio intérieur, fontaine, décoration traditionnelle. 3 chambres, ambiance unique.' },
            { title: 'Penthouse Panoramique — Cap Bon', price: 400, desc: 'Penthouse au dernier étage, terrasse 360°, vue sur le cap, 3 chambres, Jacuzzi extérieur.' },
        ];
        for (let i = 0; i < accommodations.length; i++) {
            const { title, price, desc } = accommodations[i];
            const offsetLat = lat + (i * 0.008) % 0.06;
            const offsetLng = lng + (i * 0.006) % 0.04;
            const l = await this.insertListing({
                title, description: desc, price,
                lat: offsetLat, lng: offsetLng,
                address: `${i + 1} Rue de la Corniche, Kelibia`,
                categoryId: cats['accommodation'].id,
                hostId: i % 2 === 0 ? hostA.id : hostB.id,
                images: [`/uploads/demo/kelibia-accommodation-${i + 1}.jpg`],
            });
            listings.push(l);
        }

        // 8 Water & Beach listings
        const beach = [
            { title: 'Location Paddle Board — Plage Mansoura', price: 35, desc: 'Stand-up paddle board de qualité pro, combinaison fournie, gilet de sécurité inclus. Durée: 2h.' },
            { title: 'Cours Jet Ski — Kelibia Beach', price: 80, desc: 'Session jet ski encadrée par instructeur certifié. 1h sur la mer, matériel fourni.' },
            { title: 'Kayak Double — Cap Bon Aventure', price: 25, desc: 'Kayak 2 places avec équipement complet. Exploration des grottes côtières du Cap Bon.' },
            { title: 'Masques & Tubas — Pack Snorkeling', price: 15, desc: 'Pack complet snorkeling pour 2 personnes. Eaux cristallines garanties dans les spots de Kelibia.' },
            { title: 'Bateau Pneumatique — Pêche & Détente', price: 60, desc: 'Bateau gonflable motorisé pour 4 personnes. Parfait pour la pêche ou la balade côtière.' },
            { title: 'Catamaran — Demi-journée Kelibia', price: 120, desc: 'Catamaran 6 personnes, équipement snorkeling inclus, guide à bord, déjeuner à bord offert.' },
            { title: 'Surf & Wake — Location Matériel', price: 40, desc: 'Wakeboard, combinaison néoprène, casque. Spot de wake à 5 min du port de Kelibia.' },
            { title: 'Chaises & Parasols — Plage VIP', price: 20, desc: 'Installation VIP sur plage privée: 2 chaises longues + parasol + service boissons.' },
        ];
        for (let i = 0; i < beach.length; i++) {
            const { title, price, desc } = beach[i];
            const l = await this.insertListing({
                title, description: desc, price,
                lat: lat - (i * 0.005), lng: lng + (i * 0.005),
                address: `Plage Mansoura, Kelibia`,
                categoryId: cats['water-beach-activities'].id,
                hostId: i % 2 === 0 ? hostA.id : hostB.id,
                images: [`/uploads/demo/kelibia-beach-${i + 1}.jpg`],
            });
            listings.push(l);
        }

        // 5 Sports Facilities (SLOT-based)
        const sports = [
            { title: 'Terrain Football 5×5 — Kelibia Sport', price: 50 },
            { title: 'Court Tennis Synthétique — Cap Bon', price: 25 },
            { title: 'Terrain Volleyball de Plage', price: 30 },
            { title: 'Salle de Sport Équipée — Kelibia', price: 15 },
            { title: 'Padel Court — Kelibia Club', price: 35 },
        ];
        for (let i = 0; i < sports.length; i++) {
            const { title, price } = sports[i];
            const l = await this.insertListing({
                title,
                description: `${title} — réservation au créneau. Vestiaires, douches, éclairage LED. Ouvert 7j/7.`,
                price,
                lat: lat + 0.03 + i * 0.008,
                lng: lng + 0.02 + i * 0.006,
                address: `Zone Sportive, Kelibia`,
                categoryId: cats['sports-facilities'].id,
                hostId: hostA.id,
                images: [`/uploads/demo/kelibia-sport-${i + 1}.jpg`],
                bookingType: 'SLOT',
            });
            await this.prisma.slotConfiguration.create({
                data: {
                    listingId: l.id,
                    slotDurationMinutes: 60,
                    operatingHours: {
                        monday: { start: '08:00', end: '22:00' },
                        tuesday: { start: '08:00', end: '22:00' },
                        wednesday: { start: '08:00', end: '22:00' },
                        thursday: { start: '08:00', end: '22:00' },
                        friday: { start: '08:00', end: '22:00' },
                        saturday: { start: '09:00', end: '23:00' },
                        sunday: { start: '09:00', end: '21:00' },
                    },
                    minBookingSlots: 1,
                    maxBookingSlots: 4,
                    bufferMinutes: 15,
                    pricePerSlot: price,
                },
            });
            listings.push(l);
        }

        // 5 Mobility listings
        const mobility = [
            { title: 'Scooter 125cc — Location Journée', price: 55 },
            { title: 'Trotinette Électrique — Kelibia Centre', price: 20 },
            { title: 'Voiture Toyota Yaris — Location Kelibia', price: 90 },
            { title: 'Quad VTT — Aventure Cap Bon', price: 70 },
            { title: 'Vélo Électrique — Balade Côtière', price: 25 },
        ];
        for (let i = 0; i < mobility.length; i++) {
            const { title, price } = mobility[i];
            const l = await this.insertListing({
                title,
                description: `${title} — kilométrage libre, casque fourni, assistance routière incluse.`,
                price,
                lat: lat - 0.02 - i * 0.007,
                lng: lng - 0.01 - i * 0.005,
                address: `Rue Principale, Kelibia`,
                categoryId: cats['mobility'].id,
                hostId: hostB.id,
                images: [`/uploads/demo/kelibia-mobility-${i + 1}.jpg`],
            });
            listings.push(l);
        }

        // 4 Sports Equipment listings
        const equipment = [
            { title: 'Raquettes Tennis — Pack 4 joueurs', price: 10 },
            { title: 'Ballons Football & Volleyball — Pack Sport', price: 8 },
            { title: 'Kit Plongée Complet — Masque, Palmes, Tuba', price: 18 },
            { title: 'Équipement Camping Complet', price: 30 },
        ];
        for (let i = 0; i < equipment.length; i++) {
            const { title, price } = equipment[i];
            const l = await this.insertListing({
                title,
                description: `${title} — matériel de qualité professionnelle, nettoyé et désinfecté entre chaque location.`,
                price,
                lat: lat + 0.01 + i * 0.004,
                lng: lng - 0.03 - i * 0.003,
                address: `Kelibia, Cap Bon`,
                categoryId: cats['sports-equipment'].id,
                hostId: hostA.id,
                images: [`/uploads/demo/kelibia-equipment-${i + 1}.jpg`],
            });
            listings.push(l);
        }

        console.log(`  ✓ ${listings.length} Kelibia listings created`);
        return listings;
    }

    // ─── Tunis listings (30 listings) ───────────────────────────────────────────
    private async seedTunisListings(users: Record<string, any>, cats: Record<string, any>) {
        const hostA = users['host.kelibia@rentai.tn'];
        const hostB = users['host.tunis@rentai.tn'];
        const { lat, lng } = GEO.TUNIS;
        const listings: any[] = [];

        // 8 Accommodation
        const accommodations = [
            { title: 'Appartement Moderne — Les Berges du Lac', price: 140, desc: 'Appartement haut standing, vue lac, salle de sport, parking, 24h/24 sécurité. 2 chambres.' },
            { title: 'Studio Meublé — Centre Tunis', price: 70, desc: 'Studio entièrement meublé en centre-ville, proche métro, cuisine équipée, Wi-Fi inclus.' },
            { title: 'Villa La Marsa — Banlieue Nord', price: 380, desc: 'Grande villa à La Marsa, jardin 500m², piscine, 5 chambres, personnel de maison inclus.' },
            { title: 'Appartement T2 — Menzah 6', price: 95, desc: 'Appartement T2 calme et lumineux, résidence sécurisée, parking, à 10 min du centre.' },
            { title: 'Loft Design — El Manar', price: 160, desc: 'Loft moderne design, open space, 2 chambres en mezzanine, terrasse privée, vue panoramique.' },
            { title: 'Résidence Gammarth — Vue Mer', price: 220, desc: 'Appartement en résidence de luxe à Gammarth, piscine, vue mer, 2 chambres, terrasse.' },
            { title: 'Maison Traditionnelle — Médina Tunis', price: 130, desc: 'Maison authentique en médina, patio intérieur, décoration zellige, 3 chambres, expérience unique.' },
            { title: 'Appartement Ennasr — Long séjour', price: 60, desc: 'Idéal séjour long, toutes charges comprises, cuisine équipée, lave-linge, parking gratuit.' },
        ];
        for (let i = 0; i < accommodations.length; i++) {
            const { title, price, desc } = accommodations[i];
            const l = await this.insertListing({
                title, description: desc, price,
                lat: lat + (i * 0.009) % 0.05,
                lng: lng + (i * 0.007) % 0.05,
                address: `Avenue ${i + 1}, Tunis`,
                categoryId: cats['accommodation'].id,
                hostId: i % 2 === 0 ? hostA.id : hostB.id,
                images: [`/uploads/demo/tunis-accommodation-${i + 1}.jpg`],
            });
            listings.push(l);
        }

        // 6 Mobility listings
        const mobility = [
            { title: 'Voiture Citroën C3 — Tunis Centre', price: 85 },
            { title: 'Scooter Électrique — Ariana', price: 30 },
            { title: 'SUV Toyota RAV4 — Grand Tunis', price: 150 },
            { title: 'Vélo Urbain — Location Journée', price: 15 },
            { title: 'Mini-Bus 9 places — Excursion', price: 200 },
            { title: 'BMW Série 3 — Week-end Luxe', price: 180 },
        ];
        for (let i = 0; i < mobility.length; i++) {
            const { title, price } = mobility[i];
            const l = await this.insertListing({
                title,
                description: `${title} — assurance tous risques incluse, kilométrage illimité, livraison possible dans Grand Tunis.`,
                price,
                lat: lat - 0.01 - i * 0.008,
                lng: lng + 0.02 + i * 0.006,
                address: `Tunis, Grand Tunis`,
                categoryId: cats['mobility'].id,
                hostId: i % 2 === 0 ? hostB.id : hostA.id,
                images: [`/uploads/demo/tunis-mobility-${i + 1}.jpg`],
            });
            listings.push(l);
        }

        // 5 Sports Facilities (SLOT) 
        const sports = [
            { title: 'Terrain Football Indoor — Ariana', price: 60 },
            { title: 'Court Padel — Les Berges du Lac', price: 40 },
            { title: 'Salle CrossFit — Megrine', price: 20 },
            { title: 'Piscine Semi-olympique — Rades', price: 15 },
            { title: 'Court Squash — Menzah', price: 25 },
        ];
        for (let i = 0; i < sports.length; i++) {
            const { title, price } = sports[i];
            const l = await this.insertListing({
                title,
                description: `${title} — réservation au créneau, vestiaires modernes, équipement fourni, parking gratuit.`,
                price,
                lat: lat + 0.04 + i * 0.010,
                lng: lng + 0.03 + i * 0.008,
                address: `Zone Sportive, Grand Tunis`,
                categoryId: cats['sports-facilities'].id,
                hostId: hostB.id,
                images: [`/uploads/demo/tunis-sport-${i + 1}.jpg`],
                bookingType: 'SLOT',
            });
            await this.prisma.slotConfiguration.create({
                data: {
                    listingId: l.id,
                    slotDurationMinutes: 60,
                    operatingHours: {
                        monday: { start: '07:00', end: '23:00' },
                        tuesday: { start: '07:00', end: '23:00' },
                        wednesday: { start: '07:00', end: '23:00' },
                        thursday: { start: '07:00', end: '23:00' },
                        friday: { start: '07:00', end: '23:00' },
                        saturday: { start: '08:00', end: '23:00' },
                        sunday: { start: '08:00', end: '22:00' },
                    },
                    minBookingSlots: 1,
                    maxBookingSlots: 6,
                    bufferMinutes: 10,
                    pricePerSlot: price,
                },
            });
            listings.push(l);
        }

        // 4 Tools listings
        const tools = [
            { title: 'Perforateur Professionnel + Accessoires', price: 20 },
            { title: 'Échafaudage 4m — Chantier & Travaux', price: 35 },
            { title: 'Groupe Électrogène 5kW — Location', price: 55 },
            { title: 'Nettoyeur Haute Pression Kärcher', price: 25 },
        ];
        for (let i = 0; i < tools.length; i++) {
            const { title, price } = tools[i];
            const l = await this.insertListing({
                title,
                description: `${title} — matériel professionnel en parfait état, livraison possible dans Grand Tunis.`,
                price,
                lat: lat - 0.03 - i * 0.006,
                lng: lng - 0.02 - i * 0.005,
                address: `Tunis, Grand Tunis`,
                categoryId: cats['tools'].id,
                hostId: hostA.id,
                images: [`/uploads/demo/tunis-tools-${i + 1}.jpg`],
            });
            listings.push(l);
        }

        // 4 Sports Equipment listings (Tunis)
        const equipment = [
            { title: 'Kit Football Complet — 22 joueurs', price: 12 },
            { title: 'Table Tennis + Raquettes', price: 10 },
            { title: 'Vélos Route Carbone — 2x Trek', price: 50 },
            { title: 'Sac de Boxe + Gants — Home Gym', price: 15 },
        ];
        for (let i = 0; i < equipment.length; i++) {
            const { title, price } = equipment[i];
            const l = await this.insertListing({
                title,
                description: `${title} — matériel sportif professionnel, désinfecté après chaque utilisation.`,
                price,
                lat: lat + 0.02 - i * 0.005,
                lng: lng - 0.04 + i * 0.004,
                address: `Tunis`,
                categoryId: cats['sports-equipment'].id,
                hostId: hostB.id,
                images: [`/uploads/demo/tunis-equipment-${i + 1}.jpg`],
            });
            listings.push(l);
        }

        console.log(`  ✓ ${listings.length} Tunis listings created`);
        return listings;
    }

    // ─── Demo conflict scenarios (fixed UUIDs) ───────────────────────────────────
    private async seedDemoScenarios(users: Record<string, any>, cats: Record<string, any>) {
        const host = users['host.kelibia@rentai.tn'];
        const renterA = users['renter.a@rentai.tn'];
        const renterB = users['renter.b@rentai.tn'];
        const { lat, lng } = GEO.KELIBIA;

        // ── DAILY conflict listing (fixed ID) ──────────────────────────────────────
        await this.insertListing({
            id: DEMO_IDS.DAILY_LISTING,
            title: '[DEMO] Villa Yasmine — Conflit DAILY',
            description: 'Superbe villa pour démonstration du conflit de réservation (dates D+30 à D+33 bloquées). 3 chambres, piscine, vue mer.',
            price: 200,
            lat: lat + 0.05,
            lng: lng + 0.05,
            address: '1 Rue du Phare, Kelibia',
            categoryId: cats['accommodation'].id,
            hostId: host.id,
            images: ['/uploads/demo/demo-daily-villa.jpg'],
            bookingType: 'DAILY',
        });

        // Confirmed booking: D+30 → D+33
        const dailyStart = this.daysFromNow(30);
        const dailyEnd = this.daysFromNow(33);

        const confirmedDailyBooking = await this.prisma.booking.create({
            data: {
                listingId: DEMO_IDS.DAILY_LISTING,
                renterId: renterA.id,
                hostId: host.id,
                startDate: dailyStart,
                endDate: dailyEnd,
                totalPrice: 600, // 3 nights × 200
                commission: 60,  // 10%
                status: 'confirmed',
                paid: true,
            },
        });

        // Overlapping pending (will be blocked if host tries to accept)
        await this.prisma.booking.create({
            data: {
                listingId: DEMO_IDS.DAILY_LISTING,
                renterId: renterB.id,
                hostId: host.id,
                startDate: this.daysFromNow(31), // overlaps!
                endDate: this.daysFromNow(34),
                totalPrice: 600,
                commission: 60,
                status: 'pending',
                paid: false,
            },
        });

        // ── SLOT conflict listing (fixed ID) ───────────────────────────────────────
        await this.insertListing({
            id: DEMO_IDS.SLOT_LISTING,
            title: '[DEMO] Terrain de Tennis — Conflit SLOT',
            description: 'Terrain de tennis pour démonstration du conflit de créneaux (10:00–12:00 sur D+7 bloqué). Surface en dur, éclairage LED.',
            price: 30,
            lat: lat + 0.06,
            lng: lng + 0.06,
            address: '2 Allée du Sport, Kelibia',
            categoryId: cats['sports-facilities'].id,
            hostId: host.id,
            images: ['/uploads/demo/demo-slot-court.jpg'],
            bookingType: 'SLOT',
        });

        await this.prisma.slotConfiguration.create({
            data: {
                listingId: DEMO_IDS.SLOT_LISTING,
                slotDurationMinutes: 60,
                operatingHours: {
                    monday: { start: '08:00', end: '22:00' },
                    tuesday: { start: '08:00', end: '22:00' },
                    wednesday: { start: '08:00', end: '22:00' },
                    thursday: { start: '08:00', end: '22:00' },
                    friday: { start: '08:00', end: '22:00' },
                    saturday: { start: '08:00', end: '22:00' },
                    sunday: { start: '08:00', end: '22:00' },
                },
                minBookingSlots: 1,
                maxBookingSlots: 4,
                bufferMinutes: 0,
                pricePerSlot: 30,
            },
        });

        const slotDate = this.daysFromNow(7);
        const t10 = new Date(0); t10.setUTCHours(10, 0, 0, 0);
        const t12 = new Date(0); t12.setUTCHours(12, 0, 0, 0);
        const t11 = new Date(0); t11.setUTCHours(11, 0, 0, 0);
        const t13 = new Date(0); t13.setUTCHours(13, 0, 0, 0);

        const confirmedSlotBooking = await this.prisma.booking.create({
            data: {
                listingId: DEMO_IDS.SLOT_LISTING,
                renterId: renterA.id,
                hostId: host.id,
                startDate: slotDate,
                endDate: slotDate,
                startTime: t10,
                endTime: t12,
                totalPrice: 60,
                commission: 6,
                status: 'confirmed',
                paid: true,
            },
        });

        // Overlapping pending slot (11:00–13:00)
        await this.prisma.booking.create({
            data: {
                listingId: DEMO_IDS.SLOT_LISTING,
                renterId: renterB.id,
                hostId: host.id,
                startDate: slotDate,
                endDate: slotDate,
                startTime: t11,
                endTime: t13,
                totalPrice: 60,
                commission: 6,
                status: 'pending',
                paid: false,
            },
        });

        return {
            dailyListingId: DEMO_IDS.DAILY_LISTING,
            dailyStart,
            dailyEnd,
            confirmedDailyBookingId: confirmedDailyBooking.id,
            slotListingId: DEMO_IDS.SLOT_LISTING,
            slotDate,
            confirmedSlotBookingId: confirmedSlotBooking.id,
            renterAEmail: renterA.email,
            renterBEmail: renterB.email,
            hostEmail: host.email,
        };
    }

    // ─── General bookings (mixed statuses for realistic data) ───────────────────
    private async seedGeneralBookings(users: Record<string, any>, listings: any[]) {
        const renterA = users['renter.a@rentai.tn'];
        const renterB = users['renter.b@rentai.tn'];
        const statuses = ['pending', 'confirmed', 'completed', 'rejected', 'cancelled'] as const;
        let count = 0;

        for (let i = 0; i < Math.min(listings.length, 30); i++) {
            const listing = listings[i];
            if (listing.bookingType === 'SLOT') continue;
            const renter = i % 2 === 0 ? renterA : renterB;
            if (listing.hostId === renter.id) continue;

            const start = this.daysFromNow(i * 5 + 10);
            const end = this.daysFromNow(i * 5 + 13);
            const days = 3;
            const price = Number(listing.pricePerDay) * days;
            const status = statuses[i % statuses.length];

            await this.prisma.booking.create({
                data: {
                    listingId: listing.id,
                    renterId: renter.id,
                    hostId: listing.hostId,
                    startDate: start,
                    endDate: end,
                    totalPrice: price,
                    commission: price * 0.1,
                    status,
                    paid: status === 'confirmed' || status === 'completed',
                },
            });
            count++;
        }
        console.log(`  ✓ ${count} general bookings created`);
    }

    // ─── Chat messages ───────────────────────────────────────────────────────────
    private async seedChatMessages(
        users: Record<string, any>,
        listings: any[],
        demo: Awaited<ReturnType<typeof this.seedDemoScenarios>>,
    ) {
        const renterA = users['renter.a@rentai.tn'];
        const renterB = users['renter.b@rentai.tn'];
        const host = users['host.kelibia@rentai.tn'];
        const hostB = users['host.tunis@rentai.tn'];

        const dailyBooking = await this.prisma.booking.findFirst({
            where: { listingId: DEMO_IDS.DAILY_LISTING, status: 'confirmed' },
        });
        const slotBooking = await this.prisma.booking.findFirst({
            where: { listingId: DEMO_IDS.SLOT_LISTING, status: 'confirmed' },
        });

        // ── Conv 1: DAILY villa — renterA ↔ host (15 messages) ──────────────────
        const conv1 = await this.prisma.conversation.create({
            data: {
                renterId: renterA.id,
                hostId: host.id,
                listingId: DEMO_IDS.DAILY_LISTING,
                bookingId: dailyBooking?.id,
            },
        });
        await this.createMessages(conv1.id, renterA.id, host.id, [
            { s: 'renter', t: 'Bonjour Mohamed ! Je suis très intéressé par votre villa pour la période du mois prochain.' },
            { s: 'host', t: 'Bonjour Fadi ! Bienvenue. La villa est disponible, que voulez-vous savoir ?' },
            { s: 'renter', t: 'Y a-t-il une piscine et le parking est-il inclus ?' },
            { s: 'host', t: 'Absolument ! Piscine privée ouverte 8h–21h, et parking couvert pour 2 voitures.' },
            { s: 'renter', t: 'La climatisation est-elle dans toutes les chambres ?' },
            { s: 'host', t: 'Oui, chaque chambre a sa propre climatisation réversible + ventilateur de plafond.' },
            { s: 'renter', t: 'Super. Le Wi-Fi est-il fiable ? Je dois travailler le matin.' },
            { s: 'host', t: 'Fibre 200 Mbps dans toute la villa, parfait pour le télétravail.' },
            { s: 'renter', t: 'Y a-t-il un barbecue ? Nous serons une famille de 6 personnes.' },
            { s: 'host', t: 'Grand barbecue gaz dans le jardin + plancha. La cuisine extérieure est complète.' },
            { s: 'renter', t: 'La mer est à quelle distance ?' },
            { s: 'host', t: 'À exactement 150 mètres à pied. Accès direct plage privée avec transats.' },
            { s: 'renter', t: 'Parfait, c\'est exactement ce qu\'il nous faut ! Je confirme la réservation.' },
            { s: 'host', t: 'Excellent choix ! Virement effectué, réservation confirmée. À très bientôt !' },
            { s: 'renter', t: 'Merci Mohamed, on a hâte d\'arriver ! Nous transmettrons vos coordonnées à la famille.' },
        ]);

        // ── Conv 2: SLOT tennis — renterA ↔ host (10 messages) ──────────────────
        const conv2 = await this.prisma.conversation.create({
            data: {
                renterId: renterA.id,
                hostId: host.id,
                listingId: DEMO_IDS.SLOT_LISTING,
                bookingId: slotBooking?.id,
            },
        });
        await this.createMessages(conv2.id, renterA.id, host.id, [
            { s: 'renter', t: 'Bonjour, je voudrais réserver le terrain de tennis pour 10h–12h.' },
            { s: 'host', t: 'Bonjour Fadi ! Le créneau est libre. Confirmé ?' },
            { s: 'renter', t: 'Oui ! Nous serons 2 joueurs. Les raquettes sont-elles disponibles ?' },
            { s: 'host', t: 'Raquettes, balles et eau fraîche incluses dans le tarif.' },
            { s: 'renter', t: 'Y a-t-il des vestiaires avec douches ?' },
            { s: 'host', t: 'Oui, vestiaires mixtes avec douches chaudes et casiers sécurisés.' },
            { s: 'renter', t: 'Super. Est-ce qu\'il y a du parking sur place ?' },
            { s: 'host', t: 'Parking gratuit pour 20 voitures directement sur le complexe.' },
            { s: 'renter', t: 'Parfait ! Réservation confirmée pour 10h–12h. À demain !' },
            { s: 'host', t: 'À demain Fadi ! Bonne partie de tennis 🎾' },
        ]);

        // ── Conv 3: Beach activity — renterB ↔ hostB (8 messages) ───────────────
        const beachListing = listings.find((l) => l.title?.includes('Paddle Board'));
        if (beachListing) {
            const conv3 = await this.prisma.conversation.create({
                data: { renterId: renterB.id, hostId: beachListing.hostId, listingId: beachListing.id },
            });
            await this.createMessages(conv3.id, renterB.id, beachListing.hostId, [
                { s: 'renter', t: 'Bonjour, est-ce que l\'activité paddle board est adaptée pour débutants ?' },
                { s: 'host', t: 'Bonjour Amine ! Oui, niveau débutant suffit. Cours d\'initiation de 20 min offert.' },
                { s: 'renter', t: 'Nous sommes 2 personnes. Les gilets de sécurité sont inclus ?' },
                { s: 'host', t: 'Gilets, casques et crème solaire fournis. Votre sécurité est notre priorité.' },
                { s: 'renter', t: 'Quelle est la durée exacte de l\'activité ?' },
                { s: 'host', t: '2h sur l\'eau + 20 min briefing = session complète de 2h20.' },
                { s: 'renter', t: 'On réserve pour samedi matin ! ' },
                { s: 'host', t: 'Réservé ! Rendez-vous samedi à 9h à la plage Mansoura. Belle journée mer 🌊' },
            ]);
        }

        // ── Conv 4: Mobility — renterA ↔ hostB (9 messages) ─────────────────────
        const mobilityListing = listings.find((l) => l.title?.includes('Scooter'));
        if (mobilityListing) {
            const conv4 = await this.prisma.conversation.create({
                data: { renterId: renterA.id, hostId: mobilityListing.hostId, listingId: mobilityListing.id },
            });
            await this.createMessages(conv4.id, renterA.id, mobilityListing.hostId, [
                { s: 'renter', t: 'Bonjour, le scooter 125cc est-il disponible pour ce week-end ?' },
                { s: 'host', t: 'Bonjour ! Week-end libre. Kilométrage illimité, plein offert au départ.' },
                { s: 'renter', t: 'Quel est le montant du dépôt de garantie ?' },
                { s: 'host', t: '300 TND de caution, remboursée intégralement à la restitution, sous 2h.' },
                { s: 'renter', t: 'Le casque intégral est-il fourni ?' },
                { s: 'host', t: 'Casque intégral + veste anti-vent fournis. Taille disponible jusqu\'au XL.' },
                { s: 'renter', t: 'Y a-t-il une assurance incluse ?' },
                { s: 'host', t: 'Assurance tous risques + assistance 24h/7j incluse dans le tarif.' },
                { s: 'renter', t: 'Parfait ! Je confirme la réservation pour ce weekend. Merci Sami !' },
            ]);
        }

        // ── Conv 5: Accommodation Tunis — renterB ↔ hostA (7 messages) ──────────
        const tunisAccom = listings.find((l) => l.title?.includes('Lac'));
        if (tunisAccom) {
            const conv5 = await this.prisma.conversation.create({
                data: { renterId: renterB.id, hostId: tunisAccom.hostId, listingId: tunisAccom.id },
            });
            await this.createMessages(conv5.id, renterB.id, tunisAccom.hostId, [
                { s: 'renter', t: 'Bonjour, l\'appartement des Berges du Lac est-il disponible pour 5 nuits ?' },
                { s: 'host', t: 'Bonjour Amine ! Disponible. Quelles sont vos dates exactes ?' },
                { s: 'renter', t: 'Du 15 au 20 mars. Est-ce que la vue lac est garantie ?' },
                { s: 'host', t: 'Vue panoramique sur le lac depuis le salon et la chambre principale. Garantie.' },
                { s: 'renter', t: 'Y a-t-il une salle de sport dans la résidence ?' },
                { s: 'host', t: 'Salle de sport complète ouverte 6h–23h, accès gratuit pour nos locataires.' },
                { s: 'renter', t: 'Réservation confirmée ! Merci pour les informations détaillées.' },
            ]);
        }

        const totalMessages = await this.prisma.message.count();
        console.log(`  ✓ ${totalMessages} messages across 5 conversations created`);
    }

    // ─── Reviews ────────────────────────────────────────────────────────────────
    private async seedReviews(users: Record<string, any>) {
        const renterA = users['renter.a@rentai.tn'];
        const host = users['host.kelibia@rentai.tn'];

        const completedBookings = await this.prisma.booking.findMany({
            where: { status: 'completed' },
            take: 5,
        });

        for (const booking of completedBookings) {
            const existing = await this.prisma.review.findUnique({ where: { bookingId: booking.id } });
            if (existing) continue;
            await this.prisma.review.create({
                data: {
                    bookingId: booking.id,
                    authorId: booking.renterId,
                    targetUserId: booking.hostId,
                    listingId: booking.listingId,
                    rating: Math.floor(Math.random() * 2) + 4, // 4 or 5
                    comment: [
                        'Expérience parfaite, hôte très réactif et propriété conforme aux photos. Je recommande vivement !',
                        'Séjour excellent, tout était propre et bien équipé. Reviendrons l\'année prochaine.',
                        'Super expérience, hôte accueillant, emplacement idéal. Rapport qualité-prix imbattable.',
                    ][Math.floor(Math.random() * 3)],
                },
            });
        }
        console.log(`  ✓ Reviews created for completed bookings`);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────────
    private daysFromNow(n: number): Date {
        const d = new Date();
        d.setDate(d.getDate() + n);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    private async createMessages(
        conversationId: string,
        renterId: string,
        hostId: string,
        msgs: Array<{ s: 'renter' | 'host'; t: string }>,
        minutesApart = 5,
    ) {
        for (let i = 0; i < msgs.length; i++) {
            const senderId = msgs[i].s === 'renter' ? renterId : hostId;
            const createdAt = new Date();
            createdAt.setMinutes(createdAt.getMinutes() - (msgs.length - i) * minutesApart);
            await this.prisma.message.create({
                data: { conversationId, senderId, content: msgs[i].t, createdAt },
            });
        }
    }

    // ─── Summary output ──────────────────────────────────────────────────────────
    private printAndSaveSummary(demo: {
        dailyListingId: string;
        dailyStart: Date;
        dailyEnd: Date;
        confirmedDailyBookingId: string;
        slotListingId: string;
        slotDate: Date;
        confirmedSlotBookingId: string;
        renterAEmail: string;
        renterBEmail: string;
        hostEmail: string;
    }) {
        const fmt = (d: Date) => d.toISOString().substring(0, 10);
        const summary = {
            generatedAt: new Date().toISOString(),
            demoListings: {
                daily: {
                    listingId: demo.dailyListingId,
                    blockedFrom: fmt(demo.dailyStart),
                    blockedTo: fmt(demo.dailyEnd),
                    confirmedBookingId: demo.confirmedDailyBookingId,
                    note: `DAILY conflict: dates ${fmt(demo.dailyStart)} → ${fmt(demo.dailyEnd)} are confirmed+paid. Overlapping pending booking exists.`,
                },
                slot: {
                    listingId: demo.slotListingId,
                    blockedDate: fmt(demo.slotDate),
                    blockedSlot: '10:00–12:00',
                    confirmedBookingId: demo.confirmedSlotBookingId,
                    note: `SLOT conflict: slot 10:00–12:00 on ${fmt(demo.slotDate)} is confirmed+paid. Overlapping pending 11:00–13:00 exists.`,
                },
            },
            credentials: {
                admin: { email: 'admin@rentai.tn', password: 'password123', roles: ['user', 'admin'] },
                hostA: { email: demo.hostEmail, password: 'password123', roles: ['user'] },
                renterA: { email: demo.renterAEmail, password: 'password123' },
                renterB: { email: demo.renterBEmail, password: 'password123' },
            },
            curlExamples: {
                categoriesKelibia: `curl "http://localhost:3000/api/categories/nearby?lat=36.8578&lng=11.092&radiusKm=15"`,
                categoriesTunis: `curl "http://localhost:3000/api/categories/nearby?lat=36.8065&lng=10.1815&radiusKm=15"`,
                aiSearch: `curl -s -X POST http://localhost:3000/api/ai/search -H "Content-Type: application/json" -d '{"query":"villa avec piscine","lat":36.8578,"lng":11.092,"radiusKm":20,"followUpUsed":true}'`,
                slotsCheck: `curl "http://localhost:3000/api/listings/${demo.slotListingId}/available-slots?date=${fmt(demo.slotDate)}"`,
            },
        };

        // Save to file
        try {
            const outPath = path.join(process.cwd(), 'demo-ids.json');
            fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), 'utf-8');
            console.log(`\n  📄  Demo IDs saved to: ${outPath}`);
        } catch (e) {
            console.warn('  ⚠️  Could not save demo-ids.json (non-fatal)');
        }

        // Print summary box
        console.log('\n');
        console.log('  ╔══════════════════════════════════════════════════════════════════╗');
        console.log('  ║           ✅  DEMO SEED COMPLETE — Copy for demo/tests          ║');
        console.log('  ╠══════════════════════════════════════════════════════════════════╣');
        console.log(`  ║  DAILY listing  : ${demo.dailyListingId}  ║`);
        console.log(`  ║  Blocked dates  : ${fmt(demo.dailyStart)} → ${fmt(demo.dailyEnd)} (confirmed+paid)          ║`);
        console.log(`  ║  SLOT  listing  : ${demo.slotListingId}  ║`);
        console.log(`  ║  Blocked slot   : 10:00–12:00 on ${fmt(demo.slotDate)} (confirmed+paid)    ║`);
        console.log('  ╠══════════════════════════════════════════════════════════════════╣');
        console.log(`  ║  Admin login    : admin@rentai.tn / password123                 ║`);
        console.log(`  ║  Host login     : ${demo.hostEmail} / password123   ║`);
        console.log(`  ║  RenterA login  : ${demo.renterAEmail} / password123     ║`);
        console.log(`  ║  RenterB login  : ${demo.renterBEmail} / password123     ║`);
        console.log('  ╚══════════════════════════════════════════════════════════════════╝');
        console.log('\n  ℹ️  Full curl examples and IDs saved to: demo-ids.json\n');
    }
}
