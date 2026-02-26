
// BLE placeholders
async function connectHR() {
  alert('Kobler til pulsbelte (stub)');
}
async function connectTreadmill() {
  alert('Kobler til tredemølle (stub)');
}

// Attach events
document.getElementById('connect-hr').onclick = connectHR;
document.getElementById('connect-treadmill').onclick = connectTreadmill;

document.querySelectorAll('.speed-btn').forEach(btn => {
  btn.onclick = () => {
    alert('Setter fart: ' + btn.dataset.speed + ' km/t');
  }
});
