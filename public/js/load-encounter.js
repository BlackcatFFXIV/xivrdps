function loadEncounter(token, templateNames) {
  const containerBody = $('.container-body')
  const encounterStages = $('.encounter-stages')
  const stageProgress = $('.stage-progress')
  const stageProgressBar = $('.stage-progress-bar')
  const detailsBodyContainer = $('#details-body-container')
  let templates = {}
  function onProgress(err, res, body) {
    body = JSON.parse(body)
    if (body.type === 'progress') {
      const next = body.progressInfo.progress ? body.stage : body.nextStage
      encounterStages.html(body.completedStages.map(stage => {
        return '<div class="encounter-stage">&#9658;&nbsp;&nbsp;&nbsp;' + stage + '</div>'
      }).join('\n') + '<div class="encounter-stage">&nbsp;&nbsp;&nbsp;' + next + '</div>')

      stageProgress.toggle(!!body.progressInfo.progress)
      if (body.progressInfo.progress) {
        const progressPercentage = ((body.progressInfo.progress - body.progressInfo.start) /
          (body.progressInfo.end - body.progressInfo.start)) * 100
        stageProgressBar.css({width: progressPercentage + '%'})
      }

      request('/api/encounter-progress/' + token, onProgress)
    } else {
      if (!window.isCachedEncounter) {
        containerBody.html(Mustache.render(templates['encounters'], body, {'details-panel': templates['details-panel']}))
      } else {
        detailsBodyContainer.html(Mustache.render(templates['details-panel'], body))
      }
      $('#buffs-list').change(function() {
        const values = this.value.split('_')
        const buffId = values[0]
        const playerId = values[1]
        const buff = body.damageFromBuffs.find(b => b.guid.toString() === buffId)
        const source = buff.sources.find(source => source.source.toString() === playerId)
        const view = {bands: source.bands}
        view.bands.forEach(band => {
          band.startStr = timeStr(intervalObj(band.start - body.encounter.start_time))
          band.endStr = timeStr(intervalObj(band.end - body.encounter.start_time))
        })
        $('.details-body').html(Mustache.render(templates['details'], view))
      })
      if (!window.isCachedEncounter) {
        window.activateTooltips()
      } else {
        $('#details-panel').collapse('show')
      }
    }
  }

  function requestTemplates(templateNames, cb) {
    let loaded = 0
    templateNames.forEach(templateName => {
      request('/views/' + templateName + '.html', (err, res, body) => {
        templates[templateName] = body
        loaded++
        if (loaded === templateNames.length) cb(templates)
      })
    })
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

  requestTemplates(templateNames, templates => {
    request('/api/encounter-progress/' + token, onProgress)
  })
}

(function() {
  if (!window.isCachedEncounter) {
    window.loadEncounter(window.token, ['encounters', 'details-panel', 'details'])
  } else {
    const detailsButton = $('#details-button')
    const detailsBodyContainer = $('#details-body-container')
    let initializedLoading = false
    detailsButton.click(e => {
      if (initializedLoading) return
      initializedLoading = true
      request('/api/encounters/' + window.encounterId + '/' +
          window.fightId + '?showProgress', (err, res, body) => {
        if (err) {
          console.error(err)
          return
        }
        body = JSON.parse(body)
        const token = body.token
        request('/views/loading-encounter.html', (err, res, loadingTemplate) => {
          const detailsBodyContainer = $('#details-body-container')
          detailsBodyContainer.html(Mustache.render(loadingTemplate, {}))
          window.loadEncounter(token, ['details-panel', 'details'])
        })
      })
    })
  }
})()
