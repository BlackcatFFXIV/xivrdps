const resources = require('./fflogs-resources')
const changeLog = require('./change-log')
const Result = require('./models/result')
const RaidDPSPipeline = require('./raid-dps-pipeline')
const debug = true
const dateOptions = {year: "numeric", month: "long", day: "numeric"}
const pipelines = {}

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

      'reports/:id': (req, res) => {
        res.render('redirect-fflogs-like-url', {})
      },

      'encounters/:id/:fightId?': (req, res) => {
        const pipeline = new RaidDPSPipeline(
          this.fflogs,
          req,
          res,
          progress => {},
          results => {},
          error => {
            res.render('errors', error)
            delete pipelines[pipeline.token]
          }
        )
        pipelines[pipeline.token] = pipeline

        const getEncounterFromDB = () => {
          try {
            const getEncounter = (err, data) => {
              if (!err && data && data.damageDone && data.damageDone.length) {
                res.render('encounters', pipeline.playersView(data))
              } else {
                pipeline.start()
                res.render('loadingencounter', {token: pipeline.token})
              }
            }

            if (!debug) {
              if (pipeline.fightId > -1) {
                Result.findOne({id: pipeline.encounterId, fightId: pipeline.fightId}).exec(getEncounter)
              } else {
                Result.findLatest(pipeline.encounterId, getEncounter)
              }
            } else {
              pipeline.start()
              res.render('loadingencounter', {token: pipeline.token})
            }
          } catch (e) {
            pipeline.start()
            res.render('loadingencounter', {token: pipeline.token})
          }
        }
        getEncounterFromDB()
      },

      'api/encounter-progress/:token': (req, res) => {
        const pipeline = pipelines[req.params.token]
        let sent = false
        if (!pipeline) {
          res.json({error: 'Unloaded encounter.'})
          return
        }
        if (pipeline.currentStage === 'Done') {
          res.json(pipeline.results)
          delete pipelines[pipeline.token]
        } else {
          pipeline.onProgress = progress => {
            if (!sent) {
              res.json({
                type: 'progress',
                stage: pipeline.currentStage,
                nextStage: pipeline.stageList[pipeline.stageNumber + 1],
                completedStages: pipeline.completedStages,
                progressInfo: pipeline.progressInfo || {}
              })
              sent = true
            }
          }
          pipeline.onError = error => {
            if (!sent) res.json(error)
            delete pipelines[pipeline.token]
            sent = true
          }
          pipeline.onSuccess = results => {
            pipeline.results = results
            if (!sent) {
              res.json(results)
              delete pipelines[pipeline.token]
              sent = true
            }
            if (!debug) {
              const encounterResultModel = new Result(results)
              encounterResultModel.save()
            }
          }
        }
      },

      'api/encounters/:id/:fightId?': (req, res) => {
        const showProgress = (req.query.showProgress === '' || req.query.showProgress === true)
        const pipeline = new RaidDPSPipeline(
          this.fflogs,
          req,
          res,
          progress => {},
          results => {
            if (!showProgress) res.json(results)
          },
          error => {
            res.json(error)
            delete pipelines[pipeline.token]
          }
        )
        if (showProgress) {
          pipelines[pipeline.token] = pipeline
          res.json({token: pipeline.token})
        }
        pipeline.start()
      },

      '*': (req, res) => {
        res.redirect('/')
      }
    }

    for (let view in this.views) {
      app.get(view === '/' || view === '*' ? view : '/' + view, this.views[view])
    }
  }
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
