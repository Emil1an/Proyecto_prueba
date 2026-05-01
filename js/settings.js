import {
  auth, db,
  onAuthStateChanged, signOut,
  doc, getDoc, updateDoc
} from './firebase_config.js';

let currentUser = null;

onAuthStateChanged(auth, async (user) => {
  const loading = document.getElementById('loading-screen');

  if (!user) {
    window.location.href = 'index.html';
    return;
  }

  currentUser = user;

  // Load profile
  const snap = await getDoc(doc(db, 'usuarios', user.uid));
  if (snap.exists()) {
    const data = snap.data();

    document.getElementById('profile-name').textContent = data.nombre || user.email;
    document.getElementById('profile-id').textContent = `ID: ${data.idInstitucional || '—'}`;
    document.getElementById('avatar-letter').textContent = (data.nombre || 'U')[0].toUpperCase();

    // Vehicle
    const vehSelect = document.getElementById('vehiculoTipo');
    if (vehSelect) vehSelect.value = data.vehiculo || 'coche';
    const placas = document.getElementById('vehPlacas');
    if (placas) placas.value = data.placas || '';

    // Discapacidad
    const discap = document.getElementById('discapToggle');
    if (discap) discap.checked = data.discapacidad || false;
  }

  // Theme
  const theme = localStorage.getItem('theme') || 'light';
  const darkToggle = document.getElementById('darkToggle');
  if (darkToggle) {
    darkToggle.checked = theme === 'dark';
    if (theme === 'dark') document.body.classList.add('dark-mode');
  }

  // Font size
  const font = localStorage.getItem('fontSize') || 'medium';
  const fontSelect = document.getElementById('fontSize');
  if (fontSelect) {
    fontSelect.value = font;
    applyFontSize(font);
  }

  // Events
  darkToggle?.addEventListener('change', function () {
    const val = this.checked ? 'dark' : 'light';
    localStorage.setItem('theme', val);
    document.body.classList.toggle('dark-mode', this.checked);
  });

  fontSelect?.addEventListener('change', function () {
    localStorage.setItem('fontSize', this.value);
    applyFontSize(this.value);
  });

  document.getElementById('vehiculoTipo')?.addEventListener('change', function () {
    const row = document.getElementById('placas-row');
    if (row) row.style.display = this.value === 'bicicleta' ? 'none' : 'flex';
  });

  loading.style.opacity = '0';
  setTimeout(() => loading.style.display = 'none', 400);
});

function applyFontSize(size) {
  const sizes = { small: '13px', medium: '15px', large: '19px' };
  document.body.style.fontSize = sizes[size] || '15px';
}

window.guardarCambios = async function () {
  const btn = document.getElementById('save-btn');
  btn.innerHTML = '<span class="btn-spinner"></span>Guardando...';
  btn.disabled = true;

  try {
    const vehiculo = document.getElementById('vehiculoTipo').value;
    const placas = document.getElementById('vehPlacas').value.trim();
    const discap = document.getElementById('discapToggle').checked;

    await updateDoc(doc(db, 'usuarios', currentUser.uid), {
      vehiculo,
      placas,
      discapacidad: discap
    });

    btn.innerHTML = '✅ Guardado';
    setTimeout(() => { btn.innerHTML = 'Guardar cambios'; btn.disabled = false; }, 2000);
  } catch (e) {
    console.error(e);
    btn.innerHTML = '❌ Error';
    btn.disabled = false;
  }
};

window.logout = async function () {
  if (!confirm('¿Cerrar sesión?')) return;
  await signOut(auth);
  window.location.href = 'index.html';
};
