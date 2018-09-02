const containerBody = $('.container-body')
const encounterStages = $('.encounter-stages')
const stageProgress = $('.stage-progress')
const stageProgressBar = $('.stage-progress-bar')
let template = ''

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

    request('/api/encounter-progress/' + window.token, onProgress)
  } else {
    containerBody.html(Mustache.render(template, body))
    window.activateTooltips()
  }
}

request('/views/encounters.html', (err, res, body) => {
  template = body
  request('/api/encounter-progress/' + window.token, onProgress)
})
