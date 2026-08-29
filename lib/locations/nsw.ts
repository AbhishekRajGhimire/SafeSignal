export interface NswPlace {
  label: string
  postcode: string
  lat: number
  lon: number
}

/**
 * A curated list rather than a geocoding API: no key, no network, and it
 * works offline, which is the point.
 */
export const NSW_PLACES: NswPlace[] = [
  { label: 'Sydney', postcode: '2000', lat: -33.8688, lon: 151.2093 },
  { label: 'Parramatta', postcode: '2150', lat: -33.815, lon: 151.0 },
  { label: 'Blacktown', postcode: '2148', lat: -33.771, lon: 150.906 },
  { label: 'Liverpool', postcode: '2170', lat: -33.9203, lon: 150.9235 },
  { label: 'Campbelltown', postcode: '2560', lat: -34.065, lon: 150.8142 },
  { label: 'Camden', postcode: '2570', lat: -34.0548, lon: 150.6963 },
  { label: 'Penrith', postcode: '2750', lat: -33.7507, lon: 150.6877 },
  { label: 'Richmond', postcode: '2753', lat: -33.5996, lon: 150.7511 },
  { label: 'Springwood', postcode: '2777', lat: -33.6989, lon: 150.5619 },
  { label: 'Katoomba', postcode: '2780', lat: -33.7128, lon: 150.3119 },
  { label: 'Lithgow', postcode: '2790', lat: -33.4818, lon: 150.1553 },
  { label: 'Hornsby', postcode: '2077', lat: -33.7048, lon: 151.0993 },
  { label: 'Manly', postcode: '2095', lat: -33.7969, lon: 151.287 },
  { label: 'Cronulla', postcode: '2230', lat: -34.0587, lon: 151.1526 },
  { label: 'Gosford', postcode: '2250', lat: -33.4269, lon: 151.3428 },
  { label: 'Newcastle', postcode: '2300', lat: -32.9283, lon: 151.7817 },
  { label: 'Maitland', postcode: '2320', lat: -32.7333, lon: 151.55 },
  { label: 'Cessnock', postcode: '2325', lat: -32.8347, lon: 151.3567 },
  { label: 'Singleton', postcode: '2330', lat: -32.5667, lon: 151.17 },
  { label: 'Muswellbrook', postcode: '2333', lat: -32.265, lon: 150.889 },
  { label: 'Nelson Bay', postcode: '2315', lat: -32.72, lon: 152.15 },
  { label: 'Forster', postcode: '2428', lat: -32.18, lon: 152.51 },
  { label: 'Taree', postcode: '2430', lat: -31.9074, lon: 152.46 },
  { label: 'Port Macquarie', postcode: '2444', lat: -31.4333, lon: 152.9089 },
  { label: 'Kempsey', postcode: '2440', lat: -31.08, lon: 152.84 },
  { label: 'Coffs Harbour', postcode: '2450', lat: -30.2963, lon: 153.1135 },
  { label: 'Grafton', postcode: '2460', lat: -29.69, lon: 152.9333 },
  { label: 'Casino', postcode: '2470', lat: -28.86, lon: 153.05 },
  { label: 'Lismore', postcode: '2480', lat: -28.8134, lon: 153.2773 },
  { label: 'Ballina', postcode: '2478', lat: -28.8639, lon: 153.5652 },
  { label: 'Byron Bay', postcode: '2481', lat: -28.6474, lon: 153.602 },
  { label: 'Tweed Heads', postcode: '2485', lat: -28.1747, lon: 153.5392 },
  { label: 'Armidale', postcode: '2350', lat: -30.515, lon: 151.6655 },
  { label: 'Tamworth', postcode: '2340', lat: -31.0927, lon: 150.932 },
  { label: 'Inverell', postcode: '2360', lat: -29.7756, lon: 151.112 },
  { label: 'Glen Innes', postcode: '2370', lat: -29.735, lon: 151.74 },
  { label: 'Moree', postcode: '2400', lat: -29.4658, lon: 149.8416 },
  { label: 'Narrabri', postcode: '2390', lat: -30.326, lon: 149.783 },
  { label: 'Dubbo', postcode: '2830', lat: -32.2569, lon: 148.6011 },
  { label: 'Mudgee', postcode: '2850', lat: -32.5942, lon: 149.5872 },
  { label: 'Orange', postcode: '2800', lat: -33.2835, lon: 149.1012 },
  { label: 'Bathurst', postcode: '2795', lat: -33.4193, lon: 149.5775 },
  { label: 'Cowra', postcode: '2794', lat: -33.836, lon: 148.694 },
  { label: 'Young', postcode: '2594', lat: -34.313, lon: 148.3 },
  { label: 'Goulburn', postcode: '2580', lat: -34.7515, lon: 149.7186 },
  { label: 'Queanbeyan', postcode: '2620', lat: -35.355, lon: 149.232 },
  { label: 'Wollongong', postcode: '2500', lat: -34.4278, lon: 150.8931 },
  { label: 'Nowra', postcode: '2541', lat: -34.8846, lon: 150.6006 },
  { label: 'Batemans Bay', postcode: '2536', lat: -35.7076, lon: 150.1744 },
  { label: 'Bega', postcode: '2550', lat: -36.6742, lon: 149.8419 },
  { label: 'Wagga Wagga', postcode: '2650', lat: -35.1082, lon: 147.3598 },
  { label: 'Albury', postcode: '2640', lat: -36.0737, lon: 146.9135 },
  { label: 'Griffith', postcode: '2680', lat: -34.29, lon: 146.04 },
  { label: 'Deniliquin', postcode: '2710', lat: -35.532, lon: 144.953 },
  { label: 'Broken Hill', postcode: '2880', lat: -31.9539, lon: 141.4539 },
]

/** Blue Mountains anchor for demo mode on a device with no profile. */
export const DEFAULT_DEMO_PLACE: NswPlace =
  NSW_PLACES.find((p) => p.label === 'Katoomba')!

export function searchPlaces(query: string, limit = 8): NswPlace[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return []

  return NSW_PLACES.filter(
    (place) =>
      place.label.toLowerCase().includes(needle) || place.postcode.startsWith(needle),
  ).slice(0, limit)
}
