const ChangeLog = {
  changes: [
    {
      date: new Date('02-04-2018'),
      description: '',
      list: [
        'Radiant Shield is now listed as a Summoner buff. Anything that\'s added like Radiant Shield will now be known as a "special buff", that will be applied after everything else.'
      ]
    },

    {
      date: new Date('02-02-2018'),
      description: 'Definitions page added.',
      list: [
        'The definitions page was added in order to show all buff metadata to people viewing this site. All calculations should be completely transparent on how they are done, and if something doesn\'t seem correct, they can contact me to fix it, or submit a pull request with the fix themselves.',
        'The disclaimers for haste buffs has been changed to ^, the disclaimers for direct hit buffs has been changed to `, critical hit disclaimers are still *. Now you can distinguish the type from it.'
      ]
    },

    {
      date: new Date('01-27-2018'),
      description: '',
      list: [
        'Patch version is now tracked (starting with 4.0). If a buff had changes within an encounter\'s patch, it will use the correct version of the buff. Recaching will need to be done, since this does affect old logs.'
      ]
    },

    {
      date: new Date('01-09-2018'),
      description: '',
      list: [
        'Expanded cards are now checked if the card buff lasted for >=60s. All other solo cards will still be checked as Enhanced for now, until we can check the Royal Road.',
        'Overwritten buffs are now handled separately.'
      ]
    },

    {
      date: new Date('12-21-2017'),
      description: '',
      list: [
        'Save full results instead of just damage done results to reduce number of FFLogs requests. The only issue is that if more data is needed/changed, this table will likely need to be cleared.'
      ]
    },

    {
      date: new Date('12-20-2017'),
      description: 'Handle errors better in the case of too many FFLogs requests.',
      list: [
        'Added some more error handling/showing for FFLogs request errors. If the site is getting hammered, "too many requests" errors can occur since FFLogs only allows a maximum of 240 requests every 2 minutes. These changes should help a bit with showing that error more correctly, as there are not too many ways of getting around this issue right now.',
        'In certain situations (like Brotherhood, casters were getting affected), role-based buffs were not working properly before. It should be working correctly now. If this breaks anything, please let me know.',
        'In the case of duplicate jobs, divide contribution between them by the amount of duplicates (since the app cannot know where buffs came from at this time).',
        'Show application errors on an actual page, instead of a blank white page with the error printed out.'
      ]
    },

    {
      date: new Date('11-26-2017'),
      description: '',
      list: [
        'Hovering over the number in "From Other Buffs" will give you a breakdown of how much each buff contributed damage to that player.',
        'Added tracking for Embolden, properly split up into 5 buffs, each lasting 4s.',
        'Added tracking for The Spear.',
        'Added tracking for The Arrow, Fey Wind.'
      ]
    },

    {
      date: new Date('11-25-2017'),
      description: 'All buffs will check targeting first, so people out of range will no longer be added to contribution.',
      list: [
        'Targetting information for all buffs added.',
        'If "The Balance" is single target, it will now be treated as enhanced balance. Therefore all extra damage from balance fed parses will be attributed to the AST.'
      ]
    },

    {
      date: new Date('11-24-2017'),
      description: 'Since it was a bit awkward to just use the URL to select logs, I put in a few more ways to look up the logs using the FFLogs listings.',
      list: [
        'Added the Change Log / Issues',
        'Added Encounter ID Lookup',
        'Added Encounter Name Listing',
        'Added Character Name Listing',
        'Added tracking of Contagion (Magic Vuln Up), Radiant Shield (Phys Vuln Up), Brotherhood',
        'Cache all damage done requests to a DB so we do not have to make a bunch of new FFLogs requests for identical data.'
      ]
    }
  ],

  issues: [
    'Slashing Resistance Down is not being tracked yet.',
    'All speed buffs and crit buffs are currently tracked as static damage buffs, find a better way to do this.',
    'No clue what to do in the case of double jobs, right now it will definitely produce incorrect results.',
    'Find a way to check the type of Royal Road when a card is single target. There\'s also no way to tell when a card has been overwritten right now.'
  ]
}

ChangeLog.changes.forEach(change => {
  change.date = change.date.toDateString()
})

module.exports = ChangeLog
