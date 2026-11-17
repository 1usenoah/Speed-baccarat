/* =========================================================================
   data/cast.js — the six dealers and the live tables they rotate through.
   Dealer shifts are derived from the round index, so every client sees the
   same person on duty at the same moment.
   ========================================================================= */

export const DEALERS = {
  sofia: { id: 'sofia', name: 'SOFIA', skin: 0xc9976f, hair: 0x2a1a12, hairStyle: 'bun', suit: 0x15171d, accent: 0x2a2e38, lip: 0xa8464a, tone: '#1f9c63', flag: '🇷🇴' },
  elena: { id: 'elena', name: 'ELENA', skin: 0xe0b491, hair: 0x6b3f22, hairStyle: 'long', suit: 0x241a2e, accent: 0x6d4b8a, lip: 0xb04a52, tone: '#8a5cc0', flag: '🇪🇸' },
  marcus: { id: 'marcus', name: 'MARCUS', skin: 0x8a5a3c, hair: 0x101010, hairStyle: 'crop', suit: 0x161f2c, accent: 0x2f4a6d, lip: 0x6d3a34, tone: '#3b6fd4', flag: '🇬🇧' },
  chloe: { id: 'chloe', name: 'CHLOE', skin: 0xf0cdb4, hair: 0xc9a15a, hairStyle: 'ponytail', suit: 0x1c2a24, accent: 0x4c7a5e, lip: 0xc25c63, tone: '#d4a33b', flag: '🇦🇺' },
  liam: { id: 'liam', name: 'LIAM', skin: 0xd8a582, hair: 0x3a2a1a, hairStyle: 'short', suit: 0x2b1a12, accent: 0x7a4a22, lip: 0x8f4a44, tone: '#c9762f', flag: '🇮🇪' },
  viktor: { id: 'viktor', name: 'VIKTOR', skin: 0xcaa38a, hair: 0x9a9a9a, hairStyle: 'wave', suit: 0x101014, accent: 0x8a8a96, lip: 0x7a3f3a, tone: '#8f8f9e', flag: '🇱🇻' }
};

export const TABLES = [
  {
    id: 'speed-a',
    name: 'SPEED BACCARAT A',
    short: 'A',
    limits: '1K – 500K',
    min: 1000,
    max: 500000,
    felt: '#083a2c',
    accent: '#1f9c63',
    seat: 'STUDIO 1 · MAIN FLOOR',
    dealers: ['sofia', 'elena', 'chloe'],
    rotation: 12
  },
  {
    id: 'speed-b',
    name: 'SPEED BACCARAT B',
    short: 'B',
    limits: '1K – 1M',
    min: 1000,
    max: 1000000,
    felt: '#062f2e',
    accent: '#2f7de0',
    seat: 'STUDIO 2 · MAIN FLOOR',
    dealers: ['marcus', 'liam', 'sofia'],
    rotation: 15
  },
  {
    id: 'speed-c',
    name: 'SPEED BACCARAT C',
    short: 'C',
    limits: '5K – 2M',
    min: 5000,
    max: 2000000,
    felt: '#2a1430',
    accent: '#a35cc0',
    seat: 'STUDIO 3 · VIP WING',
    dealers: ['elena', 'viktor', 'chloe'],
    rotation: 10
  },
  {
    id: 'salon',
    name: 'SALON PRIVÉ VIP',
    short: 'V',
    limits: '25K – 5M',
    min: 25000,
    max: 5000000,
    felt: '#2b0f14',
    accent: '#d4a33b',
    seat: 'SALON PRIVÉ · INVITATION ONLY',
    dealers: ['viktor', 'marcus', 'elena'],
    rotation: 8
  }
];

export const tableById = (id) => TABLES.find((t) => t.id === id) || TABLES[0];
