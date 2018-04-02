const resources = require('./fflogs-resources')
const changeLog = require('./change-log')
const Result = require('./models/result')
const debug = false
const dateOptions = {year: "numeric", month: "long", day: "numeric"}

class Views {
  constructor(app, fflogs) {
    this.app = app
    this.fflogs = fflogs

    this.views = {
      '/': (req, res) => {
        res.render('index', {
          encounterIds: resources.encounters,
          worlds: resources.worlds
        })
      },

      'changelog': (req, res) => {
        res.render('changelog', changeLog)
      },

      'definitions': (req, res) => {
        res.render('definitions', resourcesAsView(resources))
      },

      'listing/:id': (req, res) => {
        const id = req.params.id
        fflogs.listingData(id, results => {
          if (results && results.rankings) {
            let encounterName = ''
            resources.encounters.forEach(category => {
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
            const getEncounter = (err, data) => {
              if (!err && data && data.damageDone && data.damageDone.length) {
                res.render('encounters', this.playersView(data))
              } else {
                getEncounterFromFFLogs()
              }
            }

            if (!debug) {
              if (fightId > -1) {
                Result.findOne({id: encounterId, fightId: fightId}).exec(getEncounter)
              } else {
                Result.findLatest(encounterId, getEncounter)
              }
            } else {
              getEncounterFromFFLogs()
            }
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
                      if (!debug) {
                        const encounterResultModel = new Result(data)
                        encounterResultModel.save()
                      }
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

        getEncounterFromDB()
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
    const encounter = data.encounter
    data.totalPersonalDPS = 0
    data.totalRaidDPS = 0
    data.totalContribution = 0

    this.specialBuffs(data)

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
        const buffs = data.contribution.filter(b => resources.buffs[encounter.patch][b.name].job === entry.type)
        const otherBuffs = data.contribution.filter(b => resources.buffs[encounter.patch][b.name].job !== entry.type)
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
          const disclaimer = resources.disclaimers[resources.buffs[encounter.patch][buff.name].type] || ''
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

  specialBuffs(data) {
    const encounter = data.encounter
    data.damageDone.forEach(entry => {
      if (isSpecial(entry)) {
        const buff = resources.buffs[encounter.patch][entry.name]
        const players = data.damageDone.filter(isPlayer)
        const otherJobs = players.filter(entry => (entry.type !== buff.job))
        const contribution = {name: entry.name, dps: entry.personalDPSFull, icon: buff.icon ? buff.icon + '.png' : '', total: entry.total, entries: []}
        const splitDPS = otherJobs.length ? entry.personalDPSFull / otherJobs.length : 0
        otherJobs.forEach(jobEntry => {
          contribution.entries.push({name: jobEntry.name, type: jobEntry.type, dpsContribution: splitDPS, dps: 0, total: 0})
        })
        data.contribution.push(contribution)
      }
    })
    data.damageDone = data.damageDone.filter(entry => (resources.specialBuffs.indexOf(entry.name) === -1))
  }
}

function isPlayer(entry) {
  return (entry.type !== 'LimitBreak' && !isSpecial(entry))
}

function isSpecial(entry) {
  return (resources.specialBuffs.indexOf(entry.name) !== -1)
}

const parentViewTransforms = {
  buffsLight: (obj, parent, parentKey) => {
    const patchDate = resources.patches[obj.origKey] ? '(' + resources.patches[obj.origKey].release.toLocaleDateString('en-us', dateOptions) + ')' : ''
    const header = `<h3>Patch ${obj.key} ${patchDate}</h3>`
    const buffs = Object.keys(obj.obj).filter(buffName => obj.obj[buffName] && (obj.obj[buffName].bonus || obj.obj[buffName].type === 'special')).map(buffName => {
      const buff = obj.obj[buffName]
      const icon = buff.icon ? `<img src="/img/buffs/${buff.icon}.png" />` : ''
      const jobIcon = (job, size) => job ? `<img src="img/class/${job}.png" alt="${job}" width="${size}" height="${size}" />` : ''
      const disclaimer = resources.disclaimers[buff.type] || ''
      let buffText = ''
      buffName = buffName.replace(/\[(\S)\]/g, '<sup>$1</sup>')
      if (buff.buff) buffText = 'Buff'
      if (buff.debuff) buffText = 'Debuff'
      const head = `
        <div class="buff-definition">
          <div class="buff-name">${icon} ${buffName} ${jobIcon(buff.job, 32)}</div>
            <div class="buff-content">
      `
      let content = ''
      if (buff.isCard) {
        content += `
          <div class="buff-param buff-bonus">Expanded Bonus: ${parseFloat((buff.bonus * 0.5 * 100).toFixed(1))}%${disclaimer}</div>
          <div class="buff-param buff-bonus">Enhanced Bonus: ${parseFloat((buff.bonus * 1.5 * 100).toFixed(1))}%${disclaimer}</div>
        `
      }
      if (buff.bonus) content += `<div class="buff-param buff-bonus">Bonus: ${buff.bonusPercentage}${disclaimer}</div>`
      content += `
        <div class="buff-param">Type: ${buff.typeStr} ${buffText}</div>
      `
      if (buff.affected && buff.affected.length) {
        content += `<div class="buff-param buff-bonus">Affected: ${buff.affected.map(jobName => jobIcon(jobName, 20)).join(' ')}</div>`
      }
      if (buff.id) content += `<div class="buff-param">ID: ${buff.id}</div>`
      const foot = "</div></div>"
      return head + content + foot
    }).join('\n')
    obj.buffs = (text, render) => header + buffs
  }
}

function viewTransform(obj, parent, parentKey) {
  if (parentViewTransforms[parentKey]) parentViewTransforms[parentKey](obj, parent, parentKey)
  obj.obj = objectAsView(obj.obj, obj, obj.origKey)
  return obj
}

function objectAsView(obj, parent, parentKey) {
  return Object.keys(obj).map(key => {
    let value = obj[key]
    if (typeof value === 'object' && value.length === undefined) {
      return viewTransform({key: humanizeCamelCase(key), origKey: key, obj: value}, obj, parentKey)
    }
    return {key: humanizeCamelCase(key), origKey: key, value: value}
  }).reverse()
}

function resourcesAsView(resources) {
  const resourcesView = {}
  Object.keys(resources).forEach(name => {
    const resource = resources[name]
    if (typeof resource === 'object' && resource.length === undefined) {
      resourcesView[name] = objectAsView(resource, resources, name)
    }
  })
  return resourcesView
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

function humanizeCamelCase(str) {
  return str
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
}

process.on('uncaughtException', function(err) {
  console.log(err)
})

module.exports = Views
