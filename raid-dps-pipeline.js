const resources = require('./fflogs-resources')
const uuid = require('uuid/v4')

class RaidDPSPipeline {
  constructor(fflogs, req, res, onProgress, onSuccess, onError) {
    const timestamp = new Date()
    this.fflogs = fflogs
    this.req = req
    this.res = res
    this.onProgress = onProgress
    this.onSuccess = onSuccess
    this.onError = onError
    this.token = uuid()
    const fightId = this.req.params.fightId || -1
    this.encounterId = this.req.params.id
    this.fightId = (fightId !== undefined ? parseFloat(fightId) : -1)
    this.currentStage = 'Starting'
    this.completedStages = []
    this.fflogs.requestCount = 0
    this.fflogs.damageDoneRequestCount = 0
    this.stageNumber = -1
    this.stageInfo = {Starting: {timestamp: new Date()}}
    this.stageList = Object.keys(RaidDPSPipeline.prototype.stages)
  }

  start() {
    this.callNextStage()
  }

  callNextStage(results) {
    try {
      this.completedStages.push(this.currentStage)
      this.progressInfo = {}
      this.onProgress(this)
      const oldInfo = this.stageInfo[this.currentStage]
      const oldStage = this.currentStage
      this.stageNumber++
      this.currentStage = this.stageList[this.stageNumber]
      const info = {timestamp: new Date()}
      this.stageInfo[this.currentStage] = info
      if (oldStage === 'Starting')
        console.log('pipeline => Starting')
      else
        console.log(`pipeline => ${oldStage}`, getDiffInSeconds(info.timestamp, oldInfo.timestamp))
      this.stages[this.currentStage].call(this, results)
    } catch(e) {
      const startInfo = this.stageInfo.Starting
      const info = this.stageInfo[this.currentStage]
      console.log('Total time spent:', getDiffInSeconds(info.timestamp, startInfo.timestamp))
      this.onError(e.error || {error: 'Error occured during ' + this.stageList[this.stageNumber]})
      console.error('Error detail: ', e)
    }
  }
}

RaidDPSPipeline.prototype.stages = {
  'Encounter': function() {
    this.fflogs.encounter(this.encounterId, this.fightId, {}, encounter => {
      if (!encounter || encounter.error) throw encounter
      this.callNextStage({encounter: encounter})
    })
  },

  'Damage Done': function(results) {
    this.fflogs.damageDone(results.encounter, {}, damageDone => {
      if (!damageDone || damageDone.error) throw damageDone
      results.damageDone = damageDone
      this.callNextStage(results)
    })
  },

  'Buff Timeline': function(results) {
    this.fflogs.buffTimeline(results.encounter, {}, buffs => {
      if (!buffs || buffs.error) throw buffs
      results.buffs = buffs
      this.callNextStage(results)
    })
  },

  'DoT Applications': function(results) {
    this.fflogs.dotEvents(results.encounter, {}, dotEvents => {
      if (!dotEvents || dotEvents.error) throw dotEvents
      results.dotApplications = this.fflogs.dotApplications(results.encounter, dotEvents)
      this.callNextStage(results)
    })
  },

  'Damage Contribution': function(results) {
    this.fflogs.damageFromBuffs(results.encounter, results.buffs, {}, (contribution, damageFromBuffs) => {
      if (!contribution || contribution.error) throw contribution
      this.callNextStage({
        id: results.encounter.id,
        fightId: results.encounter.fightId,
        encounter: results.encounter,
        damageDone: this.fflogs.damageDoneSimple(results.damageDone),
        contribution: this.fflogs.damageContributionSimple(contribution),
        damageFromBuffs: this.damageFromBuffs(damageFromBuffs),
        buffsBySource: this.buffsBySource(damageFromBuffs, results.encounter)
      })
    }, progressInfo => {
      this.progressInfo = progressInfo
      this.onProgress(this)
    })
  },

  'Done': function(result) {
    const startInfo = this.stageInfo.Starting
    const info = this.stageInfo.Done
    console.log('Requests:', this.fflogs.requestCount)
    console.log('Damage Requests:', this.fflogs.damageDoneRequestCount)
    console.log('pipeline => Done', getDiffInSeconds(info.timestamp, startInfo.timestamp))
    this.onSuccess(this.playersView(result))
  }
}

RaidDPSPipeline.prototype.buffsBySource = function(data, encounter) {
  const damageFromBuffs = Object.values(data)
  const sources = {}
  const encounterDuration = encounter.end_time - encounter.start_time
  damageFromBuffs.forEach(buff => {
    buff.sources.forEach(source => {
      const playerName = this.fflogs.getPlayer(encounter, source.source).name
      sources[playerName] = sources[playerName] || {playerName: playerName, playerId: source.source, buffs: []}
      sources[playerName].buffs.push({buffIcon: buff.abilityIcon, buffId: buff.guid, buffName: buff.name, playerId: source.source})
      source.bands = source.bands.filter(band => band.entries.length && band.end - band.start >= 4000)
      source.bands.forEach(band => {
        band.entries = band.entries.filter(entry => entry.type !== 'LimitBreak' && entry.id !== source.source && entry.total > 0)
        band.entries.forEach(entry => {
          entry.buffDPS = parseFloat((entry.total / encounterDuration * 1000).toFixed(2))
          entry.totalDPS = parseFloat((entry.totalBefore / encounterDuration * 1000).toFixed(2))
          entry.totalStr = parseFloat(entry.total.toFixed(2))
        })
      })
      source.bands = source.bands.filter(b => b.entries.length > 0)
    })
  })
  return Object.values(sources)
}

RaidDPSPipeline.prototype.damageFromBuffs = function(data) {
  const damageFromBuffs = Object.values(data)
  damageFromBuffs.forEach(buff => {
    buff.sources = Object.values(buff.sources)
  })
  return damageFromBuffs
}

RaidDPSPipeline.prototype.playersView = function(data) {
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

  data.contribution.forEach(buff => {
    buff.entries.forEach(source => {
      source.entries.forEach(entry => {
        if (entry.type === 'Pet') {
          const ownerEntry = source.entries.find(e => e.id === entry.petOwnerId)
          if (ownerEntry) {
            ownerEntry.total += entry.total
            ownerEntry.totalBefore += entry.totalBefore
            ownerEntry.dps += entry.dps
            ownerEntry.dpsContribution += entry.dpsContribution
          }
        }
      })
      source.entries = source.entries.filter(e => e.type !== 'Pet')
    })
  })

  data.damageDone.forEach(entry => {
    if (entry.type === 'LimitBreak') {
      entry.raidDPSFull = entry.personalDPSFull
      entry.raidDPS = entry.personalDPS
    } else {
      entry.contributionDPS = 0
      entry.contributions = []
      let dpsPenalty = 0
      const jobAmount = data.jobAmount[entry.type] || 1
      entry.fromOtherBuffs = []
      data.contribution.forEach(buff => {
        buff.entries.forEach(source => {
          if (source.source === entry.id) return
          const buffEntry = source.entries.find(e => e.id === entry.id)
          if (buffEntry) {
            const dpsContribution = (buffEntry.dpsContribution || 0)
            dpsPenalty += dpsContribution
            entry.fromOtherBuffs.push({buff: buff, dps: dpsContribution.toFixed(1) })
          }
        })
      })
      data.contribution.forEach(buff => {
        const source = buff.entries.find(e => e.source === entry.id)
        if (!source) return
        const disclaimer = resources.disclaimers[resources.buffs[encounter.patch][buff.name].type] || ''
        let dps = source.dps
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

RaidDPSPipeline.prototype.specialBuffs = function(data) {
  const encounter = data.encounter
  data.damageDone.forEach(entry => {
    if (isSpecial(entry)) {
      const buff = resources.buffs[encounter.patch][entry.name]
      const players = data.damageDone.filter(isPlayer)
      const otherJobs = players.filter(entry => (entry.type !== buff.job))
      const firstOfJob = players.find(entry => (entry.type === buff.job)) // Don't know which player this came from, assume it's the first of the job, won't work for multiples
      const contribution = {name: entry.name, icon: buff.icon ? buff.icon + '.png' : '', entries: []}
      const splitDPS = otherJobs.length ? entry.personalDPSFull / otherJobs.length : 0
      const source = {source: firstOfJob.id, entries: [], dps: entry.personalDPSFull, total: entry.total}
      contribution.entries.push(source)
      otherJobs.forEach(jobEntry => {
        source.entries.push({name: jobEntry.name, type: jobEntry.type, dpsContribution: splitDPS, dps: 0, total: 0})
      })
      data.contribution.push(contribution)
    }
  })
  data.damageDone = data.damageDone.filter(entry => (resources.specialBuffs.indexOf(entry.name) === -1))
}

function isPlayer(entry) {
  return (entry.type !== 'LimitBreak' && !isSpecial(entry))
}

function isSpecial(entry) {
  return (resources.specialBuffs.indexOf(entry.name) !== -1)
}

function getDiffInSeconds(current, past) {
  return ((current - past) / 1000).toFixed(2) + 's'
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

module.exports = RaidDPSPipeline
