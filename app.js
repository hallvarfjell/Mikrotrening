
let timers = JSON.parse(localStorage.getItem("timers")||"[]");
let interval, state, timeLeft, round;

function renderTimers(){
  const div = document.getElementById("timers");
  div.innerHTML="";
  timers.forEach((t,i)=>{
    div.innerHTML+=`
    <div class='timer'>
      <b>${t.name}</b><br>
      ${t.rounds} x ${t.work}s / ${t.rest}s<br>
      <button onclick="start(${i})">Start</button>
      <button onclick="del(${i})">Slett</button>
    </div>`;
  });
}

function saveTimer(){
  const t = {
    name:name.value,
    rounds:+rounds.value,
    work:+work.value,
    rest:+rest.value
  };
  timers.push(t);
  localStorage.setItem("timers",JSON.stringify(timers));
  renderTimers();
}

function start(i){
  const t=timers[i];
  document.getElementById("setup").classList.add("hidden");
  document.getElementById("run").classList.remove("hidden");
  title.innerText=t.name;
  state="work"; round=1; timeLeft=t.work;
  tick(t);
}

function tick(t){
  update(t);
  interval=setInterval(()=>{
    timeLeft--;
    if(timeLeft<=0){
      if(state=="work"){
        state="rest"; timeLeft=t.rest;
      } else {
        round++;
        if(round>t.rounds){ stop(); return;}
        state="work"; timeLeft=t.work;
      }
    }
    update(t);
  },1000);
}

function update(t){
  current.innerText=format(timeLeft);
  info.innerText=`Runde ${round}/${t.rounds} - ${state}`;
}

function pause(){ clearInterval(interval); }
function stop(){ clearInterval(interval); location.reload(); }
function del(i){ timers.splice(i,1); localStorage.setItem("timers",JSON.stringify(timers)); renderTimers(); }
function format(s){ return Math.floor(s/60).toString().padStart(2,"0")+":"+ (s%60).toString().padStart(2,"0"); }

renderTimers();