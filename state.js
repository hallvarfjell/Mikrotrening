
// Enkel state-machine for økt: IDLE → ACTIVE_EXERCISE → REST → … → COMPLETED
export const SessionPhase = {
  IDLE: 'IDLE',
  ACTIVE: 'ACTIVE_EXERCISE',
  REST: 'REST',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  STOPPED: 'STOPPED',
};

export class SessionState {
  constructor(workout) {
    this.workout = workout;
    this.exerciseIndex = 0;
    this.phase = SessionPhase.IDLE;
    this.startedAt = null; // ISO
    this.endedAt = null;   // ISO
    this.exercisesLog = []; // {name, planned_seconds, actual_seconds, started_at, ended_at}
    this.currentPhaseStartedAt = null;
    this.currentPhaseEndedAt = null;
  }

  _nowISO() {
    return new Date().toISOString();
  }

  start() {
    this.startedAt = this._nowISO();
    this.exerciseIndex = 0;
    this.phase = SessionPhase.ACTIVE;
    this.currentPhaseStartedAt = this._nowISO();
  }

  pause() {
    if (this.phase === SessionPhase.ACTIVE || this.phase === SessionPhase.REST) {
      this.phase = SessionPhase.PAUSED;
    }
  }

  resume(prevPhase) {
    if (this.phase === SessionPhase.PAUSED) {
      this.phase = prevPhase;
    }
  }

  nextPhase() {
    if (this.phase === SessionPhase.ACTIVE) {
      // Aktiv øvelse er ferdig
      const ex = this.workout.exercises[this.exerciseIndex];
      this.currentPhaseEndedAt = this._nowISO();
      // Logg øvelsen (actual_seconds kalkuleres senere i app.js ut fra tidsstempler)
      this.exercisesLog.push({
        name: ex.name,
        planned_seconds: ex.duration_seconds,
        started_at: this.currentPhaseStartedAt,
        ended_at: this.currentPhaseEndedAt,
      });

      // Videre til hvile eller fullført
      if (this.exerciseIndex < this.workout.exercises.length - 1) {
        this.phase = SessionPhase.REST;
        this.currentPhaseStartedAt = this._nowISO();
      } else {
        this.phase = SessionPhase.COMPLETED;
        this.endedAt = this._nowISO();
      }
    } else if (this.phase === SessionPhase.REST) {
      // Ferdig hvile → neste øvelse
      this.currentPhaseEndedAt = this._nowISO();
      this.exerciseIndex += 1;
      this.phase = SessionPhase.ACTIVE;
      this.currentPhaseStartedAt = this._nowISO();
    }
  }

  stop() {
    // Avbryt økt – lagre det som er gjort
    if (this.phase === SessionPhase.ACTIVE) {
      const ex = this.workout.exercises[this.exerciseIndex];
      // Logg pågående øvelse som delvis (end_at settes av app.js med nå)
      this.exercisesLog.push({
        name: ex.name,
        planned_seconds: ex.duration_seconds,
        started_at: this.currentPhaseStartedAt,
        ended_at: new Date().toISOString(),
      });
    }
    this.phase = SessionPhase.STOPPED;
    this.endedAt = this._nowISO();
  }
}
