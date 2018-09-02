$(document).ready(function() {
  $("#encounter-url").keydown(e => {
    if (e.keyCode === 13) {
      if (e.target.value.indexOf('/reports') !== -1) {
        window.location = e.target.value.substring(e.target.value.indexOf('/reports'))
      }
    }
  })
})
