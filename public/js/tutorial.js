/**
 * ISS Hunter — Interactive Tutorial Coach-mark Module
 *
 * Mengelola overlay panduan visual interaktif untuk pemain:
 * - Menggunakan icon SVG vektor murni (Lucide / Iconify standar) tanpa emoji
 * - Spotlight highlight dengan efek glow
 * - Panah penunjuk visual (directional arrow) langsung ke target fungsi/tombol
 * - Beacon indikator beranimasi dengan ikon vektor
 * - Navigasi langkah (Next, Prev, Skip, Esc, Arrow Keys, Focus Trap)
 */

import { setTutorialDone } from './store.js';
import { createIcon } from './icons.js';

let activeOverlay = null;
let currentStep = 0;
let resizeListenerRemover = null;

const callbacks = {
  onComplete: null,
};

const TUTORIAL_STEPS = [
  {
    step: 1,
    title: 'Posisi Nyata ISS (Live)',
    desc: 'Titik ikon ini menunjukkan posisi real-time Stasiun Luar Angkasa Internasional (ISS) yang mengorbit Bumi di ketinggian ~400 km dengan kecepatan dahsyat ~27.600 km/jam (~7,6 km/detik). Panah di sekeliling ikon menunjukkan arah lajunya.',
    targetSelector: '.iss-custom-marker',
    iconName: 'crosshair',
    beaconText: 'Posisi ISS Live',
    fallbackSelector: '#map-container',
  },
  {
    step: 2,
    title: 'Garis Jejak Orbit & Legenda',
    desc: 'Garis di belakang ISS adalah jejak lintasannya beberapa menit terakhir. ISS memiliki kemiringan orbit 51,6° dan menempuh 1 putaran penuh Bumi dalam ~92 menit. Gunakan lengkungan jejak ini untuk memproyeksikan ke mana ISS akan meluncur!',
    targetSelector: '#map-legend',
    iconName: 'route',
    beaconText: 'Legenda & Jejak Orbit',
    fallbackSelector: '#map-container',
  },
  {
    step: 3,
    title: 'Misi Target Waktu (10–30 Menit)',
    desc: 'Setiap ronde memiliki tantangan unik: target waktu diacak otomatis oleh server antara 10 hingga 30 menit ke depan! Tugasmu adalah memprediksi di belahan bumi mana ISS akan berada tepat saat waktu target tersebut tiba.',
    targetSelector: '#mission-target-badge, #side-panel, #bottom-sheet',
    iconName: 'clock',
    beaconText: 'Target Acak (10-30 Menit)',
    fallbackSelector: '#side-panel',
  },
  {
    step: 4,
    title: 'Tombol "Mulai Ronde"',
    desc: 'Klik tombol ini untuk memulai ronde baru. Waktu countdown akan mulai berjalan dan peta langsung siap menerima titik tebakan koordinatmu.',
    targetSelector: '#start-round-btn, #side-panel .btn-primary, #bottom-sheet .btn-primary',
    iconName: 'rocket',
    beaconText: 'Mulai Ronde',
    fallbackSelector: '#side-panel',
  },
  {
    step: 5,
    title: 'Cara Menaruh Tebakan di Peta',
    desc: 'Cukup klik di titik mana saja di peta pada arah terbang ISS untuk meletakkan pin tebakanmu. Pin tebakan dapat kamu geser (drag) untuk mengatur ulang posisinya, atau tekan tombol Esc untuk membatalkan penanda.',
    targetSelector: '#map-container',
    iconName: 'map-pin',
    beaconText: 'Klik Peta Disini',
    fallbackSelector: '#game-viewport',
  },
  {
    step: 6,
    title: 'Tombol "Kunci Tebakan" & Skor',
    desc: 'Setelah yakin dengan koordinat tebakanmu, klik tombol "Kunci Tebakan" (atau tekan Enter). Server akan mengukur jarak Haversine (km) antara tebakanmu ke posisi nyata ISS. Semakin dekat jaraknya, semakin tinggi skormu (hingga 1.000 poin)!',
    targetSelector: '#lock-guess-btn, #side-panel, #bottom-sheet',
    iconName: 'lock',
    beaconText: 'Kunci Tebakan',
    fallbackSelector: '#side-panel',
  },
  {
    step: 7,
    title: 'Tab Peringkat & Profil',
    desc: 'Gunakan tab navigasi di bagian atas untuk melihat peringkatmu di Papan Peringkat (Monthly, Weekly, Daily) dan memantau riwayat ronde serta level akurasimu di tab Profil.',
    targetSelector: '#panel-tab-nav, .tabs',
    iconName: 'trophy',
    beaconText: 'Papan Peringkat & Profil',
    fallbackSelector: '#side-panel',
  },
];

export function isTutorialActive() {
  return activeOverlay !== null;
}

export function closeInteractiveTutorial(markDone = true) {
  if (resizeListenerRemover) {
    resizeListenerRemover();
    resizeListenerRemover = null;
  }

  if (activeOverlay) {
    activeOverlay.remove();
    activeOverlay = null;
  }

  document.removeEventListener('keydown', handleKeydown);

  if (markDone) {
    setTutorialDone(true);
  }

  if (callbacks.onComplete) {
    callbacks.onComplete();
  }
}

function handleKeydown(e) {
  if (!activeOverlay) return;

  if (e.key === 'Escape') {
    e.preventDefault();
    closeInteractiveTutorial(true);
    return;
  }

  if (e.key === 'ArrowRight' || e.key === 'Enter') {
    if (currentStep < TUTORIAL_STEPS.length - 1) {
      e.preventDefault();
      goToStep(currentStep + 1);
    } else {
      e.preventDefault();
      closeInteractiveTutorial(true);
    }
    return;
  }

  if (e.key === 'ArrowLeft') {
    if (currentStep > 0) {
      e.preventDefault();
      goToStep(currentStep - 1);
    }
    return;
  }

  // Focus trap
  if (e.key === 'Tab') {
    const focusable = activeOverlay.querySelectorAll(
      'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
}

function updateOverlayAndArrow(targetEl, stepDef) {
  const spotlightBox = document.getElementById('tutorial-spotlight-box');
  const card = document.getElementById('tutorial-card');
  const arrow = document.getElementById('tutorial-card-arrow');
  const beacon = document.getElementById('tutorial-pointer-beacon');
  const beaconIconEl = document.getElementById('tutorial-beacon-icon');
  const beaconTextEl = document.getElementById('tutorial-beacon-text');

  if (!card) return;

  if (!targetEl) {
    if (spotlightBox) spotlightBox.style.display = 'none';
    if (beacon) beacon.style.display = 'none';
    if (arrow) arrow.style.display = 'none';
    card.style.top = '50%';
    card.style.left = '50%';
    card.style.transform = 'translate(-50%, -50%)';
    return;
  }

  const targetRect = targetEl.getBoundingClientRect();
  if (targetRect.width === 0 || targetRect.height === 0) {
    if (spotlightBox) spotlightBox.style.display = 'none';
    if (beacon) beacon.style.display = 'none';
    if (arrow) arrow.style.display = 'none';
    card.style.top = '50%';
    card.style.left = '50%';
    card.style.transform = 'translate(-50%, -50%)';
    return;
  }

  // Spotlight Box
  const pad = 8;
  const sTop = Math.max(0, targetRect.top - pad);
  const sLeft = Math.max(0, targetRect.left - pad);
  const sWidth = targetRect.width + pad * 2;
  const sHeight = targetRect.height + pad * 2;

  if (spotlightBox) {
    spotlightBox.style.display = 'block';
    spotlightBox.style.top = `${sTop}px`;
    spotlightBox.style.left = `${sLeft}px`;
    spotlightBox.style.width = `${sWidth}px`;
    spotlightBox.style.height = `${sHeight}px`;
  }

  // Pointer Beacon dengan Icon Vektor SVG
  if (beacon) {
    beacon.style.display = 'flex';
    if (beaconIconEl) {
      beaconIconEl.replaceChildren(createIcon(stepDef.iconName, 14));
    }
    if (beaconTextEl) {
      beaconTextEl.textContent = stepDef.beaconText || 'Fungsi Ini';
    }
    const bTop = Math.max(8, sTop - 34);
    const bLeft = Math.min(window.innerWidth - 180, Math.max(10, sLeft + sWidth / 2 - 60));
    beacon.style.top = `${bTop}px`;
    beacon.style.left = `${bLeft}px`;
  }

  // Dynamic Card & Arrow Placement
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const cardW = Math.min(390, viewportW - 24);
  const cardH = 260;
  const gap = 20;

  card.style.transform = 'none';
  card.style.width = `${cardW}px`;

  if (arrow) {
    arrow.style.display = 'block';
    arrow.className = 'tutorial-arrow';
  }

  if (viewportW <= 768) {
    // Layar ponsel/tablet kecil
    if (targetRect.top > viewportH / 2) {
      const cTop = Math.max(12, sTop - cardH - gap);
      card.style.top = `${cTop}px`;
      card.style.left = `${(viewportW - cardW) / 2}px`;
      if (arrow) arrow.classList.add('arrow-bottom');
    } else {
      const cTop = Math.min(viewportH - cardH - 12, sTop + sHeight + gap);
      card.style.top = `${cTop}px`;
      card.style.left = `${(viewportW - cardW) / 2}px`;
      if (arrow) arrow.classList.add('arrow-top');
    }
  } else {
    // Layar Desktop
    const spaceLeft = targetRect.left;
    const spaceRight = viewportW - targetRect.right;
    const spaceBottom = viewportH - targetRect.bottom;

    if (spaceLeft >= cardW + gap) {
      // Tempatkan kartu di sebelah KIRI target (panah ke kanan)
      card.style.left = `${targetRect.left - cardW - gap}px`;
      const cTop = Math.max(16, Math.min(viewportH - cardH - 16, targetRect.top));
      card.style.top = `${cTop}px`;
      if (arrow) arrow.classList.add('arrow-right');
    } else if (spaceRight >= cardW + gap) {
      // Tempatkan kartu di sebelah KANAN target (panah ke kiri)
      card.style.left = `${targetRect.right + gap}px`;
      const cTop = Math.max(16, Math.min(viewportH - cardH - 16, targetRect.top));
      card.style.top = `${cTop}px`;
      if (arrow) arrow.classList.add('arrow-left');
    } else if (spaceBottom >= cardH + gap) {
      // Tempatkan kartu di BAWAH target (panah ke atas)
      card.style.top = `${targetRect.bottom + gap}px`;
      card.style.left = `${Math.max(16, Math.min(viewportW - cardW - 16, targetRect.left + (targetRect.width - cardW) / 2))}px`;
      if (arrow) arrow.classList.add('arrow-top');
    } else {
      // Tempatkan kartu di ATAS target (panah ke bawah)
      card.style.top = `${Math.max(16, targetRect.top - cardH - gap)}px`;
      card.style.left = `${Math.max(16, Math.min(viewportW - cardW - 16, targetRect.left + (targetRect.width - cardW) / 2))}px`;
      if (arrow) arrow.classList.add('arrow-bottom');
    }
  }
}

function goToStep(stepIndex) {
  currentStep = stepIndex;
  const stepDef = TUTORIAL_STEPS[currentStep];

  const announce = document.getElementById('tutorial-aria-announce');
  if (announce) {
    announce.textContent = `Langkah ${stepDef.step} dari ${TUTORIAL_STEPS.length}: ${stepDef.title}. ${stepDef.desc}`;
  }

  const stepBadge = document.getElementById('tutorial-step-badge');
  if (stepBadge) {
    stepBadge.replaceChildren(
      createIcon('help-circle', 12),
      document.createTextNode(` Langkah ${stepDef.step} dari ${TUTORIAL_STEPS.length}`),
    );
  }

  const titleEl = document.getElementById('tutorial-step-title');
  if (titleEl) {
    titleEl.replaceChildren(
      createIcon(stepDef.iconName, 18),
      document.createTextNode(` ${stepDef.title}`),
    );
  }

  const descEl = document.getElementById('tutorial-step-desc');
  if (descEl) {
    descEl.textContent = stepDef.desc;
  }

  const prevBtn = document.getElementById('tutorial-btn-prev');
  if (prevBtn) {
    prevBtn.style.visibility = currentStep === 0 ? 'hidden' : 'visible';
    prevBtn.replaceChildren(createIcon('chevron-left', 14), document.createTextNode(' Kembali'));
  }

  const nextBtn = document.getElementById('tutorial-btn-next');
  if (nextBtn) {
    if (currentStep === TUTORIAL_STEPS.length - 1) {
      nextBtn.replaceChildren(createIcon('check', 14), document.createTextNode(' Mulai Bermain!'));
    } else {
      nextBtn.replaceChildren(document.createTextNode('Lanjut '), createIcon('chevron-right', 14));
    }
  }

  // Cari elemen target
  let targetEl = null;
  if (stepDef.targetSelector) {
    targetEl = document.querySelector(stepDef.targetSelector);
  }
  if (!targetEl && stepDef.fallbackSelector) {
    targetEl = document.querySelector(stepDef.fallbackSelector);
  }

  updateOverlayAndArrow(targetEl, stepDef);

  if (nextBtn) {
    nextBtn.focus();
  }
}

export function startInteractiveTutorial({ onComplete = null } = {}) {
  callbacks.onComplete = onComplete;
  currentStep = 0;

  if (activeOverlay) {
    activeOverlay.remove();
  }

  // 1. Root Overlay
  const overlay = document.createElement('div');
  overlay.id = 'tutorial-coachmark-overlay';
  overlay.className = 'tutorial-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'tutorial-step-title');
  overlay.setAttribute('aria-describedby', 'tutorial-step-desc');

  // Live announcer untuk screen reader
  const announce = document.createElement('div');
  announce.id = 'tutorial-aria-announce';
  announce.setAttribute('aria-live', 'polite');
  announce.className = 'sr-only';
  overlay.append(announce);

  // Spotlight highlight box
  const spotlightBox = document.createElement('div');
  spotlightBox.id = 'tutorial-spotlight-box';
  spotlightBox.className = 'tutorial-spotlight';
  overlay.append(spotlightBox);

  // Floating Animated Pointer Beacon on Target
  const beacon = document.createElement('div');
  beacon.id = 'tutorial-pointer-beacon';
  beacon.className = 'tutorial-pointer-beacon';

  const beaconIcon = document.createElement('span');
  beaconIcon.id = 'tutorial-beacon-icon';

  const beaconText = document.createElement('span');
  beaconText.id = 'tutorial-beacon-text';
  beaconText.textContent = 'Target';

  beacon.append(beaconIcon, beaconText);
  overlay.append(beacon);

  // Dialog Card
  const card = document.createElement('div');
  card.id = 'tutorial-card';
  card.className = 'tutorial-card';

  // Arrow connected to card
  const arrow = document.createElement('div');
  arrow.id = 'tutorial-card-arrow';
  arrow.className = 'tutorial-arrow';
  card.append(arrow);

  const cardHeader = document.createElement('div');
  cardHeader.className = 'tutorial-card-header';

  const badge = document.createElement('span');
  badge.id = 'tutorial-step-badge';
  badge.className = 'tag tag-accent';
  badge.style.display = 'inline-flex';
  badge.style.alignItems = 'center';
  badge.style.gap = '4px';
  badge.replaceChildren(
    createIcon('help-circle', 12),
    document.createTextNode(` Langkah 1 dari ${TUTORIAL_STEPS.length}`),
  );

  const skipBtn = document.createElement('button');
  skipBtn.type = 'button';
  skipBtn.className = 'btn btn-ghost btn-sm';
  skipBtn.textContent = 'Lewati';
  skipBtn.title = 'Tutup panduan';
  skipBtn.addEventListener('click', () => {
    closeInteractiveTutorial(true);
  });

  cardHeader.append(badge, skipBtn);

  const cardBody = document.createElement('div');
  cardBody.className = 'tutorial-card-body';

  const title = document.createElement('h2');
  title.id = 'tutorial-step-title';
  title.className = 'tutorial-title';
  title.style.display = 'flex';
  title.style.alignItems = 'center';
  title.style.gap = '8px';

  const desc = document.createElement('p');
  desc.id = 'tutorial-step-desc';
  desc.className = 'tutorial-desc';

  cardBody.append(title, desc);

  const cardFooter = document.createElement('div');
  cardFooter.className = 'tutorial-card-footer';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.id = 'tutorial-btn-prev';
  prevBtn.className = 'btn btn-ghost btn-sm';
  prevBtn.replaceChildren(createIcon('chevron-left', 14), document.createTextNode(' Kembali'));
  prevBtn.addEventListener('click', () => {
    if (currentStep > 0) goToStep(currentStep - 1);
  });

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.id = 'tutorial-btn-next';
  nextBtn.className = 'btn btn-primary btn-sm';
  nextBtn.replaceChildren(document.createTextNode('Lanjut '), createIcon('chevron-right', 14));
  nextBtn.addEventListener('click', () => {
    if (currentStep < TUTORIAL_STEPS.length - 1) {
      goToStep(currentStep + 1);
    } else {
      closeInteractiveTutorial(true);
    }
  });

  cardFooter.append(prevBtn, nextBtn);
  card.append(cardHeader, cardBody, cardFooter);
  overlay.append(card);

  document.body.append(overlay);
  activeOverlay = overlay;

  document.addEventListener('keydown', handleKeydown);

  // Resize & scroll repositioning listener
  const handleResize = () => {
    if (!activeOverlay) return;
    const stepDef = TUTORIAL_STEPS[currentStep];
    let targetEl = null;
    if (stepDef.targetSelector) {
      targetEl = document.querySelector(stepDef.targetSelector);
    }
    if (!targetEl && stepDef.fallbackSelector) {
      targetEl = document.querySelector(stepDef.fallbackSelector);
    }
    updateOverlayAndArrow(targetEl, stepDef);
  };

  window.addEventListener('resize', handleResize);
  window.addEventListener('scroll', handleResize, true);
  resizeListenerRemover = () => {
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('scroll', handleResize, true);
  };

  goToStep(0);
}
