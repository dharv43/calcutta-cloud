// netlify/functions/sync-leaderboard.js
// HTTP-triggered function — called by cron-job.org every 10 minutes

const RAPIDAPI_KEY = '1ffedec37fmsh87510b1a47735c4p185c25jsnb37997bb5118';
const RAPIDAPI_HOST = 'live-golf-data.p.rapidapi.com';
const PGA_TOURN_ID = '033';
const PGA_YEAR = '2026';
const FIREBASE_URL = 'https://pga-championship-calcutta-default-rtdb.firebaseio.com';

function gKey(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '_');
}

const ALL_GOLFERS = [
  // Individuals
  'Scottie Scheffler','Rory McIlroy','Cameron Young','Jon Rahm','Xander Schauffele',
  'Bryson DeChambeau','Matt Fitzpatrick','Ludvig Aberg','Tommy Fleetwood','Brooks Koepka',
  'Collin Morikawa','Justin Thomas','Patrick Cantlay','Justin Rose','Tyrrell Hatton',
  'Chris Gotterup','Viktor Hovland','Rickie Fowler','Russell Henley','Si Woo Kim',
  // Group 1
  'Jordan Spieth','Michael Thorbjornsen','Wyndham Clark','Max Greyserman',
  'Adrien Saddier','Kota Kaneko','Andy Sullivan','Ryan Vermeer',
  // Group 2
  'Min Woo Lee','Matt McCarty','Tom McKibbin','Matt Wallace',
  'Austin Smotherman','Adam Schenk','Brian Campbell','Zach Haynes',
  // Group 3
  'Nicolai Hojgaard','David Puig','Harry Hall','Andrew Novak',
  'Rasmus Neergaard-Petersen','William Mouw','Chandler Blanchet','Jesse Droemer',
  // Group 4
  'Patrick Reed','Brian Harman','Rasmus Hojgaard','Aldrich Potgieter',
  'Ricky Castillo','Jhonattan Vegas','Joe Highsmith','Derek Berg',
  // Group 5
  'Robert MacIntyre','Marco Penge','Alex Smalley','Daniel Hillier',
  'Rico Hoey','Garrick Higgo','Kazuki Higa','Bryce Fisher',
  // Group 6
  'Sam Burns','Alex Noren','Cameron Smith','Bud Cauley',
  'Stewart Cink','Andrew Putnam','Martin Kaymer','Ben Kern',
  // Group 7
  'Adam Scott','Aaron Rai','Dustin Johnson','Taylor Pendrith',
  'Christiaan Bezuidenhout','Johnny Keefer','Michael Block','Austin Hurt',
  // Group 8
  'Hideki Matsuyama','Sungjae Im','Daniel Berger','Jayden Schaper',
  'Lucas Glover','David Lipsky','Padraig Harrington','Shaun Micheel',
  // Group 9
  'J.J. Spaun','Thomas Detry','Max Homa','Dan Brown',
  'Davis Riley','Emiliano Grillo','Paul McClure','Tyler Collet',
  // Group 10
  'Sepp Straka','Maverick McNealy','Michael Brennan','Sam Stevens',
  'Patrick Rodgers','Brandt Snedeker','Travis Smyth','Timothy Wiseman',
  // Group 11
  'Akshay Bhatia','Keegan Bradley','Nick Taylor','Ryan Fox',
  'Bernd Wiesberger','John Parry','Ben Polland','Ryan Lenahan',
  // Group 12
  'Jake Knapp','Joaquin Niemann','Ryan Gerard','Pierceson Coody',
  'Casey Jarvis','Steven Fisk','Braden Shattuck','Michael Kartrude',
  // Group 13
  'Kristoffer Reitan','Jason Day','Ryo Hisatsune','Michael Kim',
  'Chris Kirk','Stephan Jaeger','Jason Dufner','Mark Geddes',
  // Group 14
  'Shane Lowry','Jacob Bridgeman','Sahith Theegala','Keith Mitchell',
  'Elvis Smylie','Sami Valimaki','Jimmy Walker','Jared Jones',
  // Group 15
  'Ben Griffin','Harris English','Sudarshan Yellamaraju','Jordan Smith',
  'Ian Holt','Nico Echavarria','Jordan Gumberg','Garrett Sapp',
  // Group 16
  'Kurt Kitayama','Gary Woodland','Denny McCarthy','Haotong Li',
  'Max McGreevy','Mikael Lindberg','Luke Donald','Francisco Bide',
  // Group 17
  'Alex Fitzpatrick','Corey Conners','Angel Ayora','Billy Horschel',
  'J.T. Poston','Matti Schmid','Y E Yang','Chris Gabriele',
];

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const res = await fetch(
      `https://${RAPIDAPI_HOST}/leaderboard?orgId=1&tournId=${PGA_TOURN_ID}&year=${PGA_YEAR}`,
      { headers: { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': RAPIDAPI_HOST } }
    );
    if (!res.ok) return { statusCode: 500, body: `API error: ${res.status}` };

    const data = await res.json();
    const rows = data?.leaderboardRows || [];
    if (!rows.length) return { statusCode: 200, body: 'No data returned' };

    // Build name lookup map
    const nameMap = {};
    for (const name of ALL_GOLFERS) {
      const last = name.split(' ').pop().toLowerCase();
      nameMap[last] = name;
      nameMap[name.toLowerCase()] = name;
      nameMap[name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()] = name;
    }
    // Manual overrides for tricky names
    const overrides = {
      'mcilroy': 'Rory McIlroy',
      'scheffler': 'Scottie Scheffler',
      'schauffele': 'Xander Schauffele',
      'dechambeau': 'Bryson DeChambeau',
      'aberg': 'Ludvig Aberg',
      'hojgaard': 'Nicolai Hojgaard',
      'nicolai hojgaard': 'Nicolai Hojgaard',
      'nicolai højgaard': 'Nicolai Hojgaard',
      'n. hojgaard': 'Nicolai Hojgaard',
      'rasmus hojgaard': 'Rasmus Hojgaard',
      'rasmus højgaard': 'Rasmus Hojgaard',
      'r. hojgaard': 'Rasmus Hojgaard',
      'knapp': 'Jake Knapp',
      'jake knapp': 'Jake Knapp',
      'neergaard-petersen': 'Rasmus Neergaard-Petersen',
      'rasmus neergaard-petersen': 'Rasmus Neergaard-Petersen',
      'bezuidenhout': 'Christiaan Bezuidenhout',
      'christiaan bezuidenhout': 'Christiaan Bezuidenhout',
      'im': 'Sungjae Im',
      'sungjae im': 'Sungjae Im',
      'matsuyama': 'Hideki Matsuyama',
      'j.j. spaun': 'J.J. Spaun',
      'spaun': 'J.J. Spaun',
      'jj spaun': 'J.J. Spaun',
      'j.t. poston': 'J.T. Poston',
      'poston': 'J.T. Poston',
      'min woo lee': 'Min Woo Lee',
      'lee': 'Min Woo Lee',
      'macintyre': 'Robert MacIntyre',
      'robert macintyre': 'Robert MacIntyre',
      'gotterup': 'Chris Gotterup',
      'niemann': 'Joaquin Niemann',
      'joaquin niemann': 'Joaquin Niemann',
      'thorbjornsen': 'Michael Thorbjornsen',
      'yellamaraju': 'Sudarshan Yellamaraju',
      'y e yang': 'Y E Yang',
      'yang': 'Y E Yang',
      'bhatia': 'Akshay Bhatia',
      'hatton': 'Tyrrell Hatton',
    };
    for (const [k, v] of Object.entries(overrides)) nameMap[k] = v;

    const updates = {};
    let matched = 0;

    for (const p of rows) {
      const fullName = `${(p.firstName || '').trim()} ${(p.lastName || '').trim()}`.trim();
      const ourName = nameMap[fullName.toLowerCase()]
        || nameMap[fullName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()]
        || nameMap[(p.lastName || '').toLowerCase()]
        || nameMap[(p.lastName || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()];

      if (!ourName) continue;
      matched++;

      const posRaw = String(p.position || '').trim();
      const cut = (p.status || '').toLowerCase().includes('cut') || posRaw.toLowerCase() === 'cut';
      const wd  = (p.status || '').toLowerCase().includes('wd')  || posRaw.toLowerCase() === 'wd';
      const posNum = parseInt(posRaw) || 0;

      updates[`golf/results/${gKey(ourName)}`] = {
        pos: cut || wd ? 999 : (isNaN(posNum) ? 0 : posNum),
        posStr: cut ? 'CUT' : wd ? 'WD' : (posRaw || '—'),
        score: (p.total === '0' || p.total === 'E') ? 'E' : (p.total || 'E'),
        status: cut ? 'cut' : wd ? 'wd' : 'active',
        currentRound: p.currentRoundScore || null,
        thru: p.thru || null,
        r1: p.rounds?.find(r => r.roundId === 1 || r.roundId?.['$numberInt'] === '1')?.scoreToPar || null,
        r2: p.rounds?.find(r => r.roundId === 2 || r.roundId?.['$numberInt'] === '2')?.scoreToPar || null,
        r3: p.rounds?.find(r => r.roundId === 3 || r.roundId?.['$numberInt'] === '3')?.scoreToPar || null,
        r4: p.rounds?.find(r => r.roundId === 4 || r.roundId?.['$numberInt'] === '4')?.scoreToPar || null,
      };
    }

    updates['golf/meta/roundId']     = data.roundId     ? String(data.roundId)     : null;
    updates['golf/meta/roundStatus'] = data.roundStatus ? String(data.roundStatus) : null;
    updates['golf/meta/cutScore']    = data.cutLines?.[0]?.cutScore ? String(data.cutLines[0].cutScore) : null;
    updates['golf/lastSync']         = Date.now();
    updates['golf/_t']               = 'pga2026_sync';

    const fbRes = await fetch(`${FIREBASE_URL}/.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!fbRes.ok) return { statusCode: 500, body: `Firebase error: ${fbRes.status}` };

    console.log(`Synced ${matched} golfers`);
    return { statusCode: 200, body: `Synced ${matched} golfers at ${new Date().toISOString()}` };

  } catch (err) {
    console.error('sync error:', err);
    return { statusCode: 500, body: err.message };
  }
};
