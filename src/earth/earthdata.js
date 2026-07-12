// Earth interior, surface, field and atmosphere dataset.
// Radii from PREM (Preliminary Reference Earth Model) and IUGG values.

export const EARTH_RADIUS_KM = 6371;

// concentric layers, inner to outer; radii in km, colors for the cutaway
export const LAYERS = [
  {
    id: 'innerCore', name: 'Inner core', rInner: 0, rOuter: 1221.5,
    color: 0xfff0c0, emissive: 1.5,
    stats: {
      'Depth': '5,150 to 6,371 km',
      'State': 'Solid iron-nickel alloy',
      'Temperature': '5,200 to 5,700 K (like the Sun\'s surface)',
      'Density': '12.8 to 13.1 g/cm³',
      'Pressure': '330 to 364 GPa (3.6M atmospheres)',
      'Gravity': 'falls from 4.4 m/s² at its surface to 0 at the center',
      'Share of Earth\'s mass': 'about 1.7%',
    },
    description: 'A ball of solid iron-nickel about 70% the Moon\'s size, kept solid despite sun-like temperatures by crushing pressure. It grows roughly 1 mm per year as the outer core freezes onto it, releasing latent heat that helps drive the geodynamo. Seismic waves travel faster along the spin axis than across it, hinting at aligned iron crystals.',
  },
  {
    id: 'outerCore', name: 'Outer core', rInner: 1221.5, rOuter: 3480,
    color: 0xffb347, emissive: 0.8,
    stats: {
      'Depth': '2,891 to 5,150 km',
      'State': 'Liquid iron-nickel with sulfur, oxygen, silicon',
      'Temperature': '4,000 to 5,200 K',
      'Density': '9.9 to 12.2 g/cm³',
      'Flow speed': 'about 10 to 20 km per year',
      'Gravity': 'peaks at 10.68 m/s² at the core-mantle boundary',
      'Share of Earth\'s mass': 'about 30.8%',
    },
    description: 'A slowly churning ocean of liquid metal 2,260 km thick. Convection currents twisted by the Coriolis force organize into helical rolls that regenerate Earth\'s magnetic field, the geodynamo. Without it, the solar wind would slowly strip the atmosphere, as it did on Mars.',
  },
  {
    id: 'lowerMantle', name: 'Lower mantle', rInner: 3480, rOuter: 5711,
    color: 0xd8662a, emissive: 0.25,
    stats: {
      'Depth': '660 to 2,891 km',
      'State': 'Solid silicate rock, slowly convecting',
      'Main minerals': 'Bridgmanite (Mg,Fe)SiO₃ + ferropericlase',
      'Temperature': '1,900 to 3,700 K',
      'Density': '4.4 to 5.6 g/cm³',
      'Flow speed': 'centimeters per year',
      'Share of Earth\'s mass': 'about 49%',
    },
    description: 'The largest single layer of the planet. Solid rock that nonetheless flows over millions of years, carrying heat outward in vast convection cells that ultimately drag the tectonic plates. At its base, the mysterious D" layer and continent-sized blobs (LLSVPs) sit on the molten core like piles on a seabed.',
  },
  {
    id: 'upperMantle', name: 'Upper mantle', rInner: 5711, rOuter: 6346,
    color: 0xa8502e, emissive: 0.12,
    stats: {
      'Depth': '25 to 660 km',
      'State': 'Solid peridotite; partially molten asthenosphere',
      'Main minerals': 'Olivine, pyroxene; ringwoodite in the transition zone',
      'Temperature': '500 to 1,900 K',
      'Density': '3.4 to 4.4 g/cm³',
      'Transition zone': '410 to 660 km, may store oceans worth of water',
      'Share of Earth\'s mass': 'about 15.3%',
    },
    description: 'Home of plate tectonics: the rigid lithosphere rides on the weak, partially molten asthenosphere below, drifting 2 to 10 cm per year, about as fast as fingernails grow. Almost all magma that erupts at volcanoes is born here.',
  },
  {
    id: 'crust', name: 'Crust', rInner: 6346, rOuter: 6371,
    color: 0x6b4a34, emissive: 0.05,
    stats: {
      'Oceanic crust': '5 to 10 km thick, basalt, none older than ~200 My',
      'Continental crust': '30 to 70 km thick, granite, up to 4 billion years old',
      'Temperature': '~288 K surface to ~800 K at its base',
      'Density': '2.7 (continental) to 3.0 (oceanic) g/cm³',
      'Share of Earth\'s mass': 'about 0.5%',
      'True scale': 'thinner than an apple\'s skin relative to the whole planet',
    },
    description: 'The cold, brittle shell we live on, broken into 7 major tectonic plates. Oceanic crust is dense, young and constantly recycled at subduction zones; continental crust is buoyant and ancient. At the scale of this model the crust is a hairline: everything human ever built sits inside it.',
  },
];

export const EXTRAS = [
  {
    id: 'ocean', name: 'Oceans',
    stats: {
      'Surface coverage': '70.8% of Earth (361.1M km²)',
      'Mean depth': '3,688 m',
      'Deepest point': '10,935 m (Challenger Deep, Mariana Trench)',
      'Volume': '1.335 billion km³ (96.5% of all Earth\'s water)',
      'Mean salinity': '3.5%',
      'Heat storage': 'absorbs ~90% of excess greenhouse heat',
      'CO₂ uptake': 'absorbs roughly a quarter of human emissions',
    },
    description: 'One connected world ocean. Surface currents like the Gulf Stream (up to 2.5 m/s) move heat poleward, while the deep thermohaline circulation takes roughly a thousand years for one full loop. Tides are the Moon\'s gravity made visible. The SPM mooring simulation in this tab plays out on the thin, energetic skin of this layer.',
  },
  {
    id: 'land', name: 'Land',
    stats: {
      'Surface coverage': '29.2% of Earth (148.9M km²)',
      'Mean elevation': '840 m above sea level',
      'Highest point': '8,849 m (Everest)',
      'Lowest dry point': '-430 m (Dead Sea shore)',
      'Forest cover': 'about 31% of land',
      'Ice cover': 'about 10% (Antarctica + Greenland hold 68% of fresh water)',
    },
    description: 'The exposed tops of the continental crust. Rock weathers into soil, rivers carry it back to the sea, and subduction returns it to the mantle: a rock cycle that has been recycling the surface for four billion years.',
  },
  {
    id: 'atmosphere', name: 'Atmosphere',
    stats: {
      'Total mass': '5.15 × 10¹⁸ kg (one millionth of Earth\'s mass)',
      'Composition': 'N₂ 78.08%, O₂ 20.95%, Ar 0.93%, CO₂ ~0.04%',
      'Troposphere': '0 to ~12 km: 80% of the mass, all weather',
      'Stratosphere': '12 to 50 km: ozone layer, airliners fly at its base',
      'Mesosphere': '50 to 85 km: coldest place on Earth (-90 °C), meteors burn',
      'Thermosphere': '85 to 600 km: aurora, ISS at ~400 km',
      'Exosphere': '600 to ~10,000 km: atoms escaping to space',
    },
    description: 'A film of gas thinner, proportionally, than condensation on a window. Half its mass lies below 5.5 km. It burns up about 50 tonnes of meteoroids a day, carries the weather that loads the mooring chains below, and its oxygen exists only because of life.',
  },
  {
    id: 'magnetic', name: 'Magnetic field',
    stats: {
      'Source': 'geodynamo convection in the liquid outer core',
      'Surface strength': '25 to 65 μT',
      'Dipole moment': '~7.9 × 10²² A·m²',
      'Dipole tilt': '~11° from the rotation axis',
      'Pole drift': 'magnetic north moving ~45 km/yr toward Siberia',
      'Reversals': 'irregular; last full reversal 780,000 years ago',
      'Weak spot': 'South Atlantic Anomaly (satellites take radiation hits there)',
    },
    description: 'A self-sustaining electromagnetic engine: moving liquid metal generates the field that shapes the motion that regenerates the field. It carves the magnetosphere out of the solar wind, funnels charged particles into the auroral ovals, and lets compasses (and sea turtles) navigate. The field lines drawn here follow the tilted dipole approximation.',
  },
  {
    id: 'gravity', name: 'Gravity',
    stats: {
      'Surface (equator)': '9.780 m/s²',
      'Surface (poles)': '9.832 m/s² (rotation + flattening)',
      'Maximum': '~10.7 m/s² at the core-mantle boundary',
      'Center': '0 m/s² (all mass pulls outward equally)',
      'Geoid variation': 'sea-level surface undulates by ±100 m',
      'Escape velocity': '11.186 km/s',
    },
    description: 'Inside the planet, gravity does not simply fade: it climbs slightly all the way down to the core-mantle boundary, because the dense core concentrates mass below your feet, then collapses to zero at the center. The GRACE satellites weigh groundwater and melting ice sheets by watching the field change.',
  },
];

export const EARTH_FACTS = {
  'Mass': '5.972 × 10²⁴ kg',
  'Mean radius': '6,371.0 km (equatorial 6,378.1, polar 6,356.8)',
  'Surface area': '510.1M km²',
  'Mean density': '5.514 g/cm³ (densest planet)',
  'Sidereal day': '23 h 56 m 4.1 s',
  'Age': '4.54 billion years',
  'Internal heat flow': '47 TW (half primordial, half radioactive decay)',
};
