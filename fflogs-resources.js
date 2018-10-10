const critModifier = 0.4666666666
const dhModifier = 0.25

function exclusionFilter(arr, excluded) {
  return arr.filter(job => {
    if (typeof excluded === 'string') return job !== excluded
    if (typeof excluded === 'object' && excluded.length) return excluded.indexOf(job) === -1
    return true
  })
}

const physClasses = excluded => exclusionFilter(['Bard', 'Machinist', 'Dragoon', 'Monk', 'Ninja', 'Samurai', 'Paladin', 'DarkKnight', 'Warrior'], excluded)
const magicClasses = excluded => exclusionFilter(['Astrologian', 'Scholar', 'WhiteMage', 'BlackMage', 'RedMage', 'Summoner'], excluded)
const piercingClasses = excluded => exclusionFilter(['Bard', 'Machinist', 'Dragoon'], excluded)
const slashingClasses = ['Paladin', 'DarkKnight']

const FFLogsResources = {
  buffIds: {
    'Trick Attack': 1000638,
    'Hypercharge': 1001208,
    'Piercing Resistance Down': 1000820,
    'Chain Stratagem': 1001221,
    'Foe Requiem': 1000140,
    'Slashing Resistance Down': 1000819,
    'Fey Wind': 1000799,
    'Left Eye': 1001454,
    'The Spear': 1000832,
    'The Arrow': 1000831,
    'The Balance': 1000829,
    'Battle Voice': 1000141,
    'Battle Litany': 1000786,
    'Devotion': 1001213,
    'Critical Up': 1001188,
    'Magic Vulnerability Up': 1000494,
    'Physical Vulnerability Up': 1000493,
    'Brotherhood': 1001182,
    'Embolden': 1001297,
    'Enhanced Royal Road': 1000816
    //'Expanded Royal Road': 1000817,
    //'Extended Royal Road': 1000818
  },

  critModifier: critModifier,
  dhModifier: dhModifier,

  patches: {
    '4.0': {release: new Date('2017-06-15 11:00:00Z')},
    '4.05': {release: new Date('2017-07-18 11:00:00Z')},
    '4.1': {release: new Date('2017-10-10 11:00:00Z')},
    '4.2': {release: new Date('2018-01-30 11:00:00Z')}
  },

  specialBuffs: ['Radiant Shield'],

  buffs: {
    '4.0': {
      'Trick Attack': {bonus: 0.1, job: 'Ninja', debuff: true, icon: '015000-015020'},
      'The Balance': {bonus: 0.2, job: 'Astrologian', buff: true, isCard: true, icon: '013000-013204'},
      'The Spear': {bonus: 0, job: 'Astrologian', type: 'crit', buff: true, isCard: true, icon: '013000-013207'},
      'The Arrow': {bonus: 0.1, haste: 0.1, job: 'Astrologian', type: 'haste', buff: true, isCard: true, icon: '013000-013206'},
      'Foe Requiem': {bonus: 0.03, job: 'Bard', debuff: true, icon: '012000-012608'},
      'Hypercharge': {bonus: 0.05, job: 'Machinist', debuff: true, icon: '015000-015020'},
      'Devotion': {bonus: 0.02, job: 'Summoner', buff: true, icon: '012000-012681'},
      'Fey Wind': {bonus: 0.03, haste: 0.03, job: 'Scholar', type: 'haste', buff: true, icon: '012000-012807'},
      'Chain Stratagem': {bonus: 0.15 * critModifier, job: 'Scholar', type: 'crit', debuff: true, icon: '012000-012809'},
      'Battle Voice': {bonus: 0.15 * dhModifier, job: 'Bard', type: 'dh', buff: true, icon: '012000-012601'},
      'Critical Up': {bonus: 0.02 * critModifier, job: 'Bard', type: 'crit', buff: true, icon: '012000-012613'},
      'Battle Litany': {bonus: 0.15 * critModifier, job: 'Dragoon', type: 'crit', buff: true, icon: '012000-012578'},
      'Left Eye': {bonus: 0.05, job: 'Dragoon', buff: true, icon: '012000-012582'},
      'Piercing Resistance Down': {bonus: 0.05, job: 'Dragoon', debuff: true, affected: piercingClasses('Dragoon'), affectedType: 'piercing', icon: '015000-015065'},
      'Slashing Resistance Down': {bonus: 0.1, debuff: true, affected: slashingClasses, affectedType: 'slashing', icon: '015000-015786'},
      'Physical Vulnerability Up': {bonus: 0.02, job: 'Summoner', debuff: true, affected: physClasses('Summoner'), affectedType: 'physical', icon: '015000-015053'},
      'Embolden': {bonus: 0, job: 'RedMage', buff: true, affected: physClasses('RedMage'), affectedType: 'physical', excludeId: 1001239},
      'Embolden[5]': {bonus: 0.1, job: 'RedMage', buff: true, affected: physClasses('RedMage'), affectedType: 'physical', excludeId: 1001239, icon: 'embolden5'},
      'Embolden[4]': {bonus: 0.08, job: 'RedMage', buff: true, affected: physClasses('RedMage'), affectedType: 'physical', excludeId: 1001239, icon: 'embolden4'},
      'Embolden[3]': {bonus: 0.06, job: 'RedMage', buff: true, affected: physClasses('RedMage'), affectedType: 'physical', excludeId: 1001239, icon: 'embolden3'},
      'Embolden[2]': {bonus: 0.04, job: 'RedMage', buff: true, affected: physClasses('RedMage'), affectedType: 'physical', excludeId: 1001239, icon: 'embolden2'},
      'Embolden[1]': {bonus: 0.02, job: 'RedMage', buff: true, affected: physClasses('RedMage'), affectedType: 'physical', excludeId: 1001239, icon: 'embolden1'},
      'Magic Vulnerability Up': {bonus: 0.1, job: 'Summoner', debuff: true, affected: magicClasses('Summoner'), affectedType: 'magical', icon: '015000-015057'},
      'Brotherhood': {bonus: 0.05, job: 'Monk', buff: true, affected: physClasses('Monk'), affectedType: 'physical', icon: '012000-012529'},
      'Enhanced Royal Road': {isRoyalRoad: true, buff: true},
      'Radiant Shield': {type: 'special', job: 'Summoner', icon: '012000-012711'}
    },
    '4.05': {
      'The Spear': {bonus: 0.1 * critModifier},
      'The Balance': {bonus: 0.1}
    },
    '4.1': {
      'Hypercharge': {bonus: 0.06},
    },
    '4.2': {
      'Hypercharge': {bonus: 0.05},
    }
  },

  disclaimers: {crit: '*', dh: '`', haste: '^'},

  encounters: [
    {name: 'Alphascape (Savage)', encounters: {'Chaos': '60', 'Midgardsormr': '61', 'Omega': '62', 'Omega M & Omega F': '63', 'Final Omega': '64'}},
    {name: 'Sigmascape (Savage)', encounters: {'Phantom Train': '51', 'Demon Chadarnook': '52', 'Guardian': '53', 'Kefka': '54', 'God Kefka': '55'}},
    {name: 'Ultimate', encounters: {'Unending Coil': '1039', 'Ultima Weapon': '1042'}},
    {name: 'Deltascape (Savage)', encounters: {'Alte Roite': '42', 'Catastrophe': '43', 'Halicarnassus': '44', 'Exdeath': '45', 'Neo Exdeath': '46'}},
    {name: 'Trials', encounters: {'Susano': '1036', 'Lakshmi': '1037', 'Shinryu': '1038', 'Byakko': '1040', 'Tsukuyomi': '1041'}},
    {name: 'Rabanastre', encounters: {'Mateus, the Corrupt': '2008', 'Hashmal, Bringer of Order': '2009', 'Rofocale': '2010', 'Argath Thadalfus': '2011'}}
  ],

  targetBlacklist: {
    '52': ['Easterly'],
    '53': ['Bibliolatrist']
  },

  attackTypeDeviation: {
    magical: [
      'Holy Spirit',
      'Raiton',
      'Katon',
      'Doton',
      'Suiton',
      'Bhavacakra',
      'Hellfrog Medium',
      'Unmend',
      'Unleash',
      'Abyssal Drain',
      'Dark Passenger',
      'Salted Earth'
    ],
    slashing: [],
    blunt: [],
    piercing: [
      'Fleche',
      'Contre Sixte',
      'Corps-a-corps',
      'Displacement'
    ]
  },

  autoAttacks: {
    BlackMage: ['blunt', 'physical'],
    Summoner: ['blunt', 'physical'],
    RedMage: ['piercing', 'physical'],
    WhiteMage: ['blunt', 'physical'],
    Scholar: ['blunt', 'physical'],
    Astrologian: ['slashing', 'physical']
  },

  ogcdAbilities: [
    25,
    26,
    29,
    23,
    7383,
    7386,
    7387,
    3633,
    3639,
    3640,
    3643,
    3571,
    167,
    174,
    179,
    7441,
    7440,
    7444,
    71,
    64,
    67,
    3547,
    3545,
    3543,
    7864,
    7865,
    7866,
    7868,
    92,
    95,
    96,
    3555,
    7399,
    7400,
    2246,
    2248,
    2258,
    2256,
    3566,
    7401,
    7402,
    2265,
    2266,
    2267,
    2268,
    2270,
    2271,
    7500,
    7492,
    7493,
    7490,
    7491,
    7501,
    7496,
    103,
    110,
    117,
    7404,
    3562,
    2875,
    2878,
    2874,
    2890,
    7416,
    7417,
    7418,
    181,
    3578,
    3580,
    3582,
    7449,
    793,
    796,
    791,
    801,
    7506,
    7515,
    7517,
    7519
 ],

  worlds: {
    NA: [
      'Adamantoise',
      'Balmung',
      'Cactuar',
      'Coeurl',
      'Faerie',
      'Gilgamesh',
      'Goblin',
      'Jenova',
      'Mateus',
      'Midgardsormr',
      'Sargatanas',
      'Siren',
      'Zalera',
      'Behemoth',
      'Brynhildr',
      'Diabolos',
      'Excalibur',
      'Exodus',
      'Famfrit',
      'Hyperion',
      'Lamia',
      'Leviathan',
      'Malboro',
      'Ultros'
    ],

    EU: [
      'Cerberus',
      'Lich',
      'Louisoix',
      'Moogle',
      'Odin',
      'Omega',
      'Phoenix',
      'Ragnarok',
      'Shiva',
      'Zodiark',
    ],

    JP: [
      'Aegis',
      'Atomos',
      'Carbuncle',
      'Garuda',
      'Gungnir',
      'Kujata',
      'Ramuh',
      'Tonberry',
      'Typhon',
      'Unicorn',
      'Alexander',
      'Bahamut',
      'Durandal',
      'Fenrir',
      'Ifrit',
      'Ridill',
      'Tiamat',
      'Ultima',
      'Valefor',
      'Yojimbo',
      'Zeromus',
      'Anima',
      'Asura',
      'Belias',
      'Chocobo',
      'Hades',
      'Ixion',
      'Mandragora',
      'Masamune',
      'Pandaemonium',
      'Shinryu',
      'Titan'
    ]
  }
}

// Default params to show on each, even in light resources
const defaultParamsToShow = ['icon', 'job', 'type', 'buff', 'debuff', 'isCard', 'isRoyalRoad']

// Apply the state of each buff through the patches
let previousPatchBuffs = null
FFLogsResources.buffsLight = {}
Object.keys(FFLogsResources.buffs).forEach(patch => {
  const base = '4.0'
  const patchBuff = FFLogsResources.buffs[patch]
  FFLogsResources.buffsLight[patch] = patchBuff
  if (patch !== base) {
    const patchInfo = FFLogsResources.patches[patch]
    const patchBuffNew = {}
    Object.keys(previousPatchBuffs).forEach(buffName => {
      patchBuffNew[buffName] = Object.assign({}, previousPatchBuffs[buffName], patchBuff[buffName])
      defaultParamsToShow.forEach(paramName => {
        if (patchBuff[buffName] && !patchBuff[buffName][paramName]) patchBuff[buffName][paramName] = patchBuffNew[buffName][paramName]
      })
    })
    FFLogsResources.buffs[patch] = patchBuffNew
  } else {
    Object.keys(patchBuff).forEach(buffName => {
      if (!patchBuff[buffName].type) patchBuff[buffName].type = 'damage'
    })
  }
  previousPatchBuffs = FFLogsResources.buffs[patch]
})

const typesFull = {
  crit: 'Critical Hit',
  dh: 'Direct Hit',
  haste: 'Haste',
  damage: 'Damage',
  special: 'Special'
}

FFLogsResources.attackTypeDeviation.physical =
  FFLogsResources.attackTypeDeviation.piercing
    .concat(FFLogsResources.attackTypeDeviation.slashing)
    .concat(FFLogsResources.attackTypeDeviation.blunt)


FFLogsResources.attackTypesByAbility = {}
Object.keys(FFLogsResources.attackTypeDeviation).forEach(attackType => {
  FFLogsResources.attackTypeDeviation[attackType].forEach(abilityName => {
    FFLogsResources.attackTypesByAbility[abilityName] = FFLogsResources.attackTypesByAbility[abilityName] || []
    FFLogsResources.attackTypesByAbility[abilityName].push(attackType)
  })
})

Object.keys(FFLogsResources.buffsLight).forEach(patch => {
  Object.keys(FFLogsResources.buffsLight[patch]).forEach(buffName => {
    const buff = FFLogsResources.buffsLight[patch][buffName]
    if (buff.bonus !== undefined) buff.bonusPercentage = parseFloat(((buff.bonus) * 100).toFixed(1)) + '%'
    if (buff.type !== undefined) buff.typeStr = typesFull[buff.type]
    buff.id = FFLogsResources.buffIds[buffName]
  });
});

FFLogsResources.encounters.forEach(encounter => {
  const encounters = []
  for (var key in encounter.encounters) {
    encounters.push({name: key, id: encounter.encounters[key]})
  }
  encounter.encounters = encounters
})

module.exports = FFLogsResources
