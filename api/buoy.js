// api/buoy.js — Vercel Serverless Function
// Fetches NDBC buoy data server-side so the browser doesn't hit CORS blocks

export default async function handler(req, res) {
  // Allow CORS from your domain
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600'); // cache 5 min

  const station = req.query.station;
  if (!station || !/^[A-Z0-9]+$/i.test(station)) {
    return res.status(400).json({ error: 'Invalid station ID' });
  }

  try {
    const url = `https://www.ndbc.noaa.gov/data/realtime2/${station}.txt`;
    const response = await fetch(url);

    if (!response.ok) {
      return res.status(502).json({ error: `NDBC returned ${response.status}` });
    }

    const text = await response.text();
    const lines = text.trim().split('\n');

    if (lines.length < 3) {
      return res.status(502).json({ error: 'Not enough data from NDBC' });
    }

    // Parse header and units rows
    const headers = lines[0].replace('#', '').trim().split(/\s+/);
    // Latest observation is line index 2
    const vals = lines[2].trim().split(/\s+/);

    const data = {};
    headers.forEach((h, i) => {
      data[h] = vals[i] === 'MM' ? null : vals[i];
    });

    // Convert common values
    const result = {
      station: station,
      timestamp: data.YY && data.MM && data.DD && data.hh && data.mm
        ? `${data.YY}-${data.MM}-${data.DD} ${data.hh}:${data.mm} UTC`
        : null,
      wind_dir_deg: data.WDIR ? parseFloat(data.WDIR) : null,
      wind_speed_mps: data.WSPD ? parseFloat(data.WSPD) : null,
      wind_gust_mps: data.GST ? parseFloat(data.GST) : null,
      wave_height_m: data.WVHT ? parseFloat(data.WVHT) : null,
      dom_period_sec: data.DPD ? parseFloat(data.DPD) : null,
      avg_period_sec: data.APD ? parseFloat(data.APD) : null,
      wave_dir_deg: data.MWD ? parseFloat(data.MWD) : null,
      pressure_hpa: data.PRES ? parseFloat(data.PRES) : null,
      air_temp_c: data.ATMP ? parseFloat(data.ATMP) : null,
      water_temp_c: data.WTMP ? parseFloat(data.WTMP) : null,
      dewpoint_c: data.DEWP ? parseFloat(data.DEWP) : null,
    };

    // Add imperial conversions
    if (result.air_temp_c !== null) {
      result.air_temp_f = Math.round(result.air_temp_c * 9 / 5 + 32);
    }
    if (result.water_temp_c !== null) {
      result.water_temp_f = Math.round(result.water_temp_c * 9 / 5 + 32);
    }
    if (result.wind_speed_mps !== null) {
      result.wind_speed_kts = Math.round(result.wind_speed_mps * 1.944);
    }
    if (result.wind_gust_mps !== null) {
      result.wind_gust_kts = Math.round(result.wind_gust_mps * 1.944);
    }
    if (result.wave_height_m !== null) {
      result.wave_height_ft = (result.wave_height_m * 3.281).toFixed(1);
    }
    if (result.wind_dir_deg !== null) {
      const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
      result.wind_dir_compass = dirs[Math.round(result.wind_dir_deg / 22.5) % 16];
    }
    if (result.wave_dir_deg !== null) {
      const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
      result.wave_dir_compass = dirs[Math.round(result.wave_dir_deg / 22.5) % 16];
    }

    return res.status(200).json(result);
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
}
