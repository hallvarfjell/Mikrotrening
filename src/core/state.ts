export type State = 'IDLE'|'ACTIVE_EXERCISE'|'REST'|'PAUSED'|'STOP'|'COMPLETED';


export class StateMachine {
private state: State = 'IDLE';
getState() { return this.state; }
transition(to: State) { this.state = to; }
}
