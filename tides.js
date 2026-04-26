// api/tides.js — Vercel serverless function
// Fetches NOAA tide predictions server-side (no CORS issues)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=1800'); // cache 30 min on Vercel edge

  try {
    const today = new Date();
    const begin = fmt(today);
    const end   = fmt(new Date(today.getTime() + 4 * 86400000));

    const url = `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?begin_date=${begin}&end_date=${end}&station=8721604&product=predictions&datum=MLLW&time_zone=lst_lct&interval=hilo&units=english&application=dogwalkersurfreport&format=json`;

    const r = await fetch(url);
    if (!r.ok) throw new Error('NOAA ' + r.status);
    const data = await r.json();

    if (!data.predictions) throw new Error(data.error?.message || 'No predictions');
    res.status(200).json({ predictions: data.predictions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

function fmt(d) {
  return d.getFullYear()
    + String(d.getMonth()+1).padStart(2,'0')
    + String(d.getDate()).padStart(2,'0');
}
