// netlify/functions/sync-leaderboard.js
// HTTP-triggered function — called by cron-job.org every 10 minutes

const RAPIDAPI_KEY = '1ffedec37fmsh87510b1a47735c4p185c25jsnb37997bb5118';
const RAPIDAPI_HOST = 'live-golf-data.p.rapidapi.com';
const USOPEN_TOURN_ID = '026'; // US Open 2026 - verify tournId Thursday morning
const USOPEN_YEAR = '2026';
const FIREBASE_URL = 'https://us-open-calcutta-default-rtdb.firebaseio.com';

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .replace(/æ/g, 'ae')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ä/g, 'a')
    .replace(/é/g, 'e')
    .replace(/è/g, 'e')
    .replace(/ê/g, 'e')
    .replace(/ñ/g, 'n')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function gKey(name) {
  return normalize(name).replace(/[^a-z0-9]/g, '_');
}

const ALL_GOLFERS = [
  'Scottie Scheffler','Rory McIlroy','Jon Rahm','Cameron Young','Matt Fitzpatrick',
  'Xander Schauffele','Tommy Fleetwood','Bryson DeChambeau','Ludvig Aberg','Brooks Koepka',
  'Wyndham Clark','Chris Gotterup','Collin Morikawa','Patrick Cantlay','Patrick Reed',
  'Russell Henley','Sam Burns','Tyrrell Hatton','Justin Rose','Justin Thomas',
  'Si Woo Kim','Corey Conners','Daniel Berger','John Parry','Nico Echavarria',
  'Jack Schoenberger','Jackson Van Paris','Vaughn Harber',
  'Viktor Hovland','Rickie Fowler','David Puig','Pierceson Coody','Patrick Rodgers',
  'Hennie Du Plessis','James Nicholas','Mateo Pulcini',
  'J.J. Spaun','Nick Taylor','Dustin Johnson','Max McGreevy','William Mouw',
  'Harry Higgs','Rocco Repetto Taylor','Marek Fleming',
  'Hideki Matsuyama','Keegan Bradley','Jacob Bridgeman','Matti Schmid','Jimmy Stanger',
  'Graeme McDowell','T K Kim','Marcelo Rozo',
  'Joaquin Niemann','Jason Day','Ryan Fox','Emiliano Grillo','Kevin Roy',
  'Dylan Wu','Taylor Montgomery','Manav Shah',
  'Jordan Spieth','Jackson Koivun','Sahith Theegala','Chris Kirk','Peter Uihlein',
  'Cooper Dossey','Ugo Coussaud','Jackson Ormond',
  'Shane Lowry','J.T. Poston','Harry Hall','Max Greyserman','Adrien Dumont De Chassart',
  'Cole Hammer','Eric Lee','J B Holmes',
  'Robert MacIntyre','Alex Smalley','Keith Mitchell','Matt McCarty','Alejandro Tosti',
  'Chandler Phillips','Ethan Fang','Spencer Tibbits',
  'Ben Griffin','Alex Noren','Sungjae Im','Lucas Herbert','Ben Kohles',
  'Carl Yuan','Filippo Celli','Robbie Higgins',
  'Min Woo Lee','Sepp Straka','Tom Kim','Johnny Keefer','Caleb Surratt',
  'Bryan Lee','Greyson Leach','Matthew Robles',
  'Aaron Rai','Ryan Gerard','Ben James','Jayden Schaper','Laurie Canter',
  'Brandon Wu','Jackson Herrington','Logan Reilly',
  'Kristoffer Reitan','Gary Woodland','Brian Harman','Jackson Suber','Matthew Jordan',
  'Padraig Harrington','Jake Peacock','Kaito Onishi',
  'Maverick McNealy','Bud Cauley','Davis Thompson','Carlos Ortiz','Miles Russell',
  'Niklas Norgaard','Mason Howell','Jake Sollon',
  'Adam Scott','Akshay Bhatia','Michael Brennan','Billy Horschel','Nathan Kimsey',
  'Nick Hardy','Ryder Cowan','Hamilton Coleman',
  'Alex Fitzpatrick','Nicolai Hojgaard','Ryo Hisatsune','Andrew Putnam','Preston Stout',
  'Ben Silverman','Ryuichi Oiwa','Giuseppe Puebla',
  'Cameron Smith','Kurt Kitayama','Sudarshan Yellamaraju','Andrew Novak','Zac Blair',
  'Angel Hidalgo','Taihei Sato','Chase Kyes',
  'Harris English','Jake Knapp','Michael Kim','Sam Stevens','Neal Shipley',
  'Adrien Saddier','Arni Sveinsson','Brandon Holtz',
];

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const res = await fetch(
      `https://${RAPIDAPI_HOST}/leaderboard?orgId=1&tournId=${USOPEN_TOURN_ID}&year=${USOPEN_YEAR}`,
      { headers: { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': RAPIDAPI_HOST } }
    );
    if (!res.ok) return { statusCode: 500, body: `API error: ${res.status}` };

    const data = await res.json();
    const rows = data?.leaderboardRows || [];
    if (!rows.length) return { statusCode: 200, body: 'No data returned' };

    // Build name lookup map
    const nameMap = {};
    for (const name of ALL_GOLFERS) {
      const last = name.split(' ').pop();
      nameMap[normalize(last)] = name;
      nameMap[normalize(name)] = name;
    }
    const overrides = {
      'jj spaun': 'J.J. Spaun',
      'j.j. spaun': 'J.J. Spaun',
      'jt poston': 'J.T. Poston',
      'j.t. poston': 'J.T. Poston',
      'y e yang': 'Y E Yang',
      'y.e. yang': 'Y E Yang',
      'min woo lee': 'Min Woo Lee',
      'robert macintyre': 'Robert MacIntyre',
      'jake knapp': 'Jake Knapp',
      'knapp': 'Jake Knapp',
      'bide': 'Francisco Bide',
      'francisco bide': 'Francisco Bide',
    };
    for (const [k, v] of Object.entries(overrides)) nameMap[k] = v;

    const updates = {};
    let matched = 0;

    // Golfers whose Firebase data is manually locked — sync will never touch these
    const SKIP_SYNC = new Set(['jason_day']);

    for (const p of rows) {
      const fullName = `${(p.firstName || '').trim()} ${(p.lastName || '').trim()}`.trim();
      const ourName = nameMap[normalize(fullName)]
        || nameMap[normalize(p.lastName || '')]
        || overrides[normalize(fullName)]
        || overrides[normalize(p.lastName || '')];

      if (!ourName) continue;
      if (SKIP_SYNC.has(gKey(ourName))) continue;
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
    updates['golf/_t']               = 'usopen2026_sync';

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
