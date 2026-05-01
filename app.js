import {
  auth, db,
  onAuthStateChanged, signOut,
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, addDoc, getDocs, query, where,
  onSnapshot, serverTimestamp, orderBy
} from './firebase_config.js';

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════
let currentUser = null;
let userProfile = null;
let currentZonaId = null;
let currentCajonId = null;
let countdownTimer = null;
let zonaUnsubscribe = null;

// Zone pin positions
const PIN_POSITIONS = {
  E2: { top: '52%', left: '18%' },
  E3: { top: '38%', left: '13%' },
  E5: { top: '15%', left: '52%' },
  E6: { top: '22%', left: '55%' },
};

// Default zone config
const DEFAULT_ZONES = {
  E2: { nombre: 'Central (E2)', cajones: 16, discapacitados: ['P15', 'P16'], motos: ['P13', 'P14'], bicicletas: ['P11', 'P12'] },
  E3: { nombre: 'Norte (E3)', cajones: 12, discapacitados: ['P11', 'P12'], motos: ['P9', 'P10'], bicicletas: ['P7', 'P8'] },
  E5: { nombre: 'Sur (E5)', cajones: 10, discapacitados: ['P1', 'P2'], motos: ['P7', 'P8'], bicicletas: ['P5', 'P6'] },
  E6: { nombre: 'Este (E6)', cajones: 8, discapacitados: ['P3', 'P4'], motos: ['P5', 'P6'], bicicletas: ['P3', 'P4'] },
};

// ═══════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════
onAuthStateChanged(auth, async (user) => {
  const loading = document.getElementById('loading-screen');

  if (!user) {
    window.location.href = 'index.html';
    return;
  }

  currentUser = user;

  try {
    const snap = await getDoc(doc(db, 'usuarios', user.uid));
    if (snap.exists()) {
      userProfile = snap.data();
    } else {
      userProfile = { nombre: user.email, idInstitucional: '', discapacidad: false };
    }

    await seedZones();

    const greeting = document.getElementById('user-greeting');
    if (greeting) greeting.textContent = userProfile.nombre || user.email;

    setupMapDrag();
    cargarTema();
    await checkActiveReservation();
    await loadPinStatus();

  } catch (err) {
    console.error('Init error:', err);
  }

  loading.style.opacity = '0';
  setTimeout(() => loading.style.display = 'none', 400);
});

async function seedZones() {
  for (const [id, config] of Object.entries(DEFAULT_ZONES)) {
    const ref = doc(db, 'estacionamientos', id);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        id,
        ...config,
        cajonesList: Array.from({ length: config.cajones }, (_, i) => ({
          id: `P${i + 1}`,
          estado: 'libre',
          reservadoPor: null,
          reservadoEn: null,
        }))
      });
    }
  }
}

function setupMapDrag() {
  const viewport = document.getElementById('map-viewport');
  const mapCont = document.getElementById('map-container');
  if (!viewport || !mapCont) return;

  let isDragging = false, startX, startY, initLeft, initTop;

  const start = (e) => {
    isDragging = true;
    const ev = e.touches ? e.touches[0] : e;
    startX = ev.clientX; startY = ev.clientY;
    initLeft = mapCont.offsetLeft;
    initTop = mapCont.offsetTop;
    mapCont.style.cursor = 'grabbing';
  };

  const move = (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const ev = e.touches ? e.touches[0] : e;
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    mapCont.style.left = (initLeft + dx) + 'px';
    mapCont.style.top = (initTop + dy) + 'px';
  };

  const stop = () => { isDragging = false; mapCont.style.cursor = 'grab'; };

  viewport.addEventListener('mousedown', start);
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', stop);
  viewport.addEventListener('touchstart', start, { passive: false });
  window.addEventListener('touchmove', move, { passive: false });
  window.addEventListener('touchend', stop);
}

async function loadPinStatus() {
  for (const id of Object.keys(DEFAULT_ZONES)) {
    const pin = document.getElementById(`pin-${id}`);
    if (!pin) continue;
    try {
      const snap = await getDoc(doc(db, 'estacionamientos', id));
      if (snap.exists()) {
        const data = snap.data();
        const libres = (data.cajonesList || []).filter(c => c.estado === 'libre').length;
        const total = data.cajones || 0;
        pin.className = `pin ${libres === 0 ? 'full' : 'available'}`;
        pin.innerHTML = `<span>${id}</span><span class="pin-label">${libres}/${total}</span>`;
      }
    } catch (e) { }
  }
}

window.showZona = function (idZona) {
  currentZonaId = idZona;

  Object.keys(DEFAULT_ZONES).forEach(id => {
    const p = document.getElementById(`pin-${id}`);
    if (p) p.classList.remove('selected');
  });
  const selPin = document.getElementById(`pin-${idZona}`);
  if (selPin) selPin.classList.add('selected');

  document.getElementById('stats-row').style.display = 'grid';
  document.getElementById('grid-dinamico').style.display = 'grid';
  document.getElementById('zona-placeholder').style.display = 'none';
  document.getElementById('legend').style.display = 'flex';
  document.getElementById('realtime-indicator').style.display = 'flex';

  if (zonaUnsubscribe) zonaUnsubscribe();

  zonaUnsubscribe = onSnapshot(doc(db, 'estacionamientos', idZona), (snap) => {
    if (!snap.exists()) return;
    renderZona(snap.data());
  });
};

function renderZona(zona) {
  const titulo = document.getElementById('titulo-zona');
  const contenedor = document.getElementById('grid-dinamico');
  if (titulo) titulo.textContent = zona.nombre;

  const cajones = zona.cajonesList || [];
  const discap = zona.discapacitados || [];
  const motos = zona.motos || [];
  const bicicletas = zona.bicicletas || [];

  const libres = cajones.filter(c => c.estado === 'libre').length;
  const ocupados = cajones.filter(c => c.estado !== 'libre').length;

  document.getElementById('stat-libres').textContent = libres;
  document.getElementById('stat-ocupados').textContent = ocupados;
  document.getElementById('stat-discap').textContent = discap.length;
  document.getElementById('stat-moto').textContent = motos.length;

  if (libres === 0) mostrarNotificacion(`⚠️ ${zona.nombre} está lleno. Busca otra zona.`);

  contenedor.innerHTML = '';

  cajones.forEach(cajon => {
    const { id: idCajon, estado, reservadoPor } = cajon;
    const esMio = reservadoPor === currentUser?.uid;
    const esOcupado = estado !== 'libre';
    const div = document.createElement('div');

    let classes = 'spot';
    if (esMio) classes += ' reserved-by-me';
    else if (esOcupado) classes += ' occupied';
    else classes += ' free';

    if (discap.includes(idCajon)) classes += ' disabled-spot';
    if (motos.includes(idCajon)) classes += ' moto-spot';
    if (bicicletas.includes(idCajon)) classes += ' bike-spot';

    div.className = classes;
    div.textContent = idCajon;

    if (!esOcupado || esMio) {
      div.onclick = () => {
        if (esMio) {
          mostrarQRActivo();
        } else {
          if (discap.includes(idCajon) && !userProfile?.discapacidad) {
            mostrarNotificacion('♿ Este cajón es exclusivo para personas con discapacidad.');
            return;
          }
          abrirModal(currentZonaId, idCajon, zona.nombre, discap, motos, bicicletas);
        }
      };
    }

    contenedor.appendChild(div);
  });

  const pin = document.getElementById(`pin-${currentZonaId}`);
  if (pin) {
    pin.className = `pin selected ${libres === 0 ? 'full' : 'available'}`;
    pin.innerHTML = `<span>${currentZonaId}</span><span class="pin-label">${libres}/${cajones.length}</span>`;
  }
}

function abrirModal(idZona, idCajon, nombreZona, discap, motos, bicicletas) {
  if (userProfile?.reservaActiva) {
    mostrarNotificacion('⚠️ Ya tienes una reservación activa. Cancélala primero.');
    return;
  }

  currentCajonId = idCajon;

  let tipo = '🚗 Normal';
  if (discap.includes(idCajon)) tipo = '♿ Discapacidad';
  if (motos.includes(idCajon)) tipo = '🏍️ Motocicleta';
  if (bicicletas.includes(idCajon)) tipo = '🚲 Bicicleta';

  document.getElementById('modal-zona-nombre').textContent = nombreZona;
  document.getElementById('modal-cajon-numero').textContent = idCajon;
  document.getElementById('modal-tipo-cajon').textContent = tipo;
  document.getElementById('vista-confirmacion').style.display = 'block';
  document.getElementById('vista-qr').style.display = 'none';
  document.getElementById('modal-seleccion').style.display = 'flex';
}

window.confirmarReserva = async function () {
  const btn = document.getElementById('confirm-btn');
  const zonaNombre = document.getElementById('modal-zona-nombre').textContent;

  btn.innerHTML = '<span class="btn-spinner"></span>Reservando...';
  btn.disabled = true;

  try {
    const zonaRef = doc(db, 'estacionamientos', currentZonaId);
    const zonaSnap = await getDoc(zonaRef);
    const zonaData = zonaSnap.data();
    const cajones = zonaData.cajonesList || [];

    const cajonObj = cajones.find(c => c.id === currentCajonId);
    if (!cajonObj || cajonObj.estado !== 'libre') {
      mostrarNotificacion('❌ Ese cajón ya fue tomado. Elige otro.');
      btn.innerHTML = 'Confirmar Reservación';
      btn.disabled = false;
      cerrarModal();
      return;
    }

    const ahora = new Date();
    const expiraEn = new Date(ahora.getTime() + 15 * 60 * 1000);

    const nuevaLista = cajones.map(c =>
      c.id === currentCajonId
        ? { ...c, estado: 'reservado', reservadoPor: currentUser.uid, reservadoEn: ahora.toISOString(), expiraEn: expiraEn.toISOString() }
        : c
    );

    await updateDoc(zonaRef, { cajonesList: nuevaLista });

    const resRef = await addDoc(collection(db, 'reservaciones'), {
      uid: currentUser.uid,
      zonaId: currentZonaId,
      zonaNombre,
      cajonId: currentCajonId,
      estado: 'activa',
      creadoEn: ahora.toISOString(),
      expiraEn: expiraEn.toISOString(),
    });

    await updateDoc(doc(db, 'usuarios', currentUser.uid), {
      reservaActiva: { resId: resRef.id, zonaId: currentZonaId, cajonId: currentCajonId, zonaNombre, expiraEn: expiraEn.toISOString() }
    });
    if (userProfile) {
      userProfile.reservaActiva = { resId: resRef.id, zonaId: currentZonaId, cajonId: currentCajonId, zonaNombre, expiraEn: expiraEn.toISOString() };
    }

    generarQR(zonaNombre, currentCajonId);
    iniciarTemporizador(15 * 60);
    mostrarBadgeActivo(zonaNombre, currentCajonId);

    document.getElementById('vista-confirmacion').style.display = 'none';
    document.getElementById('vista-qr').style.display = 'block';

  } catch (err) {
    console.error('Error al reservar:', err);
    mostrarNotificacion('❌ Error al reservar. Intenta de nuevo.');
  }

  btn.innerHTML = 'Confirmar Reservación';
  btn.disabled = false;
};

function generarQR(zonaNombre, cajonId) {
  const qrData = JSON.stringify({
    uid: currentUser.uid,
    zona: zonaNombre,
    cajon: cajonId,
    ts: Date.now()
  });

  new QRious({
    element: document.getElementById('codigo-qr'),
    value: qrData,
    size: 170,
    foreground: '#FF6B00',
    background: '#FFFFFF'
  });

  document.getElementById('qr-zona-info').textContent = zonaNombre;
  document.getElementById('qr-cajon-info').textContent = cajonId;
  document.getElementById('qr-usuario-info').textContent = userProfile?.nombre || currentUser.email;
}

function iniciarTemporizador(segundos) {
  clearInterval(countdownTimer);
  let tiempo = segundos;

  countdownTimer = setInterval(async () => {
    tiempo--;
    const min = Math.floor(tiempo / 60);
    const segs = tiempo % 60;
    const str = `${min}:${segs < 10 ? '0' : ''}${segs}`;

    const display = document.getElementById('timer');
    if (display) {
      display.textContent = str;
      if (tiempo <= 120) display.classList.add('timer-urgent');
    }

    const badgeTimer = document.getElementById('active-res-timer');
    if (badgeTimer) badgeTimer.textContent = str;

    if (tiempo === 120) mostrarNotificacion('⏳ ¡Solo quedan 2 minutos para llegar!');

    if (tiempo <= 0) {
      clearInterval(countdownTimer);
      await liberarLugar(currentZonaId, currentCajonId, true);
      mostrarNotificacion('❌ Tiempo agotado. Tu lugar fue liberado.');
      cerrarModal();
      ocultarBadgeActivo();
    }
  }, 1000);
}

function reanudarTemporizador(expiraEnStr) {
  const expiraEn = new Date(expiraEnStr);
  const ahora = new Date();
  const restanMs = expiraEn - ahora;
  const restanSegs = Math.floor(restanMs / 1000);

  if (restanSegs <= 0) {
    liberarLugar(currentZonaId, currentCajonId, true);
    return;
  }

  iniciarTemporizador(restanSegs);
}

async function checkActiveReservation() {
  if (!userProfile?.reservaActiva) return;

  const { zonaId, cajonId, zonaNombre, expiraEn } = userProfile.reservaActiva;

  const ahora = new Date();
  const expira = new Date(expiraEn);
  if (ahora >= expira) {
    await liberarLugar(zonaId, cajonId, true);
    return;
  }

  currentZonaId = zonaId;
  currentCajonId = cajonId;

  mostrarBadgeActivo(zonaNombre, cajonId);
  reanudarTemporizador(expiraEn);
}

window.mostrarQRActivo = function () {
  if (!userProfile?.reservaActiva) return;
  const { zonaNombre, cajonId, expiraEn } = userProfile.reservaActiva;

  generarQR(zonaNombre, cajonId);

  const restanMs = new Date(expiraEn) - new Date();
  const restanSegs = Math.max(0, Math.floor(restanMs / 1000));
  const min = Math.floor(restanSegs / 60);
  const segs = restanSegs % 60;
  const timer = document.getElementById('timer');
  if (timer) timer.textContent = `${min}:${segs < 10 ? '0' : ''}${segs}`;

  document.getElementById('vista-confirmacion').style.display = 'none';
  document.getElementById('vista-qr').style.display = 'block';
  document.getElementById('modal-seleccion').style.display = 'flex';
};

async function liberarLugar(zonaId, cajonId, esAutomatico = false) {
  try {
    const zonaRef = doc(db, 'estacionamientos', zonaId);
    const zonaSnap = await getDoc(zonaRef);
    if (zonaSnap.exists()) {
      const cajones = zonaSnap.data().cajonesList || [];
      const nuevaLista = cajones.map(c =>
        c.id === cajonId
          ? { id: c.id, estado: 'libre', reservadoPor: null, reservadoEn: null, expiraEn: null }
          : c
      );
      await updateDoc(zonaRef, { cajonesList: nuevaLista });
    }

    if (userProfile?.reservaActiva?.resId) {
      await updateDoc(doc(db, 'reservaciones', userProfile.reservaActiva.resId), {
        estado: esAutomatico ? 'expirada' : 'cancelada',
        finalizadoEn: new Date().toISOString()
      });
    }

    await updateDoc(doc(db, 'usuarios', currentUser.uid), { reservaActiva: null });
    if (userProfile) userProfile.reservaActiva = null;

    clearInterval(countdownTimer);
    ocultarBadgeActivo();

    if (currentZonaId === zonaId) await loadPinStatus();

  } catch (err) {
    console.error('Error liberando lugar:', err);
  }
}

window.cancelarReservacionActual = async function () {
  if (!confirm('¿Confirmas cancelar tu reservación? El lugar quedará disponible para otros.')) return;

  await liberarLugar(currentZonaId, currentCajonId, false);
  mostrarNotificacion('✅ Reservación cancelada.');
  cerrarModal();
};

function mostrarBadgeActivo(zonaNombre, cajonId) {
  const badge = document.getElementById('active-res-badge');
  const info = document.getElementById('active-res-info');
  if (badge) badge.style.display = 'flex';
  if (info) info.textContent = `${zonaNombre} – ${cajonId}`;
}

function ocultarBadgeActivo() {
  const badge = document.getElementById('active-res-badge');
  if (badge) badge.style.display = 'none';
}

window.verReservaciones = async function () {
  const lista = document.getElementById('lista-reservas');
  lista.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:20px;">Cargando...</p>';
  document.getElementById('modal-historial').style.display = 'flex';

  try {
    const q = query(
      collection(db, 'reservaciones'),
      where('uid', '==', currentUser.uid),
      orderBy('creadoEn', 'desc')
    );
    const snap = await getDocs(q);
    const reservas = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (reservas.length === 0) {
      lista.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🅿️</div>
          <div class="empty-title">Sin reservaciones</div>
          <div class="empty-desc">Tus reservaciones aparecerán aquí</div>
        </div>`;
      return;
    }

    lista.innerHTML = '';
    reservas.forEach(res => {
      const card = document.createElement('div');
      card.className = 'reserva-card';
      const fecha = res.creadoEn ? new Date(res.creadoEn).toLocaleString('es-MX') : '—';
      const estadoEmoji = res.estado === 'activa' ? '🟢' : res.estado === 'cancelada' ? '🔴' : '⏱';
      card.innerHTML = `
        <div class="reserva-card-inner">
          <div>
            <strong>${estadoEmoji} ${res.zonaNombre}</strong><br>
            <span>Cajón: ${res.cajonId}</span><br>
            <small>${fecha}</small>
          </div>
          <span style="font-size:11px;color:var(--text-muted);font-weight:600;text-transform:uppercase;">${res.estado}</span>
        </div>`;
      lista.appendChild(card);
    });

  } catch (err) {
    console.error(err);
    lista.innerHTML = '<p style="text-align:center;color:var(--red-occupied);">Error al cargar historial.</p>';
  }
};

window.borrarHistorial = async function () {
  if (!confirm('¿Borrar el historial de reservaciones? (Solo las canceladas/expiradas)')) return;

  try {
    const q = query(
      collection(db, 'reservaciones'),
      where('uid', '==', currentUser.uid),
      where('estado', 'in', ['cancelada', 'expirada'])
    );
    const snap = await getDocs(q);
    for (const d of snap.docs) await deleteDoc(d.ref);
    await verReservaciones();
    mostrarNotificacion('🗑 Historial borrado.');
  } catch (e) {
    console.error(e);
  }
};

// ==================== SOPORTE CON 3 PESTAÑAS CORREGIDO ====================
window.abrirSoporte = function () {
  document.getElementById('modal-soporte').style.display = 'flex';
  switchSoporte('reglas'); // Mostrar reglas por defecto
};

window.switchSoporte = function (seccion) {
  // Obtener los tabs
  const tabReglas = document.getElementById('tabReglas');
  const tabReporte = document.getElementById('tabReporte');
  const tabTutorial = document.getElementById('tabTutorial');

  // Obtener las secciones
  const seccionReglas = document.getElementById('seccion-reglas');
  const seccionReporte = document.getElementById('seccion-reporte');
  const seccionTutorial = document.getElementById('seccion-tutorial');

  // PRIMERO: Ocultar TODAS las secciones
  if (seccionReglas) seccionReglas.classList.add('hidden');
  if (seccionReporte) seccionReporte.classList.add('hidden');
  if (seccionTutorial) seccionTutorial.classList.add('hidden');

  // SEGUNDO: Remover clase active de TODOS los tabs
  if (tabReglas) tabReglas.classList.remove('active');
  if (tabReporte) tabReporte.classList.remove('active');
  if (tabTutorial) tabTutorial.classList.remove('active');

  // TERCERO: Mostrar SOLO la sección seleccionada y activar su tab
  if (seccion === 'reglas') {
    if (tabReglas) tabReglas.classList.add('active');
    if (seccionReglas) seccionReglas.classList.remove('hidden');
  }
  else if (seccion === 'reporte') {
    if (tabReporte) tabReporte.classList.add('active');
    if (seccionReporte) seccionReporte.classList.remove('hidden');
  }
  else if (seccion === 'tutorial') {
    if (tabTutorial) tabTutorial.classList.add('active');
    if (seccionTutorial) seccionTutorial.classList.remove('hidden');
  }
};

window.enviarReporte = async function () {
  const tipo = document.getElementById('tipoReporte').value;
  const desc = document.getElementById('descReporte').value.trim();

  if (!desc) { mostrarNotificacion('⚠️ Escribe una descripción del problema.'); return; }

  try {
    await addDoc(collection(db, 'reportes'), {
      uid: currentUser.uid,
      nombre: userProfile?.nombre || 'Anónimo',
      tipo,
      descripcion: desc,
      zona: currentZonaId || null,
      cajon: currentCajonId || null,
      creadoEn: new Date().toISOString()
    });
    document.getElementById('descReporte').value = '';
    document.getElementById('modal-soporte').style.display = 'none';
    mostrarNotificacion('✅ Reporte enviado. ¡Gracias!');
  } catch (e) {
    mostrarNotificacion('❌ Error al enviar reporte.');
  }
};

window.mostrarNotificacion = function (msg) {
  const banner = document.getElementById('notif-banner');
  if (!banner) { console.log(msg); return; }
  banner.textContent = msg;
  banner.classList.add('show');
  setTimeout(() => banner.classList.remove('show'), 4500);
};

window.cerrarModal = function () {
  document.getElementById('modal-seleccion').style.display = 'none';
};

function cargarTema() {
  const theme = localStorage.getItem('theme') || 'light';
  document.body.classList.toggle('dark-mode', theme === 'dark');
}
