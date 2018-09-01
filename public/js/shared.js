$(document).ready(function() {
  window.activateTooltips = function() {
    $('.tooltip-holder').tooltip({
      placement: (tip, element) => {
          var position = $(element).position()
          if (position.top < 300)
            return 'bottom'
          return 'top'
      }
    })
  }

  window.activateTooltips()

  window.selectLocation = function() {
    window.location = '/listing/' + $('#encounter-list').val()
  }

  window.encounterLocation = function() {
    window.location = '/encounters/' + $('#encounter-id').val() + '/' + $('#fight-id').val()
  }

  window.characterLocation = function() {
    window.location = '/characters/' + $('#character-name').val().split(' ').join('-') + '-' + $('#world-list').val()
  }

  $('.link-row').click( function() {
      window.location = $(this).find('a').attr('href');
  })
})
