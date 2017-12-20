const url = 'https://www.fflogs.com:443'
const basePath = '/v1/report/'
const apiKey = process.env.FFLOGS_API_KEY
const request = require('requestretry')
const querystring = require('querystring')
const resources = require('./fflogs-resources')
const DamageDone = require('./models/damage-done')

class FFLogs {
  constructor() {
    this.defaultOptions = { 'api_key': apiKey, translate: true }
  }

  encounter(encounterId, fightId, options, cb) {
    this.request('fights/' + encounterId, options, result => {
      if (!result || result.error || !result.fights || !result.fights.length) {
        if (result && (!result.fights || !result.fights.length) && !result.error) {
          cb({error: 'No encounters found.'})
        }
        cb(result)
      } else {
        fightId = fightId !== undefined ? parseFloat(fightId) : -1
        if (fightId > result.fights.length - 1) fightId = -1
        if (fightId < 0) fightId = result.fights.length
        const encounter = result.fights.find(e => e.id === fightId)
        if (!encounter) {
          cb({error: 'No encounters found.'})
        } else {
          encounter.fightId = fightId
          encounter.id = encounterId
          encounter.name = this.bossNameFromEncounter(result, encounter)
          encounter.totalTime = encounter.end_time - encounter.start_time
          cb(encounter)
        }
      }
    })
  }

  damageDone(encounter, options, cb) {
    options = Object.assign({}, options, {
      start: options.start || encounter.start_time,
      end: options.end || encounter.end_time,
      translate: false
    })
    DamageDone.findOne(options).exec((err, result) => {
      if (!err && result && result.entries && result.entries.length) {
        onResult(result, false)
      } else {
        requestResult()
      }
    })

    const requestResult = () => {
      this.request('tables/damage-done/' + encounter.id, options, result => {
        if (!result || !result.entries || result.error) {
          if (result && !result.entries && !result.error) result.error = 'No entries found.'
          cb(result)
        } else {
          onResult(result, true)
        }
      })
    }

    const onResult = (result, save) => {
      result.entries.forEach(entry => {
        entry.personalDPS = entry.total / encounter.totalTime * 1000
      })
      if (save) {
        const damageDoneModel = new DamageDone(Object.assign({}, options, result))
        damageDoneModel.save()
      }
      cb(result)
    }
  }

  buffTimeline(encounter, options, cb) {
    options = Object.assign({}, options, {
      start: options.start || encounter.start_time,
      end: options.end || encounter.end_time
    })
    const buffsToCheck = Object.values(resources.buffIds)
    const soloBuffTypes = Object.keys(resources.buffs).filter(t => resources.buffs[t].type === 'solo')

    this.request('tables/buffs/' + encounter.id, options, resultBuffs => {
      if (resultBuffs && !resultBuffs.error) {
        resultBuffs = resultBuffs.auras.filter(a => (buffsToCheck.indexOf(a.guid) != -1 || resources.buffIds[a.name]) && (a.guid !== resources.buffs[a.name].excludeId))

        const promises = []
        //const soloBuffs = resultBuffs.filter(a => soloBuffTypes.indexOf(a.name) != -1)
        resultBuffs.forEach(b => {
          promises.push(new Promise((resolve, reject) => {
            const newOptions = Object.assign({}, options, { abilityid: b.guid })
            this.request('tables/buffs/' + encounter.id, newOptions, buffDetails => {
              if (buffDetails && !buffDetails.error) {
                //console.log(b.name, buffDetails)
                resolve({ buff: buffDetails, abilityId: newOptions.abilityid })
              } else {
                reject()
              }
            })
          }))
        })

        Promise.all(promises).then(details => {
          options = Object.assign({}, options, { hostility: 1 })

          this.request('tables/debuffs/' + encounter.id, options, resultDebuffs => {
            if (resultDebuffs && !resultDebuffs.error) {
              resultDebuffs = resultDebuffs.auras.filter(a => buffsToCheck.indexOf(a.guid) != -1)

              resultDebuffs.forEach(debuff => {
                // These are both 'Vulnerability Up', change that.
                if (debuff.guid === resources.buffIds['Trick Attack']) {
                  debuff.originalName = debuff.name
                  debuff.name = 'Trick Attack'
                }
                if (debuff.guid === resources.buffIds['Hypercharge']) {
                  debuff.originalName = debuff.name
                  debuff.name = 'Hypercharge'
                }
              })
              resultDebuffs = resultDebuffs.filter(b => resources.buffs[b.name].debuff)
            } else if (resultDebuffs && resultDebuffs.error) {
              cb(resultDebuffs.error)
              return
            }
            resultBuffs = resultBuffs.filter(b => resources.buffs[b.name].buff)

            resultBuffs.forEach(result => {
              const resultDetails = details.find(b => b.abilityId === result.guid)
              if (resultDetails) {
                resultDetails.buff.auras.forEach(buffDetail => {
                  if (buffDetail.type !== 'Pet') {
                    result.bands.forEach(b => {
                      if (!b.originalStart) {
                        b.originalStart = b.startTime
                        b.originalEnd = b.endTime
                      }
                      const resultBands = buffDetail.bands.filter(band => {
                        return band.startTime >= b.originalStart && band.endTime <= b.originalEnd
                      })
                      if (resultBands && resultBands.length) {
                        b.targets = b.targets || []
                        resultBands.forEach(resultBand => {
                          if (!b.targets.length) {
                            b.startTime = resultBand.startTime
                            b.endTime = resultBand.endTime
                          } else {
                            b.startTime = resultBand.startTime < b.startTime ? resultBand.startTime : b.startTime
                            b.endTime = resultBand.endTime > b.endTime ? resultBand.endTime : b.endTime
                          }
                        })
                        b.targets.push(buffDetail.name)
                      }
                    })
                  }
                })
              }
            })
            const results = resultBuffs.concat(resultDebuffs)
            cb(results)
          })
        })
      } else if (resultBuffs && resultBuffs.error) {
        cb(resultBuffs)
      } else {
        cb(null)
      }
    })
  }

  splitEmbolden(buffs, buff) {
    const newBuffs = {}
    buff.bands.forEach(band => {
      let start = band.startTime
      let end = start + 4000
      for (let i=5; i>0; i--) {
        const name = 'Embolden[' + i + ']'
        newBuffs[name] = newBuffs[name] || Object.assign({}, buff, {name: name, bands: [], abilityIcon: 'embolden' + i + '.png'})
        newBuffs[name].bands.push({startTime: start, endTime: end, targets: band.targets})
        start = end + 1
        end = start + 4000
        if (end > band.endTime) end = band.endTime
      }
    })
    buffs.splice(buffs.indexOf(buff), 1)
    Object.values(newBuffs).forEach(b => buffs.push(b))
  }

  damageFromBuffs(encounter, buffs, options, cb) {
    options = Object.assign({}, options, {
      start: options.start || encounter.start_time,
      end: options.end || encounter.end_time
    })

    const promises = []

    buffs.filter(b => b.name === 'Embolden').forEach(b => this.splitEmbolden(buffs, b))
    buffs.forEach(buff => {
      buff.entries = {}
      buff.bands.forEach(band => {
        promises.push(new Promise((resolve, reject) => {
          this.damageDone(encounter, {start: band.startTime, end: band.endTime}, damageDone => {
            if (!damageDone || damageDone.error) {
              reject(damageDone)
            } else {
              resolve({buff: buff, targets: band.targets || [], damageDone: damageDone, start: band.startTime, end: band.endTime})
            }
          })
        }))
      })
    })

    Promise.all(promises).then(values => {
      values.forEach(value => {
        const simpleDamage = this.damageDoneSimple(value.damageDone)
        simpleDamage.forEach(entry => {
          const type = resources.buffs[value.buff.name].type
          const affected = resources.buffs[value.buff.name].affected
          const debuff = resources.buffs[value.buff.name].debuff
          let targeted = (value.targets.indexOf(entry.name) !== -1)
          if (!targeted && debuff) targeted = true
          if (targeted && affected && affected.indexOf(entry.type) === -1) targeted = false
          if (targeted) {
            value.buff.entries[entry.name] = value.buff.entries[entry.name] || {name: entry.name, type: entry.type, total: 0, isSolo: value.targets.length === 1}
            value.buff.entries[entry.name].total += entry.total
          }
        })
      })

      buffs.forEach(buff => {
        buff.dps = 0
        buff.total = 0
        for (let entryKey in buff.entries) {
          const entry = buff.entries[entryKey]
          const soloBonus = entry.isSolo && resources.buffs[buff.name].soloBonus ? resources.buffs[buff.name].soloBonus : 0
          entry.dps = entry.total / encounter.totalTime * 1000
          entry.dpsContribution = (entry.dps * (resources.buffs[buff.name].bonus + soloBonus)) / (1 + (resources.buffs[buff.name].bonus + soloBonus))
          if (entry.type !== resources.buffs[buff.name].job) {
            buff.dps += entry.dpsContribution
            buff.total += ((entry.total * (resources.buffs[buff.name].bonus + soloBonus)) / (1 + (resources.buffs[buff.name].bonus + soloBonus)))
          }
        }
        buff.entries = Object.values(buff.entries)
      })

      cb(buffs)
    }).catch(e => {
      console.log('Rejection: ', e)
    })
  }

  damageContributionSimple(buffs) {
    return buffs.map(buff => {
      return {
        name: buff.name,
        icon: buff.abilityIcon,
        dps: buff.dps,
        total: buff.total,
        entries: buff.entries
      }
    })
  }

  damageDoneSimple(damageDone) {
    damageDone.entries.sort((e1, e2) => e2.personalDPS - e1.personalDPS)
    return damageDone.entries.map(entry => {
      return {
        name: entry.name,
        type: entry.type,
        total: entry.total,
        personalDPS: entry.personalDPS.toFixed(1),
        personalDPSFull: entry.personalDPS
      }
    })
  }

  request(path, options, cb) {
    const newOptions = Object.assign({}, options, this.defaultOptions)
    if (options.translate === false) delete newOptions.translate // Some things are breaking with trasnlate=true.
    const query = querystring.stringify(newOptions)
    const fullUrl = url + basePath + path + '?' + query
    //console.log('FFLogs request: ',  fullUrl)

    request({url: fullUrl, json: true}, (err, res, body) => {
      if (err) {
        console.log(err)
        cb({error: 'FFLogs: ' + err})
      } else {
        if (body.error) body.error = 'FFLogs: ' + body.error
        cb(body)
      }
    })
  }

  bossNameFromEncounter(result, encounter) {
    const boss = result.enemies.find(enemy => {
      if (enemy.type !== 'Boss') return false
      let isCurrent = false
      enemy.fights.forEach(fight => { isCurrent = fight.id === encounter.fightId; })
      return isCurrent
    })
    return boss ? boss.name : encounter.name
  }

  characterData(characterName, worldName, cb) {
    let characterRegion = 'JP'
    if (resources.worlds.NA.indexOf(worldName) !== -1) {
      characterRegion = 'NA'
    } else if (resources.worlds.EU.indexOf(worldName) !== -1) {
      characterRegion = 'EU'
    }
    const dateOptions = {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
    }
    const fullUrl = url + '/v1/parses/character/' + characterName + '/' + worldName + '/' + characterRegion + '?api_key=' + apiKey
    request({url: fullUrl, json: true}, (err, res, body) => {
      if (err || !body || !body.length) {
        cb(null)
        console.log(err)
      } else {
        body.forEach(encounter => {
          encounter.specs.forEach(spec => {
            spec.data.forEach(data => {
              data.durationStr = timeStr(intervalObj(data.duration))
              data.startTime = new Date(data.start_time).toLocaleTimeString('en-us', dateOptions)
            })
          })
        })
        cb(body)
      }
    })
  }

  listingData(encounterId, cb) {
    const dateOptions = {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
    }
    const fullUrl = url + '/v1/rankings/encounter/' + encounterId + '?metric=speed&api_key=' + apiKey
    request({url: fullUrl, json: true}, (err, res, body) => {
      if (err) {
        cb({error: err})
        return
      } else if (body && body.error) {
        console.log(body)
        cb(body)
        return
      } else if (!body.rankings) {
        console.log(body)
        cb({error: 'No rankings found.'})
        return
      }
      body.rankings.forEach(ranking => {
        ranking.durationStr = timeStr(intervalObj(ranking.duration))
        ranking.startTimeStr = new Date(ranking.startTime).toLocaleTimeString('en-us', dateOptions)
      })
      cb(body)
    })
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

module.exports = FFLogs
