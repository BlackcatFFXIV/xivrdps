const containerBody = document.body.getElementsByClassName('container-body')[0]
const encounterStages = document.body.getElementsByClassName('encounter-stages')[0]
let template = ''

function onProgress(err, res, body) {
  body = JSON.parse(body)
  if (body.type === 'progress') {
    encounterStages.innerHTML = body.completedStages.map(stage => {
      return '<div class="encounter-stage">&#9658;&nbsp;&nbsp;&nbsp;' + stage + '</div>'
    }).join('\n') + '<div class="encounter-stage">&nbsp;&nbsp;&nbsp;' + body.nextStage + '</div>'
    request('/api/encounter-progress/' + window.token, onProgress)
  } else {
    containerBody.innerHTML = Mustache.render(template, body)
    window.activateTooltips()
  }
}

request('/views/encounters.html', (err, res, body) => {
  template = body
  request('/api/encounter-progress/' + window.token, onProgress)
})
