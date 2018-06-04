const url = 'https://www.fflogs.com:443'
const basePath = '/v1/report/'
const apiKey = process.env.FFLOGS_API_KEY
const request = require('requestretry')
const querystring = require('querystring')
const resources = require('./fflogs-resources')
const DamageDone = require('./models/damage-done')
const dateOptions = {year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"}

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
          encounter.date = new Date(result.start)
          encounter.patch = this.getPatch(encounter.date)
          encounter.patchStr = (encounter.date < resources.patches['4.0'].release) ? "[<4.0] WARNING: This may not be using the correct buffs!" : ("[" + encounter.patch + "]")
          encounter.dateStr = encounter.date.toLocaleTimeString('en-us', dateOptions)
          encounter.fightId = fightId
          encounter.id = encounterId
          encounter.name = this.bossNameFromEncounter(result, encounter)
          encounter.totalTime = encounter.end_time - encounter.start_time
          encounter.supportsRoyalRoad = (encounter.date > resources.patches['4.1'].release)
          encounter.cardsAmount = 0
          encounter.soloCards = 0
          encounter.oldRoyalRoad = 'Enhanced Royal Road'
          cb(encounter)
        }
      }
    })
  }

  getPatch(date) {
    let patch = '4.0'
    Object.keys(resources.patches).forEach(patchName => {
      if (date > resources.patches[patchName].release) patch = patchName
    })
    return patch
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
          onResult(result, false)
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

    this.request('tables/buffs/' + encounter.id, options, resultBuffs => {
      if (resultBuffs && !resultBuffs.error) {
        resultBuffs.auras.forEach(a => {
          // Just go off of Meditative Brotherhood, since they were split in fflogs recently.
          if (a.name === 'Meditative Brotherhood') a.name = 'Brotherhood'
        })
        resultBuffs = resultBuffs.auras.filter(a => (buffsToCheck.indexOf(a.guid) != -1 || resources.buffIds[a.name]) &&
          (resources.buffs[encounter.patch][a.name] && a.guid !== resources.buffs[encounter.patch][a.name].excludeId) &&
          a.guid !== 1001185)

        const promises = []
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
              resultDebuffs = resultDebuffs.filter(b => resources.buffs[encounter.patch][b.name].debuff)
            } else if (resultDebuffs && resultDebuffs.error) {
              cb(resultDebuffs.error)
              return
            }
            resultBuffs = resultBuffs.filter(b => resources.buffs[encounter.patch][b.name].buff)
            resultBuffs.forEach(result => {
              const resultDetails = details.find(b => b.abilityId === result.guid)
              if (resultDetails) {
                const bandsMap = {}
                resultDetails.buff.auras.forEach(buffDetail => {
                  if (buffDetail.type !== 'Pet') {
                    buffDetail.bands.forEach(band => {
                      const isCard = resources.buffs[encounter.patch][result.name].isCard
                      let key = getKey(band.startTime, band.endTime)
                      if (isCard) encounter.cardsAmount++
                      if (isCard && band.endTime - band.startTime > 60000) band.isExtendedCard = true
                      const checkBands = (start, end) => {
                        for (var bKey in bandsMap) {
                          const b = bandsMap[bKey]
                          if (start > b.startTime - 4000 && start < b.startTime + 4000) {
                            if (end > b.endTime - 4000 && end < b.endTime + 4000) return getKey(b.startTime, b.endTime)
                            if ((isCard !== -1) && end > b.endTime - 18000 && end < b.endTime + 18000) {
                              band.timeDilatedAOE = b
                              return false
                            }
                          }
                        }
                        return false
                      }
                      if (!bandsMap[key]) {
                        const closeKey = checkBands(band.startTime, band.endTime)
                        if (!closeKey) {
                          band.targets = [buffDetail.name]
                          bandsMap[key] = band
                        } else {
                          bandsMap[closeKey].targets.push(buffDetail.name)
                        }
                      } else {
                        bandsMap[key].targets.push(buffDetail.name)
                      }
                    })
                  }
                })
                result.bands = Object.values(bandsMap)
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
    const royalRoads = []

    buffs.filter(b => b.name === 'Embolden').forEach(b => this.splitEmbolden(buffs, b))
    buffs.forEach(buff => {
      const bonus = resources.buffs[encounter.patch][buff.name].bonus
      if (!resources.buffs[encounter.patch][buff.name].bonus) {
        if (resources.buffs[encounter.patch][buff.name].isRoyalRoad) {
          royalRoads.push(buff)
        }
        return
      }
      buff.entries = {}
      buff.bands.forEach(band => {
        promises.push(new Promise((resolve, reject) => {
          this.damageDone(encounter, {start: band.startTime, end: band.endTime}, damageDone => {
            if (!damageDone || damageDone.error) {
              reject(damageDone)
            } else {
              band.targets = band.targets || []
              const isSolo = (!band.timeDilatedAOE && band.targets.length === 1)
              if (isSolo) encounter.soloCards++
              resolve({buff: buff, targets: band.targets, damageDone: damageDone, start: band.startTime, end: band.endTime, timeDilatedAOE: band.timeDilatedAOE, isExtendedCard: band.isExtendedCard, isSolo: isSolo})
            }
          })
        }))
      })
    })

    function consumeRoyalRoad(value) {
      let found = false
      royalRoads.forEach(rr => {
        if (found) return
        rr.bands.forEach(band => {
          const diff = Math.abs(band.endTime - value.start)
          if (!found && !band.consumed && diff <= 4000) {
            found = true
            band.consumed = true
            value.buff.royalRoad = rr.name
          }
        })
      })
      return found
    }

    Promise.all(promises).then(values => {
      encounter.oldRoyalRoad = ((encounter.soloCards / encounter.cardsAmount) > 0.2) ? 'Enhanced Royal Road' : ''
      values.forEach(value => {
        const simpleDamage = this.damageDoneSimple(value.damageDone)
        simpleDamage.forEach(entry => {
          const type = resources.buffs[encounter.patch][value.buff.name].type
          const affected = resources.buffs[encounter.patch][value.buff.name].affected
          const debuff = resources.buffs[encounter.patch][value.buff.name].debuff
          const isCard = resources.buffs[encounter.patch][value.buff.name].isCard
          let targeted = (value.targets.indexOf(entry.name) !== -1)
          if (!targeted && debuff) targeted = true
          if (targeted && affected && affected.indexOf(entry.type) === -1) targeted = false
          if (targeted) {
            const isSolo = value.isSolo
            if (isCard) consumeRoyalRoad(value)
            const bonus = resources.buffs[encounter.patch][value.buff.name].bonus
            let soloBonus = isCard ? 0.5 : 1
            if (isCard && isSolo) {
              if (!encounter.supportsRoyalRoad) value.buff.royalRoad = encounter.oldRoyalRoad
              soloBonus = value.buff.royalRoad === 'Enhanced Royal Road' ? 1.5 : 1
            }
            const total = ((entry.total * (bonus * soloBonus)) / (1 + (bonus * soloBonus)))
            value.buff.entries[entry.name] = value.buff.entries[entry.name] || {name: entry.name, type: entry.type, total: 0}
            value.buff.entries[entry.name].totalBefore = value.buff.entries[entry.name].totalBefore || 0
            value.buff.entries[entry.name].totalBefore += entry.total
            value.buff.entries[entry.name].total += total
          }
        })
      })

      buffs.forEach(buff => {
        const bonus = resources.buffs[encounter.patch][buff.name].bonus
        if (!bonus) {
          buff.entries = []
          return
        }
        buff.dps = 0
        buff.total = 0
        for (let entryKey in buff.entries) {
          const entry = buff.entries[entryKey]
          entry.dps = entry.totalBefore / encounter.totalTime * 1000
          entry.dpsContribution = entry.total / encounter.totalTime * 1000
          if (entry.type !== resources.buffs[encounter.patch][buff.name].job) {
            buff.dps += entry.dpsContribution
            buff.total += entry.total
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
    if (options.translate === false) delete newOptions.translate // Some things are breaking with translate=true.
    const query = querystring.stringify(newOptions)
    const fullUrl = url + basePath + path + '?' + query
    //console.log('FFLogs request: ',  fullUrl)

    request({url: fullUrl, json: true}, (err, res, body) => {
      if (err) {
        console.log(err)
        cb({error: 'FFLogs Request Error: ' + err})
      } else {
        if (!body) {
          body = {error: 'FFLogs Request Error: Blank response.'}
        } else if (body.error) {
          body.error = 'FFLogs Request Error: ' + body.error
        }
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
    const fullUrl = url + '/v1/parses/character/' + characterName + '/' + worldName + '/' + characterRegion + '?api_key=' + apiKey
    request({url: fullUrl, json: true}, (err, res, body) => {
      if (err || !body || !body.length) {
        cb({error: err})
        console.log(err)
      } else if (body && body.error) {
        if (body.error) body.error = 'FFLogs Request Error: ' + body.error
        console.log(body)
        cb(body)
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
    const fullUrl = url + '/v1/rankings/encounter/' + encounterId + '?metric=speed&api_key=' + apiKey
    request({url: fullUrl, json: true}, (err, res, body) => {
      if (err) {
        cb({error: 'FFLogs Request Error: ' + err})
        return
      } else if (body && body.error) {
        if (body.error) body.error = 'FFLogs Request Error: ' + body.error
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

function getKey(start, end) {
  return (parseInt(start / 1000) + '_' + parseInt(end / 1000))
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
