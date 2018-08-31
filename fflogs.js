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
    this.requestCount = 0
    this.damageDoneRequestCount = 0
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
          encounter.friendlies = result.friendlies
          encounter.friendlyPets = result.friendlyPets
          encounter.enemies = result.enemies
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
      this.damageDoneRequestCount++
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
    this.damageEvents(encounter, {}, events => {
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
            this.damageDoneFromEvents(encounter, events, band.startTime, band.endTime, damageDone => {
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
            let targeted = (value.targets.indexOf(entry.id) !== -1)
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
              value.buff.entries[entry.name] = value.buff.entries[entry.name] || {name: entry.name, type: entry.type, total: 0, id: entry.id}
              value.buff.entries[entry.name].totalBefore = value.buff.entries[entry.name].totalBefore || 0
              value.buff.entries[entry.name].totalBefore += entry.total
              value.buff.entries[entry.name].total += total
              if (entry.type === 'Pet') {
                value.buff.entries[entry.name].petOwnerId = entry.petOwnerId
                value.buff.entries[entry.name].petOwnerName = entry.petOwnerName
              }
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
      const newEntry = {
        name: entry.name,
        id: entry.id,
        type: entry.type,
        total: entry.total,
        personalDPS: entry.personalDPS.toFixed(1),
        personalDPSFull: entry.personalDPS
      }
      if (newEntry.type === 'Pet') {
        newEntry.petOwnerId = entry.petOwnerId,
        newEntry.petOwnerName = entry.petOwnerName
      }
      return newEntry
    })
  }

  damageEvents(encounter, options, cb) {
    let events = []
    options = Object.assign({}, options, {
      start: options.start || encounter.start_time,
      end: options.end || encounter.end_time,
      translate: true,
      filter: 'target.disposition = "enemy" AND inCategory("damage") = "true"'
    })

    const onResult = result => {
      if (!result || !result.events || result.error) {
        if (result && !result.events && !result.error) result.error = 'No entries found.'
        cb(result)
      } else {
        events = events.concat(result.events)
        if (result.nextPageTimestamp) {
          options.start = result.nextPageTimestamp
          this.damageDoneRequestCount++
          this.request('events/' + encounter.id, options, onResult)
        } else {
          cb(events)
        }
      }
    }

    this.damageDoneRequestCount++
    this.request('events/' + encounter.id, options, onResult)
  }

  damageDoneFromEvents(encounter, events, start, end, cb) {
    const entries = []
    events = events.filter(e => e.timestamp >= start && e.timestamp <= end)
    events.forEach(e => {
      const playerOrPet = this.getPlayer(encounter, e.sourceID) || encounter.friendlyPets.find(f => f.id === e.sourceID)
      if (!playerOrPet || playerOrPet.name === 'Multiple Players') return
      let entry = entries.find(entry => entry.id === playerOrPet.id)
      if (!entry) {
        entry = {
          name: playerOrPet.name,
          id: playerOrPet.id,
          type: playerOrPet.type,
          guid: playerOrPet.guid,
          total: e.amount
        }
        if (entry.type === 'Pet') {
          const petOwner = this.getPlayer(encounter, playerOrPet.petOwner)
          entry.petOwnerId = petOwner.id
          entry.petOwnerName = petOwner.name
        }
        entries.push(entry)
      } else {
        entry.total += e.amount
      }
    })
    entries.forEach(entry => {
      entry.personalDPS = entry.total / encounter.totalTime * 1000
    })
    cb({entries: entries})
  }

  buffEvents(encounter, options, cb) {
    let events = []
    options = Object.assign({}, options, {
      start: options.start || encounter.start_time,
      end: options.end || encounter.end_time,
      translate: true,
      filter: 'type in ("applydebuff", "removedebuff",' +
        '"applybuff", "removebuff") and ability.id in (' +
         Object.values(resources.buffIds).join(', ') + ')'
    })

    const onResult = result => {
      if (!result || !result.events || result.error) {
        if (result && !result.events && !result.error) result.error = 'No entries found.'
        cb(result)
      } else {
        events = events.concat(result.events)
        if (result.nextPageTimestamp) {
          options.start = result.nextPageTimestamp
          this.request('events/' + encounter.id, options, onResult)
        } else {
          cb(events)
        }
      }
    }

    this.request('events/' + encounter.id, options, onResult)
  }

  buffNameTransform(buff) {
    if (buff.guid === resources.buffIds['Trick Attack']) {
      buff.originalName = buff.name
      buff.name = 'Trick Attack'
    }
    if (buff.guid === resources.buffIds['Hypercharge']) {
      buff.originalName = buff.name
      buff.name = 'Hypercharge'
    }
    if (buff.name === 'Meditative Brotherhood') buff.name = 'Brotherhood'
  }

  getPlayer(encounter, id) {
    return encounter.friendlies.find(f => f.id === id)
  }

  buffTimeline(encounter, options, cb) {
    const buffMap = {}
    this.buffEvents(encounter, options, buffEvents => {
      buffEvents.forEach(buffEvent => {
        let buff = {
          name: buffEvent.ability.name,
          guid: buffEvent.ability.guid,
          abilityIcon: buffEvent.ability.abilityIcon
        }
        let range = {
          source: buffEvent.sourceID,
          target: buffEvent.targetInstance || buffEvent.targetID
        }
        // Ignore non-players/pets for buffs, but allow pets to get debuffs
        if (!encounter.friendlies.find(f => f.id === range.target)) {
          const pet = encounter.friendlyPets.find(f => f.id === range.target)
          if (!pet || pet.name === 'Selene' || pet.name === 'Eos' ||
            (buffEvent.type !== 'applydebuff' && buffEvent.type !== 'removedebuff')) return
        }
        this.buffNameTransform(buff)
        buffMap[buff.name] = buff = (buffMap[buff.name] || buff)
        buff.bands = buff.bands || []
        if (buffEvent.type === 'applybuff' || buffEvent.type === 'applydebuff') {
          let buffsToTarget = buff.bands
            .filter(r => (r.target === range.target) && !r.endTime)
          let oldRange = buffsToTarget[buffsToTarget.length - 1]
          if (oldRange) oldRange.endTime = buffEvent.timestamp // overridden buff
          range.startTime = buffEvent.timestamp
          buff.bands.push(range)
        } else if (buffEvent.type === 'removebuff' || buffEvent.type === 'removedebuff') {
          let buffsToTarget = buff.bands
            .filter(r => (r.target === range.target) && !r.endTime)
          range = buffsToTarget[buffsToTarget.length - 1]
          if (range) range.endTime = buffEvent.timestamp
        }
      })
      this.consolidateTargetsOfBuffs(encounter, buffMap)
      cb(Object.values(buffMap))
    })
  }

  consolidateTargetsOfBuffs(encounter, buffMap) {
    Object.values(buffMap).forEach(buff => {
      const bandsMap = {}
      const isCard = resources.buffs[encounter.patch][buff.name].isCard
      buff.bands.forEach(band => {
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
            band.targets = [band.target]
            bandsMap[key] = band
          } else {
            bandsMap[closeKey].targets.push(band.target)
            delete bandsMap[closeKey].isExtendedCard
          }
        } else {
          bandsMap[key].targets.push(band.target)
          delete bandsMap[key].isExtendedCard
        }
        delete band.target
      })
      buff.bands = Object.values(bandsMap)
    })
  }

  request(path, options, cb) {
    const newOptions = Object.assign({}, options, this.defaultOptions)
    if (options.translate === false) delete newOptions.translate // Some things are breaking with translate=true.
    const query = querystring.stringify(newOptions)
    const fullUrl = url + basePath + path + '?' + query
    //console.log('FFLogs request: ',  fullUrl)
    this.requestCount++
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
