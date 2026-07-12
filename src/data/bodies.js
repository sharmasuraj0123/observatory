// Astronomical data.
//
// Planet orbital elements: JPL "Keplerian Elements for Approximate Positions of the
// Major Planets" (E.M. Standish), valid 1800 AD to 2050 AD. Each entry is
// [value at J2000.0, rate per Julian century]; a in AU, angles in degrees.
// w is longitude of perihelion (varpi), node is longitude of ascending node.
//
// Pole orientation: tiltDeg is the angle between the spin axis and the ecliptic
// north pole; poleLonDeg is the ecliptic longitude of the pole, both derived from
// IAU pole RA/Dec. Retrograde rotators (Venus, Uranus, Pluto) use the angular
// momentum pole so the spin rate is always positive in the simulation.
//
// Moon elements are relative to the parent: a in km, angles in degrees.
// frame 'equatorial' means the orbit is measured from the parent's equator plane,
// 'ecliptic' from the ecliptic (used for Earth's Moon and Triton is near-polar).

export const SUN = {
  id: 'sun', name: 'Sun', type: 'star',
  color: 0xffc87a,
  radiusKm: 695700,
  rotationHours: 609.12,
  tiltDeg: 7.25, poleLonDeg: 345.7,
  texture: 'sun',
  info: {
    massKg: 1.989e30, gravity: 274, density: 1.408,
    dayLength: '25.4 days (sidereal, mid-latitudes)', temp: '5,505 C surface, 15M C core',
    atmosphere: 'H 73%, He 25% (photosphere)',
    description: 'A G2V main-sequence star holding 99.86% of the solar system\'s mass. Light from its surface takes about 8 minutes 20 seconds to reach Earth. It fuses roughly 600 million tons of hydrogen every second.',
  },
};

export const PLANETS = [
  {
    id: 'mercury', name: 'Mercury', type: 'planet', color: 0xb0a99f,
    radiusKm: 2439.7, rotationHours: 1407.5, tiltDeg: 7.04, poleLonDeg: 318.2,
    texture: 'mercury',
    elements: {
      a: [0.38709927, 0.00000037], e: [0.20563593, 0.00001906],
      i: [7.00497902, -0.00594749], L: [252.25032350, 149472.67411175],
      w: [77.45779628, 0.16047689], node: [48.33076593, -0.12534081],
    },
    info: {
      massKg: 3.301e23, gravity: 3.7, density: 5.427,
      dayLength: '58.6 days (sidereal)', yearLength: '88.0 days',
      temp: '-173 C night, 427 C day', atmosphere: 'Trace exosphere: O2, Na, H2',
      description: 'The smallest planet and the closest to the Sun. Its 3:2 spin-orbit resonance means a single solar day lasts 176 Earth days, two full Mercury years.',
    },
  },
  {
    id: 'venus', name: 'Venus', type: 'planet', color: 0xe6c98f,
    radiusKm: 6051.8, rotationHours: 5832.44, tiltDeg: 178.8, poleLonDeg: 209.6,
    texture: 'venusSurface', clouds: { texture: 'venusClouds', heightScale: 1.015, periodHours: 100.8, opacity: 0.92 },
    atmosphereGlow: { color: 0xf5e0b0, power: 2.6, intensity: 0.9, scale: 1.045 },
    elements: {
      a: [0.72333566, 0.00000390], e: [0.00677672, -0.00004107],
      i: [3.39467605, -0.00078890], L: [181.97909950, 58517.81538729],
      w: [131.60246718, 0.00268329], node: [76.67984255, -0.27769418],
    },
    info: {
      massKg: 4.867e24, gravity: 8.87, density: 5.243,
      dayLength: '243 days (retrograde)', yearLength: '224.7 days',
      temp: '464 C (hottest planet)', atmosphere: '96.5% CO2, 3.5% N2, H2SO4 clouds',
      description: 'A runaway greenhouse world with a surface pressure 92 times Earth\'s. Its clouds super-rotate around the planet every 4 days while the surface takes 243 days to turn once, backwards.',
    },
  },
  {
    id: 'earth', name: 'Earth', type: 'planet', color: 0x6fa8ff,
    radiusKm: 6371, rotationHours: 23.9345, tiltDeg: 23.44, poleLonDeg: 90,
    texture: 'earthDay', shader: 'earth',
    clouds: { texture: 'earthClouds', heightScale: 1.006, periodHours: 22.9, opacity: 0.85, isAlpha: true },
    atmosphereGlow: { color: 0x6fa8ff, power: 2.4, intensity: 1.35, scale: 1.045 },
    elements: {
      a: [1.00000261, 0.00000562], e: [0.01671123, -0.00004392],
      i: [-0.00001531, -0.01294668], L: [100.46457166, 35999.37244981],
      w: [102.93768193, 0.32327364], node: [0.0, 0.0],
    },
    info: {
      massKg: 5.972e24, gravity: 9.81, density: 5.514,
      dayLength: '23.934 hours', yearLength: '365.256 days',
      temp: '15 C average', atmosphere: '78% N2, 21% O2, 1% Ar',
      description: 'The only known world with liquid surface water and life. The day and night sides you see match the real current time: city lights trace the actual night hemisphere.',
    },
    moons: [
      {
        id: 'moon', name: 'Moon', color: 0xcccccc, radiusKm: 1737.4,
        aKm: 384400, e: 0.0549, iDeg: 5.145, nodeDeg: 125.08, periDeg: 318.15, M0Deg: 135.27,
        periodDays: 27.321661, frame: 'ecliptic', texture: 'moon',
        info: {
          massKg: 7.342e22, gravity: 1.62, density: 3.344,
          dayLength: '27.32 days (locked)', yearLength: '27.32 days around Earth',
          temp: '-173 C to 127 C', atmosphere: 'Essentially none',
          description: 'Earth\'s only natural satellite, born from a giant impact 4.5 billion years ago. Tidally locked, it always shows us the same face.',
        },
      },
    ],
  },
  {
    id: 'mars', name: 'Mars', type: 'planet', color: 0xe07a52,
    radiusKm: 3389.5, rotationHours: 24.6229, tiltDeg: 26.72, poleLonDeg: 352.9,
    texture: 'mars',
    atmosphereGlow: { color: 0xd8a070, power: 3.0, intensity: 0.55, scale: 1.03 },
    elements: {
      a: [1.52371034, 0.00001847], e: [0.09339410, 0.00007882],
      i: [1.84969142, -0.00813131], L: [-4.55343205, 19140.30268499],
      w: [-23.94362959, 0.44441088], node: [49.55953891, -0.29257343],
    },
    info: {
      massKg: 6.417e23, gravity: 3.71, density: 3.933,
      dayLength: '24.62 hours', yearLength: '687.0 days',
      temp: '-63 C average', atmosphere: '95% CO2, very thin (0.6% of Earth)',
      description: 'The red planet, colored by iron oxide dust. Home to Olympus Mons, the tallest volcano in the solar system, and Valles Marineris, a canyon as long as the USA.',
    },
    moons: [
      {
        id: 'phobos', name: 'Phobos', color: 0xa89888, radiusKm: 11.1,
        aKm: 9376, e: 0.0151, iDeg: 1.08, M0Deg: 30, periodDays: 0.31891,
        frame: 'equatorial', texture: 'proc:phobos', irregular: true,
        info: { massKg: 1.06e16, gravity: 0.0057, dayLength: '7.7 hours (locked)', temp: '-40 C', atmosphere: 'None', description: 'A lumpy captured-asteroid-like moon orbiting closer to its planet than any other. Tidal forces are dragging it inward; in about 50 million years it will break apart or crash.' },
      },
      {
        id: 'deimos', name: 'Deimos', color: 0xb0a294, radiusKm: 6.2,
        aKm: 23463, e: 0.0003, iDeg: 1.79, M0Deg: 200, periodDays: 1.263,
        frame: 'equatorial', texture: 'proc:deimos', irregular: true,
        info: { massKg: 1.48e15, gravity: 0.003, dayLength: '30.3 hours (locked)', temp: '-40 C', atmosphere: 'None', description: 'The smaller and outer of Mars\'s two moons, smooth and dusty.' },
      },
    ],
  },
  {
    id: 'jupiter', name: 'Jupiter', type: 'planet', color: 0xd9b38c,
    radiusKm: 69911, rotationHours: 9.925, tiltDeg: 2.23, poleLonDeg: 247.9,
    texture: 'jupiter',
    atmosphereGlow: { color: 0xd8b590, power: 3.0, intensity: 0.5, scale: 1.03 },
    elements: {
      a: [5.20288700, -0.00011607], e: [0.04838624, -0.00013253],
      i: [1.30439695, -0.00183714], L: [34.39644051, 3034.74612775],
      w: [14.72847983, 0.21252668], node: [100.47390909, 0.20469106],
    },
    info: {
      massKg: 1.898e27, gravity: 24.79, density: 1.326,
      dayLength: '9.925 hours (fastest)', yearLength: '11.86 years',
      temp: '-145 C cloud tops', atmosphere: '90% H2, 10% He',
      description: 'The giant of the system, 2.5 times the mass of all other planets combined. The Great Red Spot is a storm larger than Earth that has raged for at least 190 years.',
    },
    moons: [
      { id: 'io', name: 'Io', color: 0xe0c060, radiusKm: 1821.6, aKm: 421700, e: 0.0041, iDeg: 0.05, M0Deg: 0, periodDays: 1.769138, frame: 'equatorial', texture: 'proc:io',
        info: { massKg: 8.93e22, gravity: 1.8, dayLength: '1.77 days (locked)', temp: '-130 C (lava to 1,600 C)', atmosphere: 'Trace SO2', description: 'The most volcanically active body in the solar system, kneaded by Jupiter\'s tides. Over 400 active volcanoes paint it in sulfur yellows.' } },
      { id: 'europa', name: 'Europa', color: 0xd8c8b0, radiusKm: 1560.8, aKm: 671034, e: 0.009, iDeg: 0.47, M0Deg: 90, periodDays: 3.551181, frame: 'equatorial', texture: 'proc:europa',
        info: { massKg: 4.8e22, gravity: 1.31, dayLength: '3.55 days (locked)', temp: '-160 C', atmosphere: 'Trace O2', description: 'An ice shell over a global saltwater ocean holding perhaps twice the water of all Earth\'s oceans. One of the most promising places to look for life.' } },
      { id: 'ganymede', name: 'Ganymede', color: 0xa89890, radiusKm: 2634.1, aKm: 1070412, e: 0.0013, iDeg: 0.2, M0Deg: 180, periodDays: 7.154553, frame: 'equatorial', texture: 'proc:ganymede',
        info: { massKg: 1.482e23, gravity: 1.43, dayLength: '7.15 days (locked)', temp: '-163 C', atmosphere: 'Trace O2', description: 'The largest moon in the solar system, bigger than Mercury, and the only moon with its own magnetic field.' } },
      { id: 'callisto', name: 'Callisto', color: 0x8a7f72, radiusKm: 2410.3, aKm: 1882709, e: 0.0074, iDeg: 0.19, M0Deg: 270, periodDays: 16.689018, frame: 'equatorial', texture: 'proc:callisto',
        info: { massKg: 1.076e23, gravity: 1.24, dayLength: '16.69 days (locked)', temp: '-139 C', atmosphere: 'Trace CO2', description: 'The most heavily cratered object known, an ancient icy surface unchanged for 4 billion years.' } },
    ],
  },
  {
    id: 'saturn', name: 'Saturn', type: 'planet', color: 0xe8d29a,
    radiusKm: 58232, rotationHours: 10.561, tiltDeg: 28.07, poleLonDeg: 79.5,
    texture: 'saturn',
    atmosphereGlow: { color: 0xe8d0a0, power: 3.0, intensity: 0.45, scale: 1.03 },
    rings: { innerKm: 74500, outerKm: 136780, texture: 'saturnRing', opacity: 1.0 },
    elements: {
      a: [9.53667594, -0.00125060], e: [0.05386179, -0.00050991],
      i: [2.48599187, 0.00193609], L: [49.95424423, 1222.49362201],
      w: [92.59887831, -0.41897216], node: [113.66242448, -0.28867794],
    },
    info: {
      massKg: 5.683e26, gravity: 10.44, density: 0.687,
      dayLength: '10.56 hours', yearLength: '29.46 years',
      temp: '-178 C cloud tops', atmosphere: '96% H2, 3% He',
      description: 'The ringed jewel. Its rings are 280,000 km wide yet mostly under 100 meters thick, made of water ice from dust-size grains to house-size boulders. Less dense than water, Saturn would float.',
    },
    moons: [
      { id: 'mimas', name: 'Mimas', color: 0xb8b6b2, radiusKm: 198.2, aKm: 185539, e: 0.0196, iDeg: 1.574, M0Deg: 20, periodDays: 0.942422, frame: 'equatorial', texture: 'proc:mimas',
        info: { massKg: 3.75e19, gravity: 0.064, dayLength: '22.6 hours (locked)', temp: '-200 C', atmosphere: 'None', description: 'The Death Star moon: the crater Herschel spans a third of its diameter.' } },
      { id: 'enceladus', name: 'Enceladus', color: 0xeef2f6, radiusKm: 252.1, aKm: 237948, e: 0.0047, iDeg: 0.009, M0Deg: 75, periodDays: 1.370218, frame: 'equatorial', texture: 'proc:enceladus',
        info: { massKg: 1.08e20, gravity: 0.113, dayLength: '32.9 hours (locked)', temp: '-198 C', atmosphere: 'Trace water vapor', description: 'The brightest body in the solar system. Geysers at its south pole vent a subsurface ocean straight into space, feeding Saturn\'s E ring.' } },
      { id: 'tethys', name: 'Tethys', color: 0xc8c6c2, radiusKm: 531.1, aKm: 294619, e: 0.0001, iDeg: 1.12, M0Deg: 140, periodDays: 1.887802, frame: 'equatorial', texture: 'proc:tethys',
        info: { massKg: 6.17e20, gravity: 0.146, dayLength: '45.3 hours (locked)', temp: '-187 C', atmosphere: 'None', description: 'An icy moon scarred by the enormous canyon Ithaca Chasma.' } },
      { id: 'dione', name: 'Dione', color: 0xc2beb8, radiusKm: 561.4, aKm: 377396, e: 0.0022, iDeg: 0.019, M0Deg: 250, periodDays: 2.736915, frame: 'equatorial', texture: 'proc:dione',
        info: { massKg: 1.095e21, gravity: 0.232, dayLength: '65.7 hours (locked)', temp: '-186 C', atmosphere: 'Trace O2 ions', description: 'Bright ice cliffs streak its trailing hemisphere.' } },
      { id: 'rhea', name: 'Rhea', color: 0xb4b0aa, radiusKm: 763.8, aKm: 527108, e: 0.0013, iDeg: 0.345, M0Deg: 315, periodDays: 4.518212, frame: 'equatorial', texture: 'proc:rhea',
        info: { massKg: 2.31e21, gravity: 0.264, dayLength: '4.52 days (locked)', temp: '-174 C', atmosphere: 'Trace O2, CO2', description: 'Saturn\'s second-largest moon, an ancient cratered ice ball.' } },
      { id: 'titan', name: 'Titan', color: 0xd9a050, radiusKm: 2574.7, aKm: 1221870, e: 0.0288, iDeg: 0.348, M0Deg: 120, periodDays: 15.945, frame: 'equatorial', texture: 'proc:titan',
        atmosphereGlow: { color: 0xd9a050, power: 2.2, intensity: 0.9, scale: 1.09 },
        info: { massKg: 1.345e23, gravity: 1.352, dayLength: '15.95 days (locked)', temp: '-179 C', atmosphere: '95% N2, 5% CH4, thick orange haze', description: 'The only moon with a dense atmosphere, and the only world besides Earth with standing liquid on its surface: rivers, lakes and seas of methane.' } },
      { id: 'iapetus', name: 'Iapetus', color: 0xa09484, radiusKm: 734.5, aKm: 3560820, e: 0.0286, iDeg: 15.47, M0Deg: 200, periodDays: 79.3215, frame: 'equatorial', texture: 'proc:iapetus',
        info: { massKg: 1.81e21, gravity: 0.223, dayLength: '79.3 days (locked)', temp: '-143 C to -173 C', atmosphere: 'None', description: 'The two-faced moon: one hemisphere is coal-dark, the other bright ice, with a mysterious equatorial mountain ridge.' } },
    ],
  },
  {
    id: 'uranus', name: 'Uranus', type: 'planet', color: 0x8fd5e3,
    radiusKm: 25362, rotationHours: 17.24, tiltDeg: 97.72, poleLonDeg: 77.7,
    texture: 'uranus',
    atmosphereGlow: { color: 0xa0e0e8, power: 2.8, intensity: 0.5, scale: 1.035 },
    rings: { innerKm: 41837, outerKm: 51149, texture: 'proc:uranusRing', opacity: 0.7 },
    elements: {
      a: [19.18916464, -0.00196176], e: [0.04725744, -0.00004397],
      i: [0.77263783, -0.00242939], L: [313.23810451, 428.48202785],
      w: [170.95427630, 0.40805281], node: [74.01692503, 0.04240589],
    },
    info: {
      massKg: 8.681e25, gravity: 8.87, density: 1.271,
      dayLength: '17.24 hours (retrograde)', yearLength: '84.02 years',
      temp: '-195 C (coldest atmosphere)', atmosphere: '83% H2, 15% He, 2% CH4',
      description: 'An ice giant knocked onto its side, rolling around the Sun with a 98 degree tilt. Each pole gets 42 years of sunlight followed by 42 years of darkness.',
    },
    moons: [
      { id: 'miranda', name: 'Miranda', color: 0xb0b0b6, radiusKm: 235.8, aKm: 129390, e: 0.0013, iDeg: 4.232, M0Deg: 40, periodDays: 1.413479, frame: 'equatorial', texture: 'proc:miranda',
        info: { massKg: 6.6e19, gravity: 0.079, dayLength: '33.9 hours (locked)', temp: '-187 C', atmosphere: 'None', description: 'A patchwork moon with 20 km ice cliffs, possibly shattered and reassembled.' } },
      { id: 'ariel', name: 'Ariel', color: 0xbcbcc0, radiusKm: 578.9, aKm: 190900, e: 0.0012, iDeg: 0.26, M0Deg: 130, periodDays: 2.520379, frame: 'equatorial', texture: 'proc:ariel',
        info: { massKg: 1.29e21, gravity: 0.269, dayLength: '2.52 days (locked)', temp: '-213 C', atmosphere: 'None', description: 'The brightest of Uranus\'s moons, crossed by ancient rift valleys.' } },
      { id: 'umbriel', name: 'Umbriel', color: 0x76767c, radiusKm: 584.7, aKm: 266000, e: 0.0039, iDeg: 0.128, M0Deg: 220, periodDays: 4.144177, frame: 'equatorial', texture: 'proc:umbriel',
        info: { massKg: 1.28e21, gravity: 0.2, dayLength: '4.14 days (locked)', temp: '-214 C', atmosphere: 'None', description: 'The darkest of the five large Uranian moons.' } },
      { id: 'titania', name: 'Titania', color: 0xa8a09a, radiusKm: 788.4, aKm: 435910, e: 0.0011, iDeg: 0.34, M0Deg: 310, periodDays: 8.705872, frame: 'equatorial', texture: 'proc:titania',
        info: { massKg: 3.4e21, gravity: 0.379, dayLength: '8.71 days (locked)', temp: '-203 C', atmosphere: 'None', description: 'The largest moon of Uranus, with huge fault canyons.' } },
      { id: 'oberon', name: 'Oberon', color: 0x9a8e84, radiusKm: 761.4, aKm: 583520, e: 0.0014, iDeg: 0.058, M0Deg: 55, periodDays: 13.463239, frame: 'equatorial', texture: 'proc:oberon',
        info: { massKg: 3.08e21, gravity: 0.346, dayLength: '13.46 days (locked)', temp: '-203 C', atmosphere: 'None', description: 'The outermost large moon of Uranus, old and heavily cratered.' } },
    ],
  },
  {
    id: 'neptune', name: 'Neptune', type: 'planet', color: 0x5f83ff,
    radiusKm: 24622, rotationHours: 16.11, tiltDeg: 28.0, poleLonDeg: 319.2,
    texture: 'neptune',
    atmosphereGlow: { color: 0x6f90ff, power: 2.8, intensity: 0.55, scale: 1.035 },
    elements: {
      a: [30.06992276, 0.00026291], e: [0.00859048, 0.00005105],
      i: [1.77004347, 0.00035372], L: [-55.12002969, 218.45945325],
      w: [44.96476227, -0.32241464], node: [131.78422574, -0.00508664],
    },
    info: {
      massKg: 1.024e26, gravity: 11.15, density: 1.638,
      dayLength: '16.11 hours', yearLength: '164.8 years',
      temp: '-201 C cloud tops', atmosphere: '80% H2, 19% He, CH4',
      description: 'The windiest world, with supersonic gusts over 2,000 km/h. Found in 1846 by mathematics before telescopes: its position was predicted from Uranus\'s orbital wobbles.',
    },
    moons: [
      { id: 'triton', name: 'Triton', color: 0xd8ccc4, radiusKm: 1353.4, aKm: 354759, e: 0.000016, iDeg: 156.885, M0Deg: 60, periodDays: 5.876854, frame: 'equatorial', texture: 'proc:triton',
        info: { massKg: 2.139e22, gravity: 0.779, dayLength: '5.88 days (locked)', temp: '-235 C', atmosphere: 'Thin N2', description: 'A captured Kuiper Belt object orbiting backwards, with nitrogen geysers erupting from its frozen surface. It is slowly spiraling inward toward destruction.' } },
    ],
  },
];

export const DWARFS = [
  {
    id: 'ceres', name: 'Ceres', type: 'dwarf', color: 0x9aa0a6,
    radiusKm: 469.7, rotationHours: 9.07, tiltDeg: 4, poleLonDeg: 0,
    texture: 'proc:ceres',
    elements: {
      a: [2.7675, 0], e: [0.0760, 0],
      i: [10.594, 0], L: [160.6, 7818.7],
      w: [153.92, 0], node: [80.33, 0],
    },
    info: {
      massKg: 9.38e20, gravity: 0.28, density: 2.16,
      dayLength: '9.07 hours', yearLength: '4.60 years',
      temp: '-105 C', atmosphere: 'Transient water vapor',
      description: 'The largest object in the asteroid belt and the only dwarf planet in the inner solar system. Bright salt deposits shine from Occator crater.',
    },
  },
  {
    id: 'pluto', name: 'Pluto', type: 'dwarf', color: 0xc4b09b,
    radiusKm: 1188.3, rotationHours: 153.29, tiltDeg: 112.7, poleLonDeg: 137.3,
    texture: 'proc:pluto',
    elements: {
      a: [39.48211675, -0.00031596], e: [0.24882730, 0.00005170],
      i: [17.14001206, 0.00004818], L: [238.92903833, 145.20780515],
      w: [224.06891629, -0.04062942], node: [110.30393684, -0.01183482],
    },
    info: {
      massKg: 1.303e22, gravity: 0.62, density: 1.86,
      dayLength: '6.39 days (retrograde)', yearLength: '247.9 years',
      temp: '-232 C', atmosphere: 'Thin N2, CH4, CO',
      description: 'The most famous dwarf planet, with a nitrogen-ice heart (Sputnik Planitia) and five moons. Its orbit is so eccentric that from 1979 to 1999 it was closer to the Sun than Neptune.',
    },
    moons: [
      { id: 'charon', name: 'Charon', color: 0xa8a29c, radiusKm: 606, aKm: 19591, e: 0.0002, iDeg: 0.08, M0Deg: 0, periodDays: 6.387221, frame: 'equatorial', texture: 'proc:charon',
        info: { massKg: 1.586e21, gravity: 0.288, dayLength: '6.39 days (locked)', temp: '-233 C', atmosphere: 'None', description: 'Half the size of Pluto itself; the two orbit a point in open space between them, a true double world.' } },
    ],
  },
];

export const COMET_HALLEY = {
  id: 'halley', name: '1P/Halley', type: 'comet', color: 0x9fd8ff,
  radiusKm: 5.5,
  // Osculating elements near the 1986 apparition
  a: 17.834, e: 0.96714, iDeg: 162.262, nodeDeg: 58.42, periDeg: 111.33,
  perihelionJD: 2446470.9589, // observed 1986 perihelion, Feb 9.4589 UT
  // chosen so the next perihelion lands on the real predicted date (2061 Jul 28);
  // the true period wanders between apparitions due to planetary perturbations
  periodDays: 27563,
  info: {
    massKg: 2.2e14, gravity: 0.0004, density: 0.6,
    dayLength: '2.2 days', yearLength: '75 to 76 years',
    temp: '-70 C nucleus', atmosphere: 'Coma of gas and dust near the Sun',
    description: 'The most famous comet, recorded by astronomers since at least 240 BC. Its 15 km peanut-shaped nucleus grows a tail millions of km long near perihelion. Next return: July 2061. Jump the date forward to watch it happen.',
  },
};

export const ALL_TOP_LEVEL = [...PLANETS, ...DWARFS];
