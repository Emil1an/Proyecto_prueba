import {
  auth, db,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  doc, setDoc, getDoc
} from './firebase_config.js';

// ── Hide loading screen ──────────────────────────────────────────────────────
// Variable global para controlar el flujo
let isRegistering = false;

window.addEventListener('load', () => {
  onAuthStateChanged(auth, (user) => {
    const loading = document.getElementById('loading-screen');

    if (user) {
      // SI hay usuario PERO NO estamos registrando, redirigir
      if (!isRegistering) {
        window.location.href = 'home.html';
      }
      // Si isRegistering es true, no hacemos nada y dejamos que la función register termine
    } else {
      if (loading) {
        loading.style.opacity = '0';
        setTimeout(() => loading.style.display = 'none', 400);
      }
    }
  });
});

// ── Tab switching ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const loginTab = document.getElementById('loginTab');
  const registerTab = document.getElementById('registerTab');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');

  loginTab.onclick = () => {
    loginTab.classList.add('active');
    registerTab.classList.remove('active');
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
  };

  registerTab.onclick = () => {
    registerTab.classList.add('active');
    loginTab.classList.remove('active');
    registerForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
  };

  // Type buttons
  const typeBtns = document.querySelectorAll('.type-btn');
  const idField = document.getElementById('idField');
  typeBtns.forEach(btn => {
    btn.onclick = () => {
      typeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const t = btn.dataset.type;
      idField.placeholder = `ID de ${t.charAt(0).toUpperCase() + t.slice(1)}`;
    };
  });

  cargarTema();
});

// ── LOGIN ────────────────────────────────────────────────────────────────────
window.login = async function () {
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPassword').value;
  const btn = document.getElementById('loginBtn');
  const err = document.getElementById('login-error');

  if (!email || !pass) { showError(err, 'Completa todos los campos.'); return; }

  btn.innerHTML = '<span class="btn-spinner"></span>Entrando...';
  btn.disabled = true;
  err.style.display = 'none';

  try {
    await signInWithEmailAndPassword(auth, email, pass);
    window.location.href = 'home.html';
  } catch (e) {
    const msgs = {
      'auth/user-not-found': 'No existe una cuenta con ese correo.',
      'auth/wrong-password': 'Contraseña incorrecta.',
      'auth/invalid-email': 'Correo inválido.',
      'auth/too-many-requests': 'Demasiados intentos. Intenta más tarde.',
    };
    showError(err, msgs[e.code] || 'Error al iniciar sesión.');
    btn.innerHTML = 'Entrar';
    btn.disabled = false;
  }
};

// ── REGISTER ─────────────────────────────────────────────────────────────────
window.register = async function () {
  const nombre = document.getElementById('regNombre').value.trim();
  const idInst = document.getElementById('idField').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const pass = document.getElementById('regPass').value;
  const confirm = document.getElementById('regConfirmPass').value;
  const vehiculo = document.getElementById('tipoVehiculo').value;
  const color = document.getElementById('vehColor')?.value.trim() || '';
  const placas = document.getElementById('vehPlacas')?.value.trim() || '';
  const discap = document.getElementById('regDiscapacidad').checked;
  const tipo = document.querySelector('.type-btn.active')?.dataset.type || 'estudiante';
  const btn = document.getElementById('registerBtn');
  const err = document.getElementById('register-error');

  if (!nombre || !idInst || !email || !pass) {
    showError(err, 'Completa todos los campos obligatorios.'); return;
  }
  if (pass !== confirm) { showError(err, 'Las contraseñas no coinciden.'); return; }
  if (pass.length < 6) { showError(err, 'La contraseña debe tener al menos 6 caracteres.'); return; }

  btn.innerHTML = '<span class="btn-spinner"></span>Creando cuenta...';
  btn.disabled = true;
  err.style.display = 'none';
  // ACTIVAR BANDERA: Evita que onAuthStateChanged nos saque de aquí prematuramente
  isRegistering = true;

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    const uid = cred.user.uid;

    // Save user profile to Firestore
    await setDoc(doc(db, 'usuarios', uid), {
      uid,
      nombre,
      idInstitucional: idInst,
      email,
      tipo,           // estudiante | profesor | empleado
      vehiculo,
      color,
      placas,
      discapacidad: discap,
      creadoEn: new Date().toISOString(),
      reservaActiva: null
    });

    window.location.href = 'home.html';
  } catch (e) {
    isRegistering = false;
    const msgs = {
      'auth/email-already-in-use': 'Ya existe una cuenta con ese correo.',
      'auth/invalid-email': 'Correo inválido.',
      'auth/weak-password': 'Contraseña muy débil (mínimo 6 caracteres).',
    };
    showError(err, msgs[e.code] || 'Error al crear cuenta.');
    btn.innerHTML = 'Crear cuenta';
    btn.disabled = false;
  }
};

// ── HELPERS ──────────────────────────────────────────────────────────────────
function showError(el, msg) {
  el.textContent = msg;
  el.style.display = 'block';
}

window.togglePassword = function (id, btn) {
  const input = document.getElementById(id);
  input.type = input.type === 'password' ? 'text' : 'password';
  btn.textContent = input.type === 'password' ? '👁' : '🙈';
};

window.toggleCamposVehiculo = function () {
  const tipo = document.getElementById('tipoVehiculo').value;
  const extras = document.getElementById('camposExtrasVehiculo');
  if (extras) extras.style.display = tipo === 'bicicleta' ? 'none' : 'block';
};

function cargarTema() {
  if (localStorage.getItem('theme') === 'dark') document.body.classList.add('dark-mode');
}
