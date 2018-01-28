const critModifier = 0.4666666666
const dhModifier = 0.25
const hasteStaticBuff = (hasteBonus) => {
  return 1 / (1 - hasteBonus) - 1
}

const FFLogsResources = {
  buffIds: {
    'Trick Attack': 1000638,
    'Hypercharge': 1001208,
    'Piercing Resistance Down': 1000820,
    'Chain Stratagem': 1001221,
    'Foe Requiem': 1000140,
    //'Slashing Resistance Down': 1000819,
    'Fey Wind': 1000799,
    'Left Eye': 1001184,
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

  buffs: {
    '4.0': {
      'Trick Attack': {bonus: 0.1, job: 'Ninja', type: 'aoe', debuff: true},
      'The Balance': {bonus: 0.1, job: 'Astrologian', type: 'aoe', buff: true, isCard: true},
      'The Spear': {bonus: 0, job: 'Astrologian', type: 'aoe', critBuff: true, buff: true, isCard: true},
      'The Arrow': {bonus: hasteStaticBuff(0.05), job: 'Astrologian', type: 'aoe', critBuff: true, buff: true, isCard: true},
      'Foe Requiem': {bonus: 0.03, job: 'Bard', type: 'aoe', debuff: true},
      'Hypercharge': {bonus: 0.05, job: 'Machinist', type: 'aoe', debuff: true},
      'Devotion': {bonus: 0.02, job: 'Summoner', type: 'aoe', buff: true},
      'Fey Wind': {bonus: hasteStaticBuff(0.03), job: 'Scholar', type: 'aoe', critBuff: true, buff: true},
      'Chain Stratagem': {bonus: 0.15 * critModifier, job: 'Scholar', type: 'aoe', critBuff: true, debuff: true},
      'Battle Voice': {bonus: 0.15 * dhModifier, job: 'Bard', type: 'aoe', critBuff: true, buff: true},
      'Critical Up': {bonus: 0.02 * critModifier, job: 'Bard', type: 'aoe', critBuff: true, buff: true},
      'Battle Litany': {bonus: 0.15 * critModifier, job: 'Dragoon', type: 'aoe', critBuff: true, buff: true},
      'Left Eye': {bonus: 0.05, job: 'Dragoon', type: 'solo', buff: true},
      'Piercing Resistance Down': {bonus: 0.05, job: 'Dragoon', type: 'solo', debuff: true, affected: ['Bard', 'Machinist']},
      'Physical Vulnerability Up': {bonus: 0.02, job: 'Summoner', type: 'solo', debuff: true, affected: ['Bard', 'Machinist', 'Dragoon', 'Monk', 'Ninja', 'Samurai', 'Paladin', 'DarkKnight', 'Warrior']},
      'Embolden': {bonus: 0, job: 'RedMage', type: 'aoe', buff: true, affected: ['Bard', 'Machinist', 'Dragoon', 'Monk', 'Ninja', 'Samurai', 'Paladin', 'DarkKnight', 'Warrior'], excludeId: 1001239},
      'Embolden[5]': {bonus: 0.1, job: 'RedMage', type: 'aoe', buff: true, affected: ['Bard', 'Machinist', 'Dragoon', 'Monk', 'Ninja', 'Samurai', 'Paladin', 'DarkKnight', 'Warrior'], excludeId: 1001239},
      'Embolden[4]': {bonus: 0.08, job: 'RedMage', type: 'aoe', buff: true, affected: ['Bard', 'Machinist', 'Dragoon', 'Monk', 'Ninja', 'Samurai', 'Paladin', 'DarkKnight', 'Warrior'], excludeId: 1001239},
      'Embolden[3]': {bonus: 0.06, job: 'RedMage', type: 'aoe', buff: true, affected: ['Bard', 'Machinist', 'Dragoon', 'Monk', 'Ninja', 'Samurai', 'Paladin', 'DarkKnight', 'Warrior'], excludeId: 1001239},
      'Embolden[2]': {bonus: 0.04, job: 'RedMage', type: 'aoe', buff: true, affected: ['Bard', 'Machinist', 'Dragoon', 'Monk', 'Ninja', 'Samurai', 'Paladin', 'DarkKnight', 'Warrior'], excludeId: 1001239},
      'Embolden[1]': {bonus: 0.02, job: 'RedMage', type: 'aoe', buff: true, affected: ['Bard', 'Machinist', 'Dragoon', 'Monk', 'Ninja', 'Samurai', 'Paladin', 'DarkKnight', 'Warrior'], excludeId: 1001239},
      'Magic Vulnerability Up': {bonus: 0.1, job: 'Summoner', type: 'solo', debuff: true, affected: ['Scholar', 'WhiteMage', 'BlackMage', 'RedMage']},
      'Brotherhood': {bonus: 0.05, job: 'Monk', type: 'solo', buff: true, affected: ['Bard', 'Machinist', 'Dragoon', 'Ninja', 'Samurai', 'Paladin', 'DarkKnight', 'Warrior']},
      'Enhanced Royal Road': {isRoyalRoad: true, buff: true},
    },
    '4.05': {
      'The Spear': {bonus: 0.05 * critModifier},
      'The Balance': {bonus: 0.05}
    },
    '4.1': {
      'Hypercharge': {bonus: 0.06},
    },
    '4.2': {
      'Hypercharge': {bonus: 0.05},
    }
  },

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

// Apply the state of each buff through the patches
let previousPatchBuffs = null
Object.keys(FFLogsResources.buffs).forEach(patch => {
  const base = '4.0'
  if (patch !== base) {
    const patchBuff = FFLogsResources.buffs[patch]
    const patchInfo = FFLogsResources.patches[patch]
    const patchBuffNew = {}
    Object.keys(previousPatchBuffs).forEach(buffName => {
      patchBuffNew[buffName] = Object.assign({}, previousPatchBuffs[buffName], patchBuff[buffName])
    })
    FFLogsResources.buffs[patch] = patchBuffNew
  }
  previousPatchBuffs = FFLogsResources.buffs[patch]
})

module.exports = FFLogsResources
