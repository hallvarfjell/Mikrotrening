export function sessionToTCX(session){
  const esc = s=> String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const points = Array.isArray(session.points)? session.points: [];
  const tStart = session.startedAt || new Date().toISOString();
  const totalSec = Math.max(1, Math.round((new Date(session.endedAt).getTime() - new Date(tStart).getTime())/1000));
  const distM = Number(points.at(-1)?.dist_m ?? 0).toFixed(1);
  const header = `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities><Activity Sport="Running">
    <Id>${esc(tStart)}</Id>
    <Lap StartTime="${esc(tStart)}">
      <TotalTimeSeconds>${totalSec}</TotalTimeSeconds>
      <DistanceMeters>${distM}</DistanceMeters>
      <Intensity>Active</Intensity>
      <Track>`;
  const track = points.map(p=>`
        <Trackpoint>
          <Time>${esc(p.iso)}</Time>
          <DistanceMeters>${Number(p.dist_m ?? 0).toFixed(1)}</DistanceMeters>
          <HeartRateBpm><Value>${Math.max(0, Math.round(p.hr ?? 0))}</Value></HeartRateBpm>
        </Trackpoint>`).join('');
  const footer = `
      </Track>
    </Lap>
  </Activity></Activities>
</TrainingCenterDatabase>`;
  return header + track + footer;
}
