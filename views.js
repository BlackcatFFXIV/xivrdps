const resources = require('./fflogs-resources')
const changeLog = require('./change-log')

const encounterIds = [
  {name: 'Ultimate', encounters: {'Unending Coil': '1039'}},
  {name: 'Deltascape (Savage)', encounters: {'Alte Roite': '42', 'Catastrophe': '43', 'Halicarnassus': '44', 'Exdeath': '45', 'Neo Exdeath': '46'}},
  {name: 'Trials', encounters: {'Susano': '1036', 'Lakshmi': '1037', 'Shinryu': '1038'}},
  {name: 'Rabanastre', encounters: {'Mateus, the Corrupt': '2008', 'Hashmal, Bringer of Order': '2009', 'Rofocale': '2010', 'Argath Thadalfus': '2011'}}
]

encounterIds.forEach(encounter => {
  const encounters = []
  for (var key in encounter.encounters) {
    encounters.push({name: key, id: encounter.encounters[key]})
  }
  encounter.encounters = encounters
})

class Views {
  constructor(app, fflogs) {
    this.app = app
    this.fflogs = fflogs

    this.views = {
      '/': (req, res) => {
        res.render('index', {
          encounterIds: encounterIds,
          worlds: resources.worlds
        })
      },

      'changelog': (req, res) => {
        res.render('changelog', changeLog)
      },

      'listing/:id': (req, res) => {
        const id = req.params.id
        fflogs.listingData(id, results => {
          if (results && results.rankings) {
            let encounterName = ''
            encounterIds.forEach(category => {
              if (encounterName) return
              category.encounters.forEach(encounter => {
                if (encounter.id === id) encounterName = encounter.name
              })
            })
            res.render('listing', {
              encounterId: id,
              encounterName: encounterName,
              listings: results.rankings
            })
          } else {
            res.send('An error has occured.')
          }
        })
      },

      'characters/:id': (req, res) => {
        const characterArr = req.params.id.split('-')
        if (characterArr.length > 2) {
          const characterName = characterArr[0] + ' ' + characterArr[1]
          const characterWorld = characterArr[2]
          fflogs.characterData(characterName, characterWorld, results => {
            if (results) {
              res.render('characters', {
                characterName: characterName,
                characterWorld: characterWorld,
                characterEncounters: results
              })
            } else {
              res.send('An error has occured.')
            }
          })
        } else {
          res.redirect('/')
        }
      },

      'encounters/:id/:fightId?': (req, res) => {
        const encounterId = req.params.id
        const fightId = req.params.fightId || -1

        try {
          fflogs.encounter(encounterId, fightId, {}, encounter => {
            if (encounter) {
              fflogs.damageDone(encounter, {}, damageDone => {
                if (!damageDone) {
                  res.send('An error has occured.')
                  return
                }
                fflogs.buffTimeline(encounter, {}, buffs => {
                  if (!buffs) {
                    res.send('An error has occured.')
                    return
                  }
                  fflogs.damageFromBuffs(encounter, buffs, {}, contribution => {
                    if (!contribution) {
                      res.send('An error has occured.')
                      return
                    }
                    res.render('encounters', this.playersView(encounter, damageDone, contribution))
                  })
                })
              })
            } else {
              res.send('Unknown or Malformatted Encounter/Fight.')
            }
          })
        } catch(e) {
          res.send('An error has occured.')
        }
      },

      '*': (req, res) => {
        res.redirect('/')
      }
    }

    for (let view in this.views) {
      app.get(view === '/' || view === '*' ? view : '/' + view, this.views[view])
    }
  }

  playersView(encounter, damageDone, contribution) {
    const data = {
      encounter: encounter,
      damageDone: this.fflogs.damageDoneSimple(damageDone),
      contribution: this.fflogs.damageContributionSimple(contribution)
    }

    data.totalPersonalDPS = 0
    data.totalRaidDPS = 0
    data.totalContribution = 0

    data.damageDone.forEach(entry => {
      if (entry.type === 'LimitBreak') {
        entry.raidDPSFull = entry.personalDPSFull
        entry.raidDPS = entry.personalDPS
      } else {
        entry.contributionDPS = 0
        entry.contributions = []
        let dpsPenalty = 0
        const buffs = data.contribution.filter(b => resources.buffs[b.name].job === entry.type)
        const otherBuffs = data.contribution.filter(b => resources.buffs[b.name].job !== entry.type)
        entry.fromOtherBuffs = []
        otherBuffs.forEach(buff => {
          const buffEntry = buff.entries.find(e => e.name === entry.name)
          if (buffEntry) {
            const dpsContribution = (buffEntry.dpsContribution || 0)
            dpsPenalty += dpsContribution
            entry.fromOtherBuffs.push({buff: buff, dps: dpsContribution.toFixed(1) })
          }
        })
        buffs.forEach(buff => {
          const disclaimer = resources.buffs[buff.name].critBuff ? '*' : ''
          entry.contributions.push({ name: buff.name, icon: buff.icon, dps: buff.dps.toFixed(1) + disclaimer })
          entry.contributionDPS += buff.dps
        })
        entry.raidDPSFull = (entry.personalDPSFull + entry.contributionDPS - dpsPenalty)
        entry.raidDPS = entry.raidDPSFull.toFixed(1)
        entry.penalty = (-dpsPenalty).toFixed(1)
        entry.contributionDPSFull = entry.contributionDPS
        entry.contributionDPS = entry.contributionDPS.toFixed(1)
      }
      data.totalContribution += (entry.contributionDPSFull || 0)
      data.totalPersonalDPS += (entry.personalDPSFull || 0)
      data.totalRaidDPS += (entry.raidDPSFull || 0)
    })

    data.totalContribution = data.totalContribution.toFixed(1)
    data.totalRaidDPS = data.totalRaidDPS.toFixed(1)
    data.totalPersonalDPS = data.totalPersonalDPS.toFixed(1)

    encounter.timeTaken = timeStr(intervalObj(encounter.totalTime))

    return data
  }
}

function intervalObj(s) {
  var ms = s % 1000;
  s = (s - ms) / 1000;
  var secs = s % 60;
  s = (s - secs) / 60;
  var mins = s % 60;
  var hrs = (s - mins) / 60;

  return {hours:hrs, minutes: mins, seconds: secs, milliseconds: ms};
}

function timeStr(timeObj) {
  let timeString = ''
  function addZ(n) {
    return (n<10? '0':'') + n;
  }
  if (timeObj.hours) timeString += addZ(timeObj.hours) + ':';
  timeString += (timeObj.hours ? addZ(timeObj.minutes) : timeObj.minutes) + ':' + addZ(timeObj.seconds)
  return timeString
}

process.on('uncaughtException', function(err) {
  console.log('An error has occured.')
})

module.exports = Views
