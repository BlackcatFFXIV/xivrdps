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
          encounter.targetBlacklist = resources.targetBlacklist[encounter.boss] || []
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
        newBuffs[name].bands.push({startTime: start, endTime: end, source: band.source, targets: band.targets})
        start = end + 1
        end = start + 4000
        if (end > band.endTime) end = band.endTime
      }
    })
    buffs.splice(buffs.indexOf(buff), 1)
    Object.values(newBuffs).forEach(b => buffs.push(b))
  }

  damageFromBuffs(encounter, buffs, options, cb, onProgress) {
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
        if (!resources.buffs[encounter.patch][buff.name].bonus && !resources.buffs[encounter.patch][buff.name].haste) {
          if (resources.buffs[encounter.patch][buff.name].isRoyalRoad) {
            royalRoads.push(buff)
          }
          return
        }
        buff.entries = {}
        buff.bands.forEach(band => {
          promises.push(new Promise((resolve, reject) => {
            this.damageDoneFromEvents(encounter, events, band.startTime, band.endTime, buff, band, damageDone => {
              if (!damageDone || damageDone.error) {
                reject(damageDone)
              } else {
                band.targets = band.targets || []
                const isSolo = (!band.timeDilatedAOE && band.targets.length === 1)
                if (isSolo) encounter.soloCards++
                resolve({buff: buff, source: band.source, targets: band.targets, damageDone: damageDone, start: band.startTime,
                  end: band.endTime || options.end, timeDilatedAOE: band.timeDilatedAOE, isExtendedCard: band.isExtendedCard, isSolo: isSolo})
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
        const buffFullDetail = {}
        encounter.oldRoyalRoad = ((encounter.soloCards / encounter.cardsAmount) > 0.2) ? 'Enhanced Royal Road' : ''
        values.forEach(value => {
          let band = null
          buffFullDetail[value.buff.name] = buffFullDetail[value.buff.name] ||
            {name: value.buff.name, abilityIcon: value.buff.abilityIcon, guid: value.buff.guid, sources: {}, type: value.buff.type}
          buffFullDetail[value.buff.name].sources[value.source] = buffFullDetail[value.buff.name].sources[value.source] || {source: value.source, bands: []}
          band = {start: value.start, end: value.end, entries: []}
          if (value.buff.type === 'debuff') band.enemyTarget = value.targets[0]
          buffFullDetail[value.buff.name].sources[value.source].bands.push(band)

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
              let total = 0
              if (type !== 'haste') {
                const isSolo = value.isSolo
                if (isCard) consumeRoyalRoad(value)
                let bonus = resources.buffs[encounter.patch][value.buff.name].bonus
                let soloBonus = isCard ? 0.5 : 1
                if (isCard && isSolo) {
                  if (!encounter.supportsRoyalRoad) value.buff.royalRoad = encounter.oldRoyalRoad
                  soloBonus = value.buff.royalRoad === 'Enhanced Royal Road' ? 1.5 : 1
                }
                total = ((entry.total * (bonus * soloBonus)) / (1 + (bonus * soloBonus)))
              } else {
                total = entry.damageFromBuff || 0
              }
              value.buff.entries[value.source] = value.buff.entries[value.source] || {source: value.source, entries: {}}
              const source = value.buff.entries[value.source]
              source.entries[entry.name] = source.entries[entry.name] || {name: entry.name, type: entry.type, total: 0, id: entry.id}
              source.entries[entry.name].totalBefore = source.entries[entry.name].totalBefore || 0
              source.entries[entry.name].totalBefore += entry.total
              source.entries[entry.name].total += total
              band.entries.push({name: entry.name, id: entry.id, type: entry.type, total: total, totalBefore: entry.total})
              if (entry.type === 'Pet') {
                source.entries[entry.name].petOwnerId = entry.petOwnerId
                source.entries[entry.name].petOwnerName = entry.petOwnerName
                band.entries[band.entries.length - 1].petOwnerId = entry.petOwnerId
                band.entries[band.entries.length - 1].petOwnerName = entry.petOwnerName
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
          for (let sourceId in buff.entries) {
            const source = buff.entries[sourceId]
            source.dps = 0
            source.total = 0
            for (let entryKey in source.entries) {
              const entry = source.entries[entryKey]
              entry.dps = entry.totalBefore / encounter.totalTime * 1000
              entry.dpsContribution = entry.total / encounter.totalTime * 1000
              if (entry.id.toString() !== sourceId.toString()) {
                source.dps += entry.dpsContribution
                source.total += entry.total
              }
            }
            buff.entries[sourceId].entries = Object.values(buff.entries[sourceId].entries)
          }
          buff.entries = Object.values(buff.entries)
        })

        cb(buffs, buffFullDetail)
      }).catch(e => {
        console.log('Rejection: ', e)
      })
    }, onProgress)
  }

  damageContributionSimple(buffs) {
    return buffs.map(buff => {
      return {
        name: buff.name,
        icon: buff.abilityIcon,
        entries: buff.entries || {}
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
      if (entry.damageFromBuff) {
        newEntry.damageFromBuff = entry.damageFromBuff
      }
      if (newEntry.type === 'Pet') {
        newEntry.petOwnerId = entry.petOwnerId,
        newEntry.petOwnerName = entry.petOwnerName
      }
      return newEntry
    })
  }

  damageEvents(encounter, options, cb, onProgress) {
    let events = []
    let init = false
    options = Object.assign({}, options, {
      start: options.start || encounter.start_time,
      end: options.end || encounter.end_time,
      translate: true,
      filter: 'target.disposition = "enemy" AND inCategory("damage") = "true"'
    })
    const originalStart = options.start

    const onResult = result => {
      if (init) onProgress({start: originalStart, progress: options.start, end: options.end})
      init = true
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
          this.findAverageGCDs(encounter, events)
          cb(events)
        }
      }
    }

    this.damageDoneRequestCount++
    this.request('events/' + encounter.id, options, onResult)
  }

  damageDoneFromEvents(encounter, events, start, end, buff, band, cb) {
    const entries = []
    let bonus = resources.buffs[encounter.patch][buff.name].bonus
    const type = resources.buffs[encounter.patch][buff.name].type
    const isSolo = (!band.timeDilatedAOE && band.targets.length === 1 && buff.type !== 'debuff')
    const isCard = resources.buffs[encounter.patch][buff.name].isCard
    let soloBonus = isCard ? 0.5 : 1
    let haste = 0
    if (type === 'haste') {
      if (isCard && isSolo) {
        if (!encounter.supportsRoyalRoad) buff.royalRoad = encounter.oldRoyalRoad
        soloBonus = buff.royalRoad === 'Enhanced Royal Road' ? 1.5 : 1
      }
      haste = resources.buffs[encounter.patch][buff.name].haste * soloBonus
    }
    events = events.filter(e => e.timestamp >= start && e.timestamp <= end)
    events.forEach(e => {
      if (buff.type === 'debuff') {
        const target = band.targets[0]
        if (target !== e.targetID) return
        const enemy = encounter.enemies.find(en => en.id === target)
        if (enemy && encounter.targetBlacklist.indexOf(enemy.name) !== -1) return
      }
      const playerOrPet = this.getPlayer(encounter, e.sourceID) || encounter.friendlyPets.find(f => f.id === e.sourceID)
      if (!playerOrPet || playerOrPet.name === 'Multiple Players') return
      let entry = entries.find(entry => entry.id === playerOrPet.id)
      if (!entry) {
        entry = {
          name: playerOrPet.name,
          id: playerOrPet.id,
          type: playerOrPet.type,
          guid: playerOrPet.guid,
          total: e.amount,
          gcdDamage: 0,
          gcdCount: 0
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
      if (haste && this.isGCDDamage(e)) {
        entry.gcdCount++
        entry.gcdDamage += e.amount
      }
    })
    entries.forEach(entry => {
      if (haste && entry.gcdCount && entry.type !== 'Pet' && entry.type !== 'LimitBreak') {
        const player = this.getPlayer(encounter, entry.id)
        const gcdDamageAverage = entry.gcdDamage / entry.gcdCount
        const duration = end - start
        const gcdsGained = ((1 / (1 - haste)) - 1) * duration / player.averageGCD
        entry.damageFromBuff = gcdDamageAverage * gcdsGained
      }
      delete entry.gcdDamage
      delete entry.gcdCount
      entry.personalDPS = entry.total / encounter.totalTime * 1000
    })
    cb({entries: entries})
  }

  findAverageGCDs(encounter, events) {
    const timestamps = {}
    const minGCD = 1500
    const maxGCD = 4500
    events.forEach(e => {
      if (this.isGCDDamage(e)) {
        const interval = timestamps[e.sourceID] && timestamps[e.sourceID].length ?
          (e.timestamp - timestamps[e.sourceID][timestamps[e.sourceID].length - 1].timestamp) :
          0
        timestamps[e.sourceID] = timestamps[e.sourceID] || []
        timestamps[e.sourceID].push({timestamp: e.timestamp, interval: interval})
      }
    })
    Object.keys(timestamps).forEach(source => {
      const player = this.getPlayer(encounter, parseInt(source))
      if (!player || player.type === 'LimitBreak') return
      let intervalSum = 0
      timestamps[source] = timestamps[source].filter(timestamp => {
        return (timestamp.interval >= minGCD && timestamp.interval <= maxGCD)
      })
      timestamps[source].forEach(timestamp => {
        intervalSum += timestamp.interval
      })
      player.averageGCD = intervalSum / timestamps[source].length
    })
  }

  isGCDDamage(e) {
    return (!e.tick && resources.ogcdAbilities.indexOf(e.ability.guid) === -1 &&
      e.ability.name !== 'Attack' && e.ability.name !== 'Shot')
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
          abilityIcon: buffEvent.ability.abilityIcon,
          type: buffEvent.type.replace(/remove|apply/g, '')
        }
        let range = {
          source: buffEvent.sourceID,
          target: buffEvent.targetID
        }
        if (buff.type === 'debuff') {
          const enemy = encounter.enemies.find(e => e.id === range.target)
          if (enemy && encounter.targetBlacklist.indexOf(enemy.name) !== -1) return
        }
        const sourcePet = encounter.friendlyPets.find(f => f.id === range.source)
        if (sourcePet) range.source = sourcePet.petOwner
        if (buff.name === 'Physical Vulnerability Up') {
          const buffMeta = resources.buffs[encounter.patch][buff.name]
          const firstOfJob = encounter.friendlies.find(entry => (entry.type === buffMeta.job)) // Don't know which player this came from, assume it's the first of the job, won't work for multiples
          range.source = firstOfJob.id
        }
        // Ignore non-players/pets for buffs, but allow pets to get debuffs
        if (buffEvent.type !== 'applydebuff' && buffEvent.type !== 'removedebuff') {
          if (!encounter.friendlies.find(f => f.id === range.target)) {
            const pet = encounter.friendlyPets.find(f => f.id === range.target)
            if (!pet || pet.name === 'Selene' || pet.name === 'Eos') return
          }
        }
        this.buffNameTransform(buff)
        buffMap[buff.name] = buff = (buffMap[buff.name] || buff)
        buff.bands = buff.bands || []
        if (range.source === undefined || range.target === undefined) return
        if (buffEvent.type === 'applybuff' || buffEvent.type === 'applydebuff') {
          let buffsToTarget = buff.bands
            .filter(r => (r.target === range.target) && !r.endTime)
          let oldRange = buffsToTarget[buffsToTarget.length - 1]
          // As long as this isn't an overridden buff, add a new buff range.
          if (!oldRange) {
            range.startTime = buffEvent.timestamp
            buff.bands.push(range)
          }
        } else if (buffEvent.type === 'removebuff' || buffEvent.type === 'removedebuff') {
          let buffsToTarget = buff.bands
            .filter(r => r && (r.target === range.target) && !r.endTime)
          const existingRange = buffsToTarget[buffsToTarget.length - 1]
          if (existingRange) {
            existingRange.endTime = buffEvent.timestamp
          } else if (buff.bands.filter(r => r && (r.target === range.target)).length === 0) {
            range.startTime = encounter.start_time
            range.endTime = buffEvent.timestamp
            buff.bands.push(range)
          }
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
        if (band.startTime === undefined && band.endTime === undefined) return
        if (band.endTime === undefined) band.endTime = encounter.end_time
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
        let encounters = {}
        body.forEach(encounter => {
          const spec = encounter.spec
          encounters[encounter.encounterName] = encounters[encounter.encounterName] || {name: encounter.encounterName, id: encounter.encounterId, specs: {}}
          encounters[encounter.encounterName].specs[spec] = encounters[encounter.encounterName].specs[spec] || {spec: spec, icon: spec.replace(' ', ''), data: []}
          encounters[encounter.encounterName].specs[spec].data.push({
            durationStr: timeStr(intervalObj(encounter.duration)),
            startTime: new Date(encounter.startTime).toLocaleTimeString('en-us', dateOptions),
            reportId: encounter.reportID,
            fightId: encounter.fightID,
            total: encounter.total,
            patch: encounter.ilvlKeyOrPatch
          })
        })
        encounters = Object.values(encounters)
        encounters.forEach(encounter => {
          encounter.specs = Object.values(encounter.specs)
        })
        cb(encounters)
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
