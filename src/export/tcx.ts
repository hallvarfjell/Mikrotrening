// Enkel TCX-generator som tar en session med trackpoints per second
export function generateTCX(session: any) {
// session should contain laps array, each lap has trackpoints [{timeISO, lat, lon}]
const now = new Date();
const header = `<?xml version="1.0" encoding="UTF-8"?>`;
const activityStart = new Date(session.startedAt).toISOString();
const lapsXml = (session.laps || []).map((lap: any) => {
const track = lap.trackpoints.map((tp: any) => `\n <Trackpoint><Time>${new Date(tp.timeISO).toISOString()}</Time><AltitudeMeters>0</AltitudeMeters><DistanceMeters>0</DistanceMeters></Trackpoint>`).join('');
