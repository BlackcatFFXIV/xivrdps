const resources = require('./fflogs-resources')
const changeLog = require('./change-log')
const Result = require('./models/result')

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
          } else if (results && results.error) {
            res.render('errors', results)
          } else {
            res.render('errors', {error: 'An unknown error has occured.'})
          }
        })
      },

      'characters/:id': (req, res) => {
        const characterArr = req.params.id.split('-')
        if (characterArr.length > 2) {
          const characterName = characterArr[0] + ' ' + characterArr[1]
          const characterWorld = characterArr[2]
          fflogs.characterData(characterName, characterWorld, results => {
            if (results && !results.error) {
              res.render('characters', {
                characterName: characterName,
                characterWorld: characterWorld,
                characterEncounters: results
              })
            } else if (results && results.error) {
              res.render('errors', results)
            } else {
              res.render('errors', {error: 'An unknown error has occured.'})
            }
          })
        } else {
          res.redirect('/')
        }
      },

      'encounters/:id/:fightId?': (req, res) => {
        const encounterId = req.params.id
        let fightId = req.params.fightId || -1
        fightId = fightId !== undefined ? parseFloat(fightId) : -1

        const getEncounterFromDB = () => {
          try {
            Result.findOne({id: encounterId, fightId: fightId}).exec((err, data) => {
              if (!err && data && data.damageDone && data.damageDone.length) {
                res.render('encounters', this.playersView(data))
              } else {
                getEncounterFromFFLogs()
              }
            })
          } catch (e) {
            getEncounterFromFFLogs()
          }
        }

        const getEncounterFromFFLogs = () => {
          try {
            fflogs.encounter(encounterId, fightId, {}, encounter => {
              if (encounter) {
                if (encounter.error) {
                  res.render('errors', encounter)
                  return
                }
                fflogs.damageDone(encounter, {}, damageDone => {
                  if (!damageDone) {
                    res.render('errors', {error: 'An unknown error has occured.'})
                    return
                  } else if (damageDone.error) {
                    res.render('errors', damageDone)
                    return
                  }
                  fflogs.buffTimeline(encounter, {}, buffs => {
                    if (!buffs) {
                      res.render('errors', {error: 'An unknown error has occured.'})
                      return
                    } else if (buffs.error) {
                      res.render('errors', buffs)
                      return
                    }
                    fflogs.damageFromBuffs(encounter, buffs, {}, contribution => {
                      if (!contribution) {
                        res.render('errors', {error: 'An unknown error has occured.'})
                        return
                      } else if (contribution.error) {
                        res.render('errors', contribution)
                        return
                      }
                      const data = {
                        id: encounter.id,
                        fightId: encounter.fightId,
                        encounter: encounter,
                        damageDone: this.fflogs.damageDoneSimple(damageDone),
                        contribution: this.fflogs.damageContributionSimple(contribution)
                      }
                      res.render('encounters', this.playersView(data))
                      const encounterResultModel = new Result(data)
                      encounterResultModel.save()
                    })
                  })
                })
              } else {
                res.render('errors', {error: 'Unknown or Malformatted Encounter/Fight.'})
              }
            })
          } catch(e) {
            res.render('errors', {error: 'An unknown error has occured.'})
          }
        }

        if (fightId > -1) {
          getEncounterFromDB()
        } else {
          res.render('errors', {error: 'Unknown or Malformatted Encounter/Fight.'})
          return
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

  playersView(data) {
    data.totalPersonalDPS = 0
    data.totalRaidDPS = 0
    data.totalContribution = 0

    data.jobAmount = {}
    data.damageDone.forEach(entry => {
      data.jobAmount[entry.type] = data.jobAmount[entry.type] || 0
      data.jobAmount[entry.type]++
    })

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
        const jobAmount = data.jobAmount[entry.type] || 1
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
          let dps = buff.dps / jobAmount
          entry.contributions.push({ name: buff.name, icon: buff.icon, dps: dps.toFixed(1) + disclaimer })
          entry.contributionDPS += dps
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

    data.encounter.timeTaken = timeStr(intervalObj(data.encounter.totalTime))

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
  console.log(err)
})

module.exports = Views
