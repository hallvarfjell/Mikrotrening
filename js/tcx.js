
// Genererer TCX med én aktivitet per dag, én lap per økt, trackpoints per sekund.
// Sport="Other". Tider i UTC (Z). Laster ned som fil.

// Lag <Id> for dagen (UTC midnatt)
function dayStartUtcId(dateStr) {
  // dateStr "YYYY-MM-DD" → midnatt lokal, konverter til UTC Z
  const [y,m,d] = dateStr.split('-').map(Number);
  const localMidnight = new Date(y, m-1, d, 0, 0, 0);
  const utcIso = new Date(localMidnight.getTime() - localMidnight.getTimezoneOffset()*60000)
                    .toISOString().replace('.000','');
  return utcIso; // ex: 2025-12-05T00:00:00Z
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&apos;');
}

export function generateTCXForDay(dateStr, sessions) {
  // Sorter sessions kronologisk
  const sorted = [...sessions].sort((a,b) => new Date(a.started_at) - new Date(b.started_at));

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">\n`;
  xml += `  <Activities>\n`;
  xml += `    <Activity Sport="Other">\n`;
  xml += `      <Id>${dayStartUtcId(dateStr)}</Id>\n`;

  for (const s of sorted) {
    // started_at og ended_at er allerede ISO i UTC (Z) fra appen
    const startIso = s.started_at.replace('.000','');
    const endIso = s.ended_at.replace('.000','');
    const totalSec = Math.max(1, Math.round((new Date(s.ended_at) - new Date(s.started_at)) / 1000));

    xml += `      <Lap StartTime="${startIso}">\n`;
    xml += `        <TotalTimeSeconds>${totalSec}</TotalTimeSeconds>\n`;
    xml += `        <Intensity>Active</Intensity>\n`;
    xml += `        <TriggerMethod>Manual</TriggerMethod>\n`;
    xml += `        <Track>\n`;

    // Trackpoints per sekund fra start til slutt (bruk direkte UTC fra Date.toISOString())
    const startMs = new Date(s.started_at).getTime();
    const endMs = new Date(s.ended_at).getTime();
    for (let t = startMs; t <= endMs; t += 1000) {
      const isoUtc = new Date(t).toISOString().replace('.000','');
      xml += `          <Trackpoint><Time>${isoUtc}</Time></Trackpoint>\n`;
    }

    const notes = `${s.workout_name} (${s.exercises?.length ?? 0} øvelser)`;
    xml += `        </Track>\n`;
    xml += `        <Notes>${escapeXml(notes)}</Notes>\n`;
    xml += `      </Lap>\n`;
  }

  xml += `    </Activity>\n`;
  xml += `  </Activities>\n`;
  xml += `</TrainingCenterDatabase>\n`;

  return xml;
}

export function downloadTCX(dateStr, xml) {
  const blob = new Blob([xml], {type: 'application/vnd.garmin.tcx+xml'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `microdesk_${dateStr}.tcx`;
  a.click();
  URL.revokeObjectURL(a.href);
}
