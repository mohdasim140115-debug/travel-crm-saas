/** Default master gallery & hotels for Itinerary Studio (Kashmir demo set). */

export const MASTER_GALLERY = [
  {
    id: 'g1',
    url: 'https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?w=800&q=80',
    label: 'Dal Lake Houseboats',
    tags: ['kashmir', 'lake', 'srinagar'],
  },
  {
    id: 'g2',
    url: 'https://images.unsplash.com/photo-1551524559-8af4e6624178?w=800&q=80',
    label: 'Gulmarg Skiing',
    tags: ['kashmir', 'gulmarg', 'snow'],
  },
  {
    id: 'g3',
    url: 'https://images.unsplash.com/photo-1518684079-3c830dcef090?w=800&q=80',
    label: 'Snow Lodge',
    tags: ['kashmir', 'hotel', 'winter'],
  },
  {
    id: 'g4',
    url: 'https://images.unsplash.com/photo-1589308078059-be1415eab4c3?w=800&q=80',
    label: 'Shikara Ride',
    tags: ['kashmir', 'dal lake', 'boat'],
  },
  {
    id: 'g5',
    url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80',
    label: 'Mountain Vista',
    tags: ['kashmir', 'mountains'],
  },
  {
    id: 'g6',
    url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&q=80',
    label: 'Himalayan Peaks',
    tags: ['kashmir', 'himalaya'],
  },
]

export const MASTER_HOTELS = [
  {
    id: 'h1',
    name: 'THE KARIMS',
    city: 'SRINAGAR',
    stars: 4,
    image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&q=80',
    location: 'Dal Lake, Srinagar',
  },
  {
    id: 'h2',
    name: 'SIGNATURE',
    city: 'GULMARG',
    stars: 3,
    image: 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=600&q=80',
    location: 'Gulmarg Main Road',
  },
  {
    id: 'h3',
    name: 'DECOURTYARD',
    city: 'PAHALGAM',
    stars: 4,
    image: 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=600&q=80',
    location: 'Pahalgam Valley',
  },
  {
    id: 'h4',
    name: 'HOUSEBOAT HERITAGE',
    city: 'DAL LAKE',
    stars: 3,
    image: 'https://images.unsplash.com/photo-1595815771615-35c3dc9e9f2?w=600&q=80',
    location: 'Nigeen Lake, Srinagar',
  },
  {
    id: 'h5',
    name: 'ALPINE RETREAT',
    city: 'GULMARG',
    stars: 5,
    image: 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=600&q=80',
    location: 'Gulmarg Gondola Road',
  },
  {
    id: 'h6',
    name: 'VALLEY VIEW',
    city: 'SONAMARG',
    stars: 3,
    image: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=600&q=80',
    location: 'Sonamarg Meadows',
  },
]

export const PACKAGE_CATEGORIES = ['Silver', 'Gold', 'Platinum', 'Budget', 'Luxury']

export const DURATION_PRESETS = [
  { value: '3N/4D', label: '3 Nights / 4 Days', nights: 3, days: 4 },
  { value: '4N/5D', label: '4 Nights / 5 Days', nights: 4, days: 5 },
  { value: '5N/6D', label: '5 Nights / 6 Days', nights: 5, days: 6 },
  { value: '6N/7D', label: '6 Nights / 7 Days', nights: 6, days: 7 },
  { value: '7N/8D', label: '7 Nights / 8 Days', nights: 7, days: 8 },
  { value: '8N/9D', label: '8 Nights / 9 Days', nights: 8, days: 9 },
  { value: '9N/10D', label: '9 Nights / 10 Days', nights: 9, days: 10 },
  { value: '10N/11D', label: '10 Nights / 11 Days', nights: 10, days: 11 },
  { value: '11N/12D', label: '11 Nights / 12 Days', nights: 11, days: 12 },
  { value: '12N/13D', label: '12 Nights / 13 Days', nights: 12, days: 13 },
  { value: '13N/14D', label: '13 Nights / 14 Days', nights: 13, days: 14 },
  { value: '14N/15D', label: '14 Nights / 15 Days', nights: 14, days: 15 },
  { value: '15N/16D', label: '15 Nights / 16 Days', nights: 15, days: 16 },
  { value: 'custom', label: 'Custom / Manual', nights: null, days: null },
]

export const ROOM_TYPES = ['DELUXE', 'SUPER DELUXE', 'STANDARD', 'SUITE', 'PREMIUM']

export const VEHICLES = [
  'Innova Crysta',
  'Tempo Traveller 12 Seater',
  'Sedan (Etios/Dzire)',
  'SUV (Scorpio/Xylo)',
  'Mini Bus 20 Seater',
]

export const MARKETING_TEMPLATES = {
  kashmir: `Welcome to the paradise on earth! This carefully crafted Kashmir package offers breathtaking landscapes, serene lakes, snow-capped mountains, and warm Kashmiri hospitality. From the iconic Dal Lake shikara rides to the meadows of Gulmarg, every moment is designed to create memories that last a lifetime.`,
  generic: `Discover an unforgettable journey crafted with care. This package combines comfort, adventure, and authentic local experiences for travelers who want the very best.`,
}

export const DEFAULT_INCLUSIONS = [
  'Accommodation on twin sharing basis',
  'Daily breakfast and dinner',
  'All transfers and sightseeing by private vehicle',
  'Toll taxes, parking, and driver allowance',
  'All applicable hotel taxes',
]

export const DEFAULT_EXCLUSIONS = [
  'Airfare / train tickets',
  'Personal expenses and tips',
  'Entry fees at monuments and gardens',
  'Gondola ride and adventure activities',
  'Anything not mentioned in inclusions',
]

export const DEFAULT_SUPPLEMENTS = [
  'Gondola ride (Phase 1 & 2): As per actual',
  'Pony ride at Pahalgam: On direct payment',
  'Shikara ride on Dal Lake: Optional',
]

export const DEFAULT_TERMS = [
  'Package is subject to availability at the time of booking',
  '30% advance payment required to process the booking',
  'Rest payment need to be paid on 1st day of arrival',
  'No refund in case of early return or No show',
]

export const DEFAULT_CANCELLATION = [
  'Cancellation before 30 days: 20% of total cost',
  'Cancellation before 20 days: 50% of total cost',
  'Cancellation within 15 days: No refund',
]
