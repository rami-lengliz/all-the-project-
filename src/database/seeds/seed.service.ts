import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

// ── Realistic Tunisian seed data ──────────────────────────────────────────────

const HOSTS = [
  { name: 'fadi', email: 'fadi@rentai.tn', phone: '+21620100001' },
  { name: 'Sana Mansouri', email: 'sana.mansouri@rentai.tn', phone: '+21620100002' },
  { name: 'Yassine Trabelsi', email: 'yassine.trabelsi@rentai.tn', phone: '+21620100003' },
  { name: 'Fatma Belhaj', email: 'fatma.belhaj@rentai.tn', phone: '+21620100004' },
  { name: 'Karim Ayari', email: 'karim.ayari@rentai.tn', phone: '+21620100005' },
];

const RENTERS = [
  { name: 'Mohamed Chaabane', email: 'mohamed.chaabane@gmail.com', phone: '+21650200001' },
  { name: 'Amira Rhouma', email: 'amira.rhouma@gmail.com', phone: '+21650200002' },
  { name: 'Khalil Jemli', email: 'khalil.jemli@gmail.com', phone: '+21650200003' },
  { name: 'Rim Hamdi', email: 'rim.hamdi@gmail.com', phone: '+21650200004' },
  { name: 'Nizar Sfar', email: 'nizar.sfar@gmail.com', phone: '+21650200005' },
];

const STAYS_KELIBIA = [
  {
    title: 'Villa Jasmine — Vue mer & Piscine',
    description: 'Magnifique villa avec piscine privée à 200 m de la plage. 4 chambres climatisées, terrasse panoramique, cuisine équipée. Idéale pour familles ou groupes d\'amis cherchant la tranquillité du Cap Bon.',
    address: 'Route de la Plage, Cité El Mansourah, Kelibia 8090',
    price: 280,
    images: ['https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?w=800&q=80', 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&q=80'],
  },
  {
    title: 'Maison Bord de Mer — Accès direct plage',
    description: 'Maison pieds dans l\'eau avec terrasse panoramique sur la mer. 3 chambres, salon spacieux, barbecue extérieur. Le son des vagues comme réveil quotidien.',
    address: 'Front de Mer, Kelibia 8090',
    price: 350,
    images: ['https://images.unsplash.com/photo-1615460549969-36fa19521a4f?w=800&q=80', 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80'],
  },
  {
    title: 'Villa Elhem — Résidence calme',
    description: 'Charmante villa dans un quartier résidentiel calme à 5 min du centre de Kelibia. Jardin privatif, 3 chambres, patio ombragé. Parfaite pour un séjour reposant.',
    address: 'Cité Ain Jerboua, Kelibia 8090',
    price: 195,
    images: ['https://images.unsplash.com/photo-1549517045-bc93de28c2a1?w=800&q=80'],
  },
  {
    title: 'Dar El Kef — Maison traditionnelle',
    description: 'Maison tunisienne rénovée au cœur de la médina. Patio central, carrelage zellige, 2 chambres. Une expérience authentique à deux pas du port de pêche historique.',
    address: 'Médina de Kelibia, Rue Sidi Khalifa, 8090',
    price: 140,
    images: ['https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80'],
  },
  {
    title: 'Villa Azur — Luxe & Piscine privée',
    description: 'Villa de luxe avec vue mer imprenable. Piscine chauffée, 5 chambres en-suite, salle de sport, concierge disponible. La meilleure adresse de Kelibia pour des vacances d\'exception.',
    address: 'Plage de Kelibia, Route Touristique, 8090',
    price: 480,
    images: ['https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80', 'https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?w=800&q=80'],
  },
  {
    title: 'Studio Marina — Port de Kelibia',
    description: 'Studio moderne avec balcon donnant sur le port de plaisance. Cuisine ouverte, lit queen, climatisation. Idéal pour un couple ou voyageur solo.',
    address: 'Port de Kelibia, Avenue Habib Bourguiba, 8090',
    price: 110,
    images: ['https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&q=80'],
  },
  {
    title: 'Villa Nour — Kerkouane Cap Bon',
    description: 'Villa familiale spacieuse à 5 min du site archéologique phénicien de Kerkouane. Grande terrasse, 4 chambres, jardin avec figuiers. Calme et authenticité garantis.',
    address: 'Route de Kerkouane, Haouaria 8045',
    price: 220,
    images: ['https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80'],
  },
  {
    title: 'Dar Hana — Haouaria',
    description: 'Maison berbère typique rénovée avec goût. Jardin fleuri, terrasse avec vue sur le Jebel Abiod, 3 chambres. Point de départ idéal pour explorer le Cap Bon.',
    address: 'Cité Sidi Othman, Haouaria 8045',
    price: 155,
    images: ['https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=800&q=80'],
  },
];

const STAYS_TUNIS = [
  {
    title: 'Appartement Lac II — Moderne & Lumineux',
    description: 'Bel appartement dans la résidence sécurisée du Lac II. 2 chambres, salon design, cuisine américaine. À 10 min des Berges du Lac et des meilleurs restaurants.',
    address: 'Résidence Colisée, Les Berges du Lac II, Tunis 1053',
    price: 170,
    images: ['https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&q=80'],
  },
  {
    title: 'Villa Carthage — Résidence prestige',
    description: 'Villa contemporaine dans le quartier résidentiel de Carthage. Piscine, 4 chambres, garage. À 15 min du centre-ville et 5 min des plages de La Marsa.',
    address: 'Cité Salammbô, Carthage, Tunis 2016',
    price: 400,
    images: ['https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80'],
  },
  {
    title: 'Studio Marsa — Plage à pied',
    description: 'Studio cosy à 3 min à pied de la plage de La Marsa. Balcon, kitchenette, Wi-Fi haut débit. Parfait pour un séjour urbain avec accès direct à la mer.',
    address: 'Avenue Taïeb Mhiri, La Marsa, Tunis 2070',
    price: 95,
    images: ['https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=800&q=80'],
  },
  {
    title: 'Riad Médina — Tunis historique',
    description: 'Authentique riad au cœur de la médina de Tunis, classée UNESCO. Patio central, fontaine, 3 chambres décorées à la façon traditionnelle. Une immersion culturelle unique.',
    address: 'Souk El Bey, Médina de Tunis, 1008',
    price: 200,
    images: ['https://images.unsplash.com/photo-1523217582562-09d0def993a6?w=800&q=80'],
  },
  {
    title: 'Appartement Ennasr — Standing',
    description: 'Appartement haut standing à Ennasr, quartier résidentiel prisé. 3 chambres, double salon, cuisine équipée, parking. Proche des grandes surfaces et commerces.',
    address: 'Rue de la Liberté, Ennasr 2, Ariana 2037',
    price: 140,
    images: ['https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?w=800&q=80'],
  },
  {
    title: 'Villa Gammarth — Front de mer',
    description: 'Superbe villa à Gammarth avec vue sur le golfe de Tunis. Piscine, terrasse, 5 chambres. À 5 min des restaurants branchés de la Côte de Carthage.',
    address: 'Route de Gammarth, La Marsa 2070',
    price: 550,
    images: ['https://images.unsplash.com/photo-1480074568708-e7b720bb3f09?w=800&q=80'],
  },
];

const MOBILITY_LISTINGS = [
  {
    title: 'Peugeot 208 — Citadine économique',
    description: 'Citadine récente (2023), climatisation, GPS intégré, assurance incluse. Idéale pour visiter le Cap Bon ou se déplacer en ville. Kilométrage illimité.',
    address: 'Agence Location, Avenue Habib Bourguiba, Kelibia 8090',
    price: 80,
    images: ['https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&q=80'],
  },
  {
    title: 'Yamaha NMAX 125 — Scooter automatique',
    description: 'Scooter automatique puissant, idéal pour explorer les routes côtières du Cap Bon. Casque fourni, plein d\'essence inclus pour le premier jour.',
    address: 'Médina, Kelibia 8090',
    price: 55,
    images: ['https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=800&q=80'],
  },
  {
    title: 'Citroën C3 Aircross — Familiale SUV',
    description: 'SUV compact parfait pour les familles. 5 places, grand coffre, climatisation bi-zone. Idéal pour les routes en lacets du Cap Bon vers Haouaria.',
    address: 'Zone Touristique, Kelibia 8090',
    price: 110,
    images: ['https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800&q=80'],
  },
  {
    title: 'Vélo électrique — Balade côtière',
    description: 'Vélo à assistance électrique pour explorer la côte à votre rythme. Autonomie 60 km, casque inclus, cadenas fourni. Parfait pour les pistes cyclables du Cap Bon.',
    address: 'Front de Mer, Kelibia 8090',
    price: 35,
    images: ['https://images.unsplash.com/photo-1571068316344-75bc76f77890?w=800&q=80'],
  },
  {
    title: 'Renault Clio — Confort & Économie',
    description: 'Renault Clio 5 récente, Bluetooth, régulateur de vitesse, boîte automatique. La voiture la plus réservée de notre flotte. Caution 200 TND.',
    address: 'Rue de Carthage, Tunis Centre, 1000',
    price: 75,
    images: ['https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=800&q=80'],
  },
  {
    title: 'Tesla Model 3 — Électrique premium',
    description: 'Expérience de conduite électrique premium au cœur de Tunis. Charge rapide, autopilot, 0 à 100 en 5,6s. Inclut le chargeur portable.',
    address: 'Les Berges du Lac II, Tunis 1053',
    price: 200,
    images: ['https://images.unsplash.com/photo-1560958089-b8a1929cea89?w=800&q=80'],
  },
  {
    title: 'Quad 250cc — Aventure tout-terrain',
    description: 'Quad puissant pour les aventuriers. Idéal pour les dunes de sable et les pistes forestières de la presqu\'île du Cap Bon. Casque intégral fourni.',
    address: 'Plage de Sidi Daoud, Cap Bon 8070',
    price: 130,
    images: ['https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=800&q=80'],
  },
];

const BEACH_LISTINGS = [
  {
    title: 'Kit Stand-Up Paddle — Débutant & Confirmé',
    description: 'Planche SUP stable avec pagaie réglable, leash et gilet de sécurité. Idéal pour toute la famille. Cours d\'initiation disponible sur demande (+30 TND).',
    address: 'Plage de Kelibia, Face à la capitainerie, 8090',
    price: 45,
    images: ['https://images.unsplash.com/photo-1560185893-a55cbc8c57e8?w=800&q=80'],
  },
  {
    title: 'Kayak Biplace — Exploration côtière',
    description: 'Kayak de mer stable pour explorer les grottes et criques sauvages du Cap Bon. Pagaies, gilets, carte marine fournis. Location à la demi-journée ou journée.',
    address: 'Port de Plaisance, Kelibia 8090',
    price: 40,
    images: ['https://images.unsplash.com/photo-1551524163-3f8b23c671e7?w=800&q=80'],
  },
  {
    title: 'Kit Snorkeling Pro — Plongée en surface',
    description: 'Masque grand panoramique, tuba anti-reflux, palmes de qualité pro. Eaux cristallines du Cap Bon à explorer sans limite. Désinfection complète entre chaque location.',
    address: 'Plage de Kelibia, Entrée Nord, 8090',
    price: 25,
    images: ['https://images.unsplash.com/photo-1544551763-92ab472cad5d?w=800&q=80'],
  },
  {
    title: 'Jet-ski 1h — Sensations garanties',
    description: 'Jet-ski dernière génération, guidé par moniteur breveté pour la première sortie. Zone de navigation balisée avec option de balade libre pour les détenteurs du permis mer.',
    address: 'Plage El Mansourah, Kelibia 8090',
    price: 120,
    images: ['https://images.unsplash.com/photo-1530053969600-caed2596d242?w=800&q=80'],
  },
  {
    title: 'Kit Surf & Combinaison',
    description: 'Planche de surf longboard pour débutants + combinaison néoprène 3mm. Idéal pour profiter des vagues de la plage de Haouaria. Cours de surf disponibles le matin.',
    address: 'Plage de Haouaria, Cap Bon 8045',
    price: 60,
    images: ['https://images.unsplash.com/photo-1502680390469-be75c86b636f?w=800&q=80'],
  },
  {
    title: 'Bouée tractée — Fun en famille',
    description: 'Bouée banane pour 4 personnes, tractée par bateau rapide. Sensations fortes garanties ! Durée : 20 min par session. Réservation pour 2 sessions minimum recommandée.',
    address: 'Plage de Kelibia, Poste de secours, 8090',
    price: 80,
    images: ['https://images.unsplash.com/photo-1506953823976-52e1fdc0149a?w=800&q=80'],
  },
  {
    title: 'Planche à Voile — École & Location',
    description: 'Planche à voile pour tous niveaux. Kelibia est réputé pour son vent régulier, idéal pour la planche à voile. Moniteur disponible pour les niveaux débutant et intermédiaire.',
    address: 'Club Nautique de Kelibia, 8090',
    price: 70,
    images: ['https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80'],
  },
  {
    title: 'Catamaran — Journée en mer',
    description: 'Location catamaran 7m pour la journée avec skipper. Pêche, baignade, déjeuner à bord inclus. Partez à la découverte de l\'îlot de Pilau au large de Kelibia.',
    address: 'Port de Kelibia, Quai des plaisanciers, 8090',
    price: 350,
    images: ['https://images.unsplash.com/photo-1500627965408-b5f2c26f4b8d?w=800&q=80'],
  },
];

// Realistic Kelibia coordinates with slight offsets
function kelibiaCoords(idx: number) {
  const KELIBIA_LAT = 36.8578;
  const KELIBIA_LNG = 11.092;
  const offsets = [
    [0, 0], [0.005, 0.003], [-0.003, 0.007], [0.008, -0.002],
    [-0.006, 0.005], [0.002, 0.009], [-0.001, -0.004], [0.007, 0.001],
  ];
  const [dLat, dLng] = offsets[idx % offsets.length];
  return { lat: KELIBIA_LAT + dLat, lng: KELIBIA_LNG + dLng };
}

function tunisCoords(idx: number) {
  const TUNIS_LAT = 36.8065;
  const TUNIS_LNG = 10.1815;
  const offsets = [
    [0.01, 0.02], [-0.005, 0.015], [0.02, -0.01], [-0.015, 0.025],
    [0.008, 0.018], [0.025, 0.005],
  ];
  const [dLat, dLng] = offsets[idx % offsets.length];
  return { lat: TUNIS_LAT + dLat, lng: TUNIS_LNG + dLng };
}

@Injectable()
export class SeedService {
  constructor(private prisma: PrismaService) { }

  async seed() {
    console.log('Starting seed process...');

    // Clear existing data (foreign-key-safe order)
    console.log('Clearing existing data...');
    await this.prisma.aiSearchLog.deleteMany({});
    await this.prisma.chatbotActionConfirmation.deleteMany({});
    await this.prisma.chatbotSecurityEvent.deleteMany({});
    await this.prisma.chatMessage.deleteMany({});
    await this.prisma.chatConversationSummary.deleteMany({});
    await this.prisma.chatConversation.deleteMany({});
    await this.prisma.payoutItem.deleteMany({});
    await this.prisma.payout.deleteMany({});
    await this.prisma.ledgerEntry.deleteMany({});
    await this.prisma.message.deleteMany({});
    await this.prisma.conversation.deleteMany({});
    await this.prisma.review.deleteMany({});
    await this.prisma.paymentIntent.deleteMany({});
    await this.prisma.booking.deleteMany({});
    await this.prisma.adminLog.deleteMany({});
    await this.prisma.slotConfiguration.deleteMany({});
    await this.prisma.listing.deleteMany({});
    await this.prisma.categoryRequest.deleteMany({});
    await this.prisma.category.deleteMany({});
    await this.prisma.walletTransaction.deleteMany({});
    await this.prisma.wallet.deleteMany({});
    await this.prisma.user.deleteMany({});

    // ── Categories ────────────────────────────────────────────
    console.log('Creating categories...');
    const savedCategories = await Promise.all(
      [
        { name: 'Stays', slug: 'stays', icon: '🏠', allowedForPrivate: true },
        { name: 'Sports Facilities', slug: 'sports-facilities', icon: '🏟️', allowedForPrivate: true },
        { name: 'Mobility', slug: 'mobility', icon: '🚗', allowedForPrivate: true },
        { name: 'Beach Gear', slug: 'beach-gear', icon: '🏖️', allowedForPrivate: true },
      ].map((cat) => this.prisma.category.create({ data: cat })),
    );
    console.log(`Created ${savedCategories.length} categories`);

    const staysCat = savedCategories.find((c) => c.slug === 'stays')!;
    const sportsCat = savedCategories.find((c) => c.slug === 'sports-facilities')!;
    const mobCat = savedCategories.find((c) => c.slug === 'mobility')!;
    const beachCat = savedCategories.find((c) => c.slug === 'beach-gear')!;

    // ── Users ──────────────────────────────────────────────────
    console.log('Creating users...');
    const hashedPassword = await bcrypt.hash('password123', 10);
    const savedUsers: any[] = [];

    for (let i = 0; i < HOSTS.length; i++) {
      const h = HOSTS[i];
      savedUsers.push(
        await this.prisma.user.create({
          data: {
            name: h.name,
            email: h.email,
            phone: h.phone,
            passwordHash: hashedPassword,
            isHost: true,
            verifiedEmail: true,
            verifiedPhone: true,
            ratingAvg: 4.2 + Math.random() * 0.7,
            ratingCount: 8 + Math.floor(Math.random() * 20),
            roles: i === 0 ? ['user', 'host', 'ADMIN'] : ['user', 'host'],
          },
        }),
      );
    }
    for (const r of RENTERS) {
      savedUsers.push(
        await this.prisma.user.create({
          data: {
            name: r.name,
            email: r.email,
            phone: r.phone,
            passwordHash: hashedPassword,
            isHost: false,
            verifiedEmail: true,
            verifiedPhone: Math.random() > 0.3,
            roles: ['user'],
          },
        }),
      );
    }
    console.log(`Created ${savedUsers.length} users`);

    const hosts = savedUsers.filter((u) => u.isHost);
    const renters = savedUsers.filter((u) => !u.isHost);

    // ── Helper to INSERT a listing with PostGIS geometry ──────
    const insertListing = async (opts: {
      id: string; title: string; description: string; price: number;
      lat: number; lng: number; address: string;
      categoryId: string; hostId: string; images: string[];
      bookingType?: string; status?: string;
    }) => {
      const bt = opts.bookingType ?? 'DAILY';
      const st = opts.status ?? 'ACTIVE';
      await this.prisma.$executeRaw`
        INSERT INTO listings (
          id, title, description, "pricePerDay", location, address,
          "categoryId", "hostId", images, "isActive", status, "bookingType", "createdAt", "updatedAt"
        ) VALUES (
          ${opts.id}::uuid,
          ${opts.title},
          ${opts.description},
          ${opts.price},
          ST_SetSRID(ST_MakePoint(${opts.lng}, ${opts.lat}), 4326),
          ${opts.address},
          ${opts.categoryId}::uuid,
          ${opts.hostId}::uuid,
          ${opts.images}::TEXT[],
          true,
          ${st}::"ListingStatus",
          ${bt}::"BookingType",
          NOW(), NOW()
        )
      `;
      return this.prisma.listing.findUnique({ where: { id: opts.id } });
    };

    // ── DAILY listings ────────────────────────────────────────
    console.log('Creating listings...');
    const savedListings: any[] = [];

    for (let i = 0; i < STAYS_KELIBIA.length; i++) {
      const s = STAYS_KELIBIA[i];
      const { lat, lng } = kelibiaCoords(i);
      const id = crypto.randomUUID();
      savedListings.push(await insertListing({
        id, ...s, price: s.price, lat, lng,
        categoryId: staysCat.id,
        hostId: hosts[i % hosts.length].id,
      }));
    }

    for (let i = 0; i < STAYS_TUNIS.length; i++) {
      const s = STAYS_TUNIS[i];
      const { lat, lng } = tunisCoords(i);
      const id = crypto.randomUUID();
      savedListings.push(await insertListing({
        id, ...s, price: s.price, lat, lng,
        categoryId: staysCat.id,
        hostId: hosts[i % hosts.length].id,
      }));
    }

    for (let i = 0; i < MOBILITY_LISTINGS.length; i++) {
      const m = MOBILITY_LISTINGS[i];
      const { lat, lng } = i < 4 ? kelibiaCoords(i + 10) : tunisCoords(i);
      const id = crypto.randomUUID();
      savedListings.push(await insertListing({
        id, ...m, price: m.price, lat, lng,
        categoryId: mobCat.id,
        hostId: hosts[i % hosts.length].id,
      }));
    }

    for (let i = 0; i < BEACH_LISTINGS.length; i++) {
      const b = BEACH_LISTINGS[i];
      const { lat, lng } = kelibiaCoords(i + 20);
      const id = crypto.randomUUID();
      savedListings.push(await insertListing({
        id, ...b, price: b.price, lat, lng,
        categoryId: beachCat.id,
        hostId: hosts[i % hosts.length].id,
      }));
    }

    // ── SLOT sports facilities ────────────────────────────────
    console.log('Creating slot-based sports facility listings...');
    const sportsFacilities = [
      {
        title: 'Terrain de Football El Kelibi',
        description: 'Terrain de football en gazon synthétique homologué, éclairage LED, vestiaires avec douches. Capacité 10 joueurs par équipe. Idéal pour tournois et entraînements.',
        address: 'Complexe Sportif Municipal, Kelibia 8090',
        price: 60,
        images: ['https://images.unsplash.com/photo-1459865264687-595d652de67e?w=800&q=80'],
      },
      {
        title: 'Court de Tennis Kerkouane',
        description: 'Court de tennis en dur entretenu, éclairage nocturne, raquettes et balles disponibles à la location. Moniteur disponible sur demande pour cours particuliers.',
        address: 'Club de Tennis, Route de Kerkouane, Cap Bon 8090',
        price: 35,
        images: ['https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&q=80'],
      },
      {
        title: 'Terrain de Padel Kelibia Beach',
        description: 'Terrain de padel panoramique avec vue sur la mer. Sol en gazon artificiel de qualité. Raquettes et balles incluses dans la location. Réservation à l\'heure.',
        address: 'Zone Hôtelière, Plage de Kelibia, 8090',
        price: 45,
        images: ['https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=800&q=80'],
      },
    ];

    for (let i = 0; i < sportsFacilities.length; i++) {
      const fac = sportsFacilities[i];
      const { lat, lng } = kelibiaCoords(i + 30);
      const listingId = crypto.randomUUID();

      await insertListing({
        id: listingId, ...fac, price: fac.price, lat, lng,
        categoryId: sportsCat.id,
        hostId: hosts[i % hosts.length].id,
        bookingType: 'SLOT',
      });

      await this.prisma.slotConfiguration.create({
        data: {
          listingId,
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
          pricePerSlot: fac.price,
        },
      });

      savedListings.push(
        await this.prisma.listing.findUnique({ where: { id: listingId } }),
      );
    }
    console.log(`Created ${savedListings.length} listings total`);

    // ── PENDING listing for moderation demo ───────────────────
    console.log('Creating PENDING_REVIEW listing...');
    const pendingId = crypto.randomUUID();
    const { lat: pLat, lng: pLng } = kelibiaCoords(5);
    await insertListing({
      id: pendingId,
      title: 'Villa Sonia — En attente de validation',
      description: 'Belle villa avec piscine privée, 4 chambres, barbecue. En attente de validation par l\'équipe RentAI avant publication.',
      price: 250,
      lat: pLat, lng: pLng,
      address: 'Route de la Plage, Kelibia 8090',
      categoryId: staysCat.id,
      hostId: hosts[1].id,
      images: ['https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&q=80'],
      status: 'PENDING_REVIEW',
    });
    console.log(`  ✓ PENDING listing: ${pendingId} (host: ${hosts[1].email})`);

    // ── Bookings (one per status) ─────────────────────────────
    console.log('Creating bookings...');
    const allActive = await this.prisma.listing.findMany({ where: { status: 'ACTIVE' } });

    const pickListing = (renter: any, idx: number) => {
      for (let j = 0; j < allActive.length; j++) {
        const l = allActive[(idx + j) % allActive.length];
        if (l.hostId !== renter.id) return l;
      }
      return allActive[0];
    };

    const makeBooking = async (
      statusVal: string, paid: boolean, renter: any, offsetDays: number,
    ) => {
      const listing = pickListing(renter, offsetDays);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + offsetDays);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 3);
      const pricePerDay = Number(listing.pricePerDay);
      const totalPrice = pricePerDay * 3;
      return this.prisma.booking.create({
        data: {
          startDate, endDate,
          status: statusVal as any,
          renterId: renter.id,
          hostId: listing.hostId,
          listingId: listing.id,
          totalPrice,
          commission: totalPrice * 0.1,
          paid,
          snapshotTitle: listing.title,
          snapshotPricePerDay: pricePerDay,
          snapshotCommissionRate: 0.1,
          snapshotCurrency: 'TND',
        },
      });
    };

    void makeBooking('pending', false, renters[0], 14);
    void makeBooking('confirmed', false, renters[1], 21);
    const paidBooking = await makeBooking('paid', true, renters[2], 28);
    void makeBooking('cancelled', false, renters[3], 35);
    console.log('  ✓ Bookings: pending, confirmed, paid, cancelled');

    // ── Review ────────────────────────────────────────────────
    await this.prisma.review.create({
      data: {
        rating: 5,
        comment: 'Séjour parfait, hôte très accueillant et logement conforme à la description. Je recommande vivement !',
        authorId: paidBooking.renterId,
        targetUserId: paidBooking.hostId,
        listingId: paidBooking.listingId,
        bookingId: paidBooking.id,
        type: 'RENTER_TO_HOST',
      },
    });

    for (let i = 0; i < 6; i++) {
      const listing = allActive[i % allActive.length];
      const renter = renters[i % renters.length];
      if (listing.hostId === renter.id) continue;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + (i + 1) * 7 + 50);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 3);
      const pricePerDay = Number(listing.pricePerDay);
      const totalPrice = pricePerDay * 3;
      const statuses = ['confirmed', 'pending', 'completed'] as const;
      await this.prisma.booking.create({
        data: {
          startDate, endDate,
          status: statuses[i % 3] as any,
          renterId: renter.id,
          hostId: listing.hostId,
          listingId: listing.id,
          totalPrice,
          commission: totalPrice * 0.1,
          paid: i % 2 === 0,
          snapshotTitle: listing.title,
          snapshotPricePerDay: pricePerDay,
          snapshotCommissionRate: 0.1,
          snapshotCurrency: 'TND',
        },
      });
    }
    console.log('  ✓ 6 additional bookings');

    // ── Demo scenarios (conflict prevention + chat) ───────────
    await this.seedDemoScenarios(savedUsers, savedCategories);

    console.log('\nSeed completed successfully!');
    console.log('  Admin login : fadi@rentai.tn / password123');
    console.log('  Host login  : sana.mansouri@rentai.tn  / password123');
    console.log('  Renter login: mohamed.chaabane@gmail.com / password123');
  }

  private async seedDemoScenarios(users: any[], categories: any[]) {
    console.log('Creating demo scenarios...');

    const host = users[0]; // Ahmed Ben Salah (admin + host)
    const renterA = users[5]; // Mohamed Chaabane
    const renterB = users[6]; // Amira Rhouma

    const staysCat = categories.find((c) => c.slug === 'stays')!;
    const sportsCat = categories.find((c) => c.slug === 'sports-facilities')!;

    const KELIBIA_LAT = 36.8578;
    const KELIBIA_LNG = 11.092;

    // ── 1. DAILY demo listing ──────────────────────────────────
    const dailyListingId = crypto.randomUUID();
    await this.prisma.$executeRaw`
      INSERT INTO listings (
        id, title, description, "pricePerDay", location, address,
        "categoryId", "hostId", images, "isActive", status, "bookingType", "createdAt", "updatedAt"
      ) VALUES (
        ${dailyListingId}::uuid,
        ${'[DEMO] Villa Dar Yasmine — Conflit de dates'},
        ${'Villa démo pour tester la prévention des conflits de réservation DAILY. La période D+30 à D+33 est déjà confirmée après le seed.'},
        ${150},
        ST_SetSRID(ST_MakePoint(${KELIBIA_LNG + 0.05}, ${KELIBIA_LAT + 0.05}), 4326),
        ${'mansoura , Demo District, Kelibia 8090'},
        ${staysCat.id}::uuid,
        ${host.id}::uuid,
        ARRAY['https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80']::TEXT[],
        true, 'ACTIVE'::"ListingStatus",
        'DAILY'::"BookingType",
        NOW(), NOW()
      )
    `;

    const dailyStart = new Date();
    dailyStart.setDate(dailyStart.getDate() + 30);
    dailyStart.setHours(0, 0, 0, 0);
    const dailyEnd = new Date(dailyStart);
    dailyEnd.setDate(dailyEnd.getDate() + 3);

    const dailyBookingA = await this.prisma.booking.create({
      data: {
        listingId: dailyListingId,
        renterId: renterA.id,
        hostId: host.id,
        startDate: dailyStart,
        endDate: dailyEnd,
        totalPrice: 450,
        commission: 45,
        status: 'confirmed',
        paid: true,
        snapshotTitle: '[DEMO] Villa Dar Yasmine — Conflit de dates',
        snapshotPricePerDay: 150,
        snapshotCommissionRate: 0.1,
        snapshotCurrency: 'TND',
      },
    });

    await this.prisma.booking.create({
      data: {
        listingId: dailyListingId,
        renterId: renterB.id,
        hostId: host.id,
        startDate: dailyStart,
        endDate: dailyEnd,
        totalPrice: 450,
        commission: 45,
        status: 'pending',
        paid: false,
        snapshotTitle: '[DEMO] Villa Dar Yasmine — Conflit de dates',
        snapshotPricePerDay: 150,
        snapshotCommissionRate: 0.1,
        snapshotCurrency: 'TND',
      },
    });

    console.log(
      `  ✓ DAILY demo: ${dailyListingId} — confirmed ${dailyStart.toISOString().substring(0, 10)} → ${dailyEnd.toISOString().substring(0, 10)}`,
    );

    // ── 2. SLOT demo listing ───────────────────────────────────
    const slotListingId = crypto.randomUUID();
    await this.prisma.$executeRaw`
      INSERT INTO listings (
        id, title, description, "pricePerDay", location, address,
        "categoryId", "hostId", images, "isActive", status, "bookingType", "createdAt", "updatedAt"
      ) VALUES (
        ${slotListingId}::uuid,
        ${'[DEMO] Terrain de Padel — Conflit de créneaux'},
        ${'Terrain démo pour tester la prévention des conflits SLOT. Le créneau 10h–12h du D+7 est déjà confirmé après le seed.'},
        ${30},
        ST_SetSRID(ST_MakePoint(${KELIBIA_LNG + 0.06}, ${KELIBIA_LAT + 0.06}), 4326),
        ${'Complexe Sportif Démo, Kelibia 8090'},
        ${sportsCat.id}::uuid,
        ${host.id}::uuid,
        ARRAY['https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=800&q=80']::TEXT[],
        true, 'ACTIVE'::"ListingStatus",
        'SLOT'::"BookingType",
        NOW(), NOW()
      )
    `;

    await this.prisma.slotConfiguration.create({
      data: {
        listingId: slotListingId,
        slotDurationMinutes: 60,
        operatingHours: {
          monday: { start: '08:00', end: '22:00' }, tuesday: { start: '08:00', end: '22:00' },
          wednesday: { start: '08:00', end: '22:00' }, thursday: { start: '08:00', end: '22:00' },
          friday: { start: '08:00', end: '22:00' }, saturday: { start: '08:00', end: '22:00' },
          sunday: { start: '08:00', end: '22:00' },
        },
        minBookingSlots: 1, maxBookingSlots: 4, bufferMinutes: 0, pricePerSlot: 30,
      },
    });

    const slotDate = new Date();
    slotDate.setDate(slotDate.getDate() + 7);
    slotDate.setHours(0, 0, 0, 0);

    const t10h = new Date(0); t10h.setUTCHours(10, 0, 0, 0);
    const t12h = new Date(0); t12h.setUTCHours(12, 0, 0, 0);
    const t11h = new Date(0); t11h.setUTCHours(11, 0, 0, 0);
    const t13h = new Date(0); t13h.setUTCHours(13, 0, 0, 0);

    const slotBookingA = await this.prisma.booking.create({
      data: {
        listingId: slotListingId, renterId: renterA.id, hostId: host.id,
        startDate: slotDate, endDate: slotDate, startTime: t10h, endTime: t12h,
        totalPrice: 60, commission: 6, status: 'confirmed', paid: true,
        snapshotTitle: '[DEMO] Terrain de Padel — Conflit de créneaux',
        snapshotPricePerDay: 30, snapshotCommissionRate: 0.1, snapshotCurrency: 'TND',
      },
    });

    await this.prisma.booking.create({
      data: {
        listingId: slotListingId, renterId: renterB.id, hostId: host.id,
        startDate: slotDate, endDate: slotDate, startTime: t11h, endTime: t13h,
        totalPrice: 60, commission: 6, status: 'pending', paid: false,
        snapshotTitle: '[DEMO] Terrain de Padel — Conflit de créneaux',
        snapshotPricePerDay: 30, snapshotCommissionRate: 0.1, snapshotCurrency: 'TND',
      },
    });

    console.log(`  ✓ SLOT demo: ${slotListingId} — confirmed 10:00–12:00 on ${slotDate.toISOString().substring(0, 10)}`);

    // ── 3. Chat messages (49 messages across 5 conversations) ──
    console.log('Creating demo chat messages...');

    const seedMessages = async (
      conversationId: string, renterId: string, hostId: string,
      messages: Array<{ sender: 'renter' | 'host'; text: string }>,
      minutesApart = 4,
    ) => {
      for (let i = 0; i < messages.length; i++) {
        const { sender, text } = messages[i];
        const senderId = sender === 'renter' ? renterId : hostId;
        const createdAt = new Date();
        createdAt.setMinutes(createdAt.getMinutes() - (messages.length - i) * minutesApart);
        await this.prisma.message.create({
          data: { conversationId, senderId, content: text, createdAt },
        });
      }
    };

    // Conv 1 — Villa DAILY (renterA ↔ host) — 12 messages
    const conv1 = await this.prisma.conversation.create({
      data: { renterId: renterA.id, hostId: host.id, listingId: dailyListingId, bookingId: dailyBookingA.id },
    });
    await seedMessages(conv1.id, renterA.id, host.id, [
      { sender: 'renter', text: 'Bonjour M. Ben Salah ! Je suis intéressé par Villa Dar Yasmine pour début juillet.' },
      { sender: 'host', text: 'Bonjour ! La villa est disponible pour cette période. Combien de personnes êtes-vous ?' },
      { sender: 'renter', text: 'Nous serons 6 adultes et 2 enfants.' },
      { sender: 'host', text: 'Parfait, la villa a 4 chambres et peut accueillir jusqu\'à 10 personnes confortablement.' },
      { sender: 'renter', text: 'La piscine est-elle chauffée ?' },
      { sender: 'host', text: 'Oui, chauffée de mai à octobre, température maintenue à 28°C.' },
      { sender: 'renter', text: 'Y a-t-il un barbecue ?' },
      { sender: 'host', text: 'Barbecue au charbon et au gaz disponibles, avec tout le matériel.' },
      { sender: 'renter', text: 'La plage est à quelle distance exactement ?' },
      { sender: 'host', text: 'Accès direct à la plage privée en 3 minutes à pied par le jardin.' },
      { sender: 'renter', text: 'Parfait ! Je confirme la réservation avec plaisir.' },
      { sender: 'host', text: 'Très bien, à bientôt à Kelibia ! N\'hésitez pas pour toute question.' },
    ]);

    // Conv 2 — Terrain padel (renterA ↔ host) — 10 messages
    const conv2 = await this.prisma.conversation.create({
      data: { renterId: renterA.id, hostId: host.id, listingId: slotListingId, bookingId: slotBookingA.id },
    });
    await seedMessages(conv2.id, renterA.id, host.id, [
      { sender: 'renter', text: 'Bonjour, je voudrais réserver le terrain de padel samedi de 10h à 12h.' },
      { sender: 'host', text: 'Bonjour M. Chaabane ! Le créneau est disponible, vous serez combien ?' },
      { sender: 'renter', text: 'Nous serons 4 joueurs, niveau intermédiaire.' },
      { sender: 'host', text: 'Parfait ! Les raquettes et les balles sont incluses dans le prix.' },
      { sender: 'renter', text: 'Y a-t-il un espace pour se changer ?' },
      { sender: 'host', text: 'Vestiaires avec douches disponibles, serviettes fournies.' },
      { sender: 'renter', text: 'Peut-on prolonger d\'une heure si le terrain est libre ?' },
      { sender: 'host', text: 'Bien sûr, sous réserve de disponibilité. Confirmez-moi 30 min avant.' },
      { sender: 'renter', text: 'Super, je confirme le créneau 10h–12h !' },
      { sender: 'host', text: 'C\'est réservé ! Bonne partie à vous 🎾' },
    ]);

    // Conv 3 — Kayak (renterB ↔ host) — 6 messages
    const kayakListing = await this.prisma.listing.findFirst({ where: { category: { slug: 'beach-gear' } } });
    if (kayakListing) {
      const conv3 = await this.prisma.conversation.create({
        data: { renterId: renterB.id, hostId: kayakListing.hostId, listingId: kayakListing.id },
      });
      await seedMessages(conv3.id, renterB.id, kayakListing.hostId, [
        { sender: 'renter', text: 'Bonjour ! Le kayak biplace est-il disponible ce vendredi après-midi ?' },
        { sender: 'host', text: 'Bonjour Mme Rhouma ! Oui, disponible de 14h à 18h.' },
        { sender: 'renter', text: 'Faut-il avoir de l\'expérience en kayak ?' },
        { sender: 'host', text: 'Pas du tout, nous donnons un briefing de 15 min et c\'est parti !' },
        { sender: 'renter', text: 'Parfait, on réserve pour vendredi 14h–17h !' },
        { sender: 'host', text: 'C\'est noté ! Les gilets de sauvetage sont fournis. Bonne session !' },
      ]);
    }

    // Conv 4 — Voiture (renterA ↔ host) — 10 messages
    const carListing = await this.prisma.listing.findFirst({ where: { category: { slug: 'mobility' } } });
    if (carListing) {
      const conv4 = await this.prisma.conversation.create({
        data: { renterId: renterA.id, hostId: carListing.hostId, listingId: carListing.id },
      });
      await seedMessages(conv4.id, renterA.id, carListing.hostId, [
        { sender: 'renter', text: 'Bonjour, la Peugeot 208 est-elle disponible du 15 au 18 juillet ?' },
        { sender: 'host', text: 'Bonjour ! Oui, disponible sur cette période. Kilométrage illimité inclus.' },
        { sender: 'renter', text: 'Y a-t-il un dépôt de garantie ?' },
        { sender: 'host', text: '200 TND de caution remboursée à la restitution du véhicule en bon état.' },
        { sender: 'renter', text: 'L\'assurance tous risques est-elle incluse ?' },
        { sender: 'host', text: 'Assurance responsabilité civile incluse. Tous risques en option +20 TND/jour.' },
        { sender: 'renter', text: 'Je prends l\'option tous risques. GPS intégré ?' },
        { sender: 'host', text: 'GPS intégré et support smartphone fourni.' },
        { sender: 'renter', text: 'Parfait ! Je confirme la réservation.' },
        { sender: 'host', text: 'Très bien ! Rendez-vous le 15 à 9h pour récupérer les clés. Bonne route !' },
      ]);
    }

    // Conv 5 — Villa Kelibia (renterB ↔ host) — 11 messages
    const villaListing = await this.prisma.listing.findFirst({
      where: { category: { slug: 'stays' }, title: { contains: 'Azur' } },
    });
    if (villaListing) {
      const conv5 = await this.prisma.conversation.create({
        data: { renterId: renterB.id, hostId: villaListing.hostId, listingId: villaListing.id },
      });
      await seedMessages(conv5.id, renterB.id, villaListing.hostId, [
        { sender: 'renter', text: 'Bonjour, Villa Azur est-elle disponible pour la première semaine d\'août ?' },
        { sender: 'host', text: 'Bonjour ! La villa est libre du 1er au 8 août. Combien de personnes ?' },
        { sender: 'renter', text: 'Nous serons 8 personnes, 2 familles avec enfants.' },
        { sender: 'host', text: 'La villa est parfaite pour ça. 5 chambres, 3 salles de bain, grande cuisine.' },
        { sender: 'renter', text: 'Quelle est la superficie de la piscine ?' },
        { sender: 'host', text: 'Piscine de 10x5m, profondeur de 1,2m à 2,2m. Idéale pour les enfants.' },
        { sender: 'renter', text: 'Y a-t-il un espace jeux pour les enfants ?' },
        { sender: 'host', text: 'Oui, toboggan et balançoires dans le jardin clôturé.' },
        { sender: 'renter', text: 'La plage est praticable en famille avec des enfants en bas âge ?' },
        { sender: 'host', text: 'Plage de sable fin très douce, entrée progressive, parfaite pour les petits.' },
        { sender: 'renter', text: 'Excellent ! Nous réservons pour le 1–8 août. Merci !' },
      ]);
    }

    console.log('  ✓ Chat: 49 messages across 5 conversations');
    console.log('');
    console.log('  ╔══════════════════════════════════════════════════════╗');
    console.log('  ║           DEMO SEED — Identifiants de test           ║');
    console.log('  ╠══════════════════════════════════════════════════════╣');
    console.log(`  ║  DAILY listing : ${dailyListingId} ║`);
    console.log(`  ║  Blocked dates : ${dailyStart.toISOString().substring(0, 10)} → ${dailyEnd.toISOString().substring(0, 10)} (confirmed)   ║`);
    console.log(`  ║  SLOT  listing : ${slotListingId} ║`);
    console.log(`  ║  Blocked slot  : 10:00–12:00 on ${slotDate.toISOString().substring(0, 10)}               ║`);
    console.log('  ║  Admin  login  : fadi@rentai.tn            ║');
    console.log('  ║  Host   login  : sana.mansouri@rentai.tn             ║');
    console.log('  ║  Renter login  : mohamed.chaabane@gmail.com          ║');
    console.log('  ║  Password      : password123                         ║');
    console.log('  ╚══════════════════════════════════════════════════════╝');
  }
}
