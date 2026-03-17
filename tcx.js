export function sessionToTCX(session){
  const esc = s=> String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const activityId = esc(session.startedAt || new Date().toISOString());
  const points = Array.isArray(session.points)? session.points: [];
  const header = `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Activities>
    <Activity Sport="Running">
      <Id>${activityId}</Id>
      <Lap StartTime="${activityId}">
        <TotalTimeSeconds>${Math.max(1, Math.round((new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime())/1000))}</TotalTimeSeconds>
        <DistanceMeters>${Number(points.at(-1)?.dist_m ?? 0).toFixed(1)}</DistanceMeters>
        <Intensity>Active</Intensity>
        <Track>`;
  const track = points.map(p=>{
    const iso = esc(p.iso);
    const dist = Number(p.dist_m ?? 0).toFixed(1);
    const hr = Math.max(0, Math.round(p.hr ?? 0));
    return `          <Trackpoint>
            <Time>${iso}</Time>
            <DistanceMeters>${dist}</DistanceMeters>
            <HeartRateBpm><Value>${hr}</Value></HeartRateBpm>
          </Trackpoint>`;
  }).join('
');
  const footer = `
        </Track>
      </Lap>
    </Activity>
  </Activities>
</TrainingCenterDatabase>`;
  return header + '
' + track + footer;
}
