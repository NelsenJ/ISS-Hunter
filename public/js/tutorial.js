/**
 * ISS Hunter — Interactive Tutorial Coach-mark Module
 *
 * Mengelola overlay dialog interaktif untuk pemain baru:
 * - Langkah 1: Pengenalan ISS dan panah arah orbit
 * - Langkah 2: Garis jejak orbit 10 menit ke belakang
 * - Langkah 3: Interaksi klik peta langsung oleh pemain
 * - Langkah 4: Kunci tebakan
 * - Langkah 5: Penjelasan hasil dan opsi mulai mode latihan
 *
 * Aksesibilitas: role="dialog", aria-live, keyboard navigation (Esc, Enter, Panah), focus trap.
 */

import { setTutorialDone } from './store.js';

let activeOverlay = null;
let currentStep = 0;
let mapClickListenerRemover = null;
let mapHasBeenClicked = false;
const callbacks = {
  onComplete: null,
  onStartPractice: null,
};

const TUTORIAL_STEPS = [
  {
    step: 1,
    title: 'ISS & Arah Orbit',
    desc: 'ISS (Stasiun Luar Angkasa Internasional) mengorbit Bumi pada ketinggian ~400 km dengan kecepatan dahsyat ~27.600 km/jam (~7,6 km/detik). Panah di sekeliling target menunjukkan arah terbangnya saat ini.',
    targetSelector: '.iss-custom-marker',
  },
  {
    step: 2,
    title: 'Garis Jejak Orbit',
    desc: 'Garis berwarna aksen di belakang ISS adalah jalurnya selama 10 menit ke belakang. Mengorbit dengan kemiringan 51,6° terhadap Khatulistiwa, ISS menempuh ~4.600 km (~39° bujur) setiap 10 menit dan menyelesaikan 1 putaran Bumi dalam ~92 menit.',
    targetSelector: '.iss-custom-marker',
  },
  {
    step: 3,
    title: 'Coba Klik di Peta!',
    desc: 'Sekarang giliranmu! Perhatikan arah panah dan lengkungan jejak orbit. Klik salah satu titik di peta pada arah terbang ISS untuk meletakkan pin tebakanmu.',
    targetSelector: '#map-container',
    requiresMapClick: true,
  },
  {
    step: 4,
    title: 'Kunci Tebakan',
    desc: 'Setelah menaruh tebakan, tombol "Kunci Tebakan" digunakan untuk mengirim koordinatmu ke server. Server kemudian memverifikasi jarak tebakan ke posisi nyata ISS pada menit ke-10.',
    targetSelector: '#side-panel, #bottom-sheet',
  },
  {
    step: 5,
    title: 'Hasil & Mode Latihan',
    desc: 'Skor dihitung dari kedekatan tebakanmu ke posisi nyata (maksimal 1.000 poin). Sebelum mulai ronde sungguhan di leaderboard, kamu bisa mencoba Ronde Latihan terlebih dahulu dengan bantuan garis proyeksi!',
    targetSelector: null,
  },
];

export function isTutorialActive() {
  return activeOverlay !== null;
}

export function closeInteractiveTutorial(markDone = true) {
  if (mapClickListenerRemover) {
    mapClickListenerRemover();
    mapClickListenerRemover = null;
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

  if (e.key === 'ArrowRight') {
    const stepDef = TUTORIAL_STEPS[currentStep];
    if (!stepDef.requiresMapClick || mapHasBeenClicked) {
      if (currentStep < TUTORIAL_STEPS.length - 1) {
        e.preventDefault();
        goToStep(currentStep + 1);
      }
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

function updateSpotlight(targetEl) {
  const spotlightBox = document.getElementById('tutorial-spotlight-box');
  if (!spotlightBox) return;

  if (!targetEl) {
    spotlightBox.style.display = 'none';
    return;
  }

  const rect = targetEl.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    spotlightBox.style.display = 'none';
    return;
  }

  spotlightBox.style.display = 'block';
  spotlightBox.style.top = `${Math.max(8, rect.top - 8)}px`;
  spotlightBox.style.left = `${Math.max(8, rect.left - 8)}px`;
  spotlightBox.style.width = `${rect.width + 16}px`;
  spotlightBox.style.height = `${rect.height + 16}px`;
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
    stepBadge.textContent = `Langkah ${stepDef.step} dari ${TUTORIAL_STEPS.length}`;
  }

  const titleEl = document.getElementById('tutorial-step-title');
  if (titleEl) {
    titleEl.textContent = stepDef.title;
  }

  const descEl = document.getElementById('tutorial-step-desc');
  if (descEl) {
    descEl.textContent = stepDef.desc;
  }

  const hintEl = document.getElementById('tutorial-action-hint');
  if (hintEl) {
    if (stepDef.requiresMapClick && !mapHasBeenClicked) {
      hintEl.style.display = 'block';
      hintEl.textContent = 'Silakan klik di area peta mana saja untuk melanjutkan.';
    } else {
      hintEl.style.display = 'none';
    }
  }

  const prevBtn = document.getElementById('tutorial-btn-prev');
  if (prevBtn) {
    prevBtn.style.visibility = currentStep === 0 ? 'hidden' : 'visible';
  }

  const nextBtn = document.getElementById('tutorial-btn-next');
  if (nextBtn) {
    if (stepDef.requiresMapClick && !mapHasBeenClicked) {
      nextBtn.disabled = true;
      nextBtn.textContent = 'Klik Peta Dulu';
    } else if (currentStep === TUTORIAL_STEPS.length - 1) {
      nextBtn.disabled = false;
      nextBtn.textContent = 'Mulai Latihan';
    } else {
      nextBtn.disabled = false;
      nextBtn.textContent = 'Lanjut';
    }
  }

  const realRoundBtn = document.getElementById('tutorial-btn-real');
  if (realRoundBtn) {
    realRoundBtn.style.display = currentStep === TUTORIAL_STEPS.length - 1 ? 'inline-flex' : 'none';
  }

  // Temukan elemen target untuk spotlight
  let targetEl = null;
  if (stepDef.targetSelector) {
    targetEl = document.querySelector(stepDef.targetSelector);
  }
  updateSpotlight(targetEl);

  // Fokuskan tombol primary untuk kenyamanan navigasi keyboard
  if (nextBtn && !nextBtn.disabled) {
    nextBtn.focus();
  } else if (prevBtn && currentStep > 0) {
    prevBtn.focus();
  }
}

export function startInteractiveTutorial({ onComplete = null, onStartPractice = null } = {}) {
  callbacks.onComplete = onComplete;
  callbacks.onStartPractice = onStartPractice;
  currentStep = 0;
  mapHasBeenClicked = false;

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

  // Card dialog
  const card = document.createElement('div');
  card.className = 'tutorial-card';

  const cardHeader = document.createElement('div');
  cardHeader.className = 'tutorial-card-header';

  const badge = document.createElement('span');
  badge.id = 'tutorial-step-badge';
  badge.className = 'tag tag-accent';
  badge.textContent = `Langkah 1 dari ${TUTORIAL_STEPS.length}`;

  const skipBtn = document.createElement('button');
  skipBtn.type = 'button';
  skipBtn.className = 'btn btn-ghost btn-sm';
  skipBtn.textContent = 'Lewati';
  skipBtn.addEventListener('click', () => {
    closeInteractiveTutorial(true);
  });

  cardHeader.append(badge, skipBtn);

  const cardBody = document.createElement('div');
  cardBody.className = 'tutorial-card-body';

  const title = document.createElement('h2');
  title.id = 'tutorial-step-title';
  title.className = 'tutorial-title';

  const desc = document.createElement('p');
  desc.id = 'tutorial-step-desc';
  desc.className = 'tutorial-desc';

  const hint = document.createElement('p');
  hint.id = 'tutorial-action-hint';
  hint.className = 'tutorial-hint';
  hint.style.display = 'none';

  cardBody.append(title, desc, hint);

  const cardFooter = document.createElement('div');
  cardFooter.className = 'tutorial-card-footer';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.id = 'tutorial-btn-prev';
  prevBtn.className = 'btn btn-ghost';
  prevBtn.textContent = 'Kembali';
  prevBtn.addEventListener('click', () => {
    if (currentStep > 0) goToStep(currentStep - 1);
  });

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.id = 'tutorial-btn-next';
  nextBtn.className = 'btn btn-primary';
  nextBtn.textContent = 'Lanjut';
  nextBtn.addEventListener('click', () => {
    if (currentStep < TUTORIAL_STEPS.length - 1) {
      goToStep(currentStep + 1);
    } else {
      // Langkah terakhir: mulai ronde latihan
      closeInteractiveTutorial(true);
      if (callbacks.onStartPractice) {
        callbacks.onStartPractice();
      }
    }
  });

  const realRoundBtn = document.createElement('button');
  realRoundBtn.type = 'button';
  realRoundBtn.id = 'tutorial-btn-real';
  realRoundBtn.className = 'btn btn-secondary';
  realRoundBtn.style.display = 'none';
  realRoundBtn.textContent = 'Mulai Ronde Sungguhan';
  realRoundBtn.addEventListener('click', () => {
    closeInteractiveTutorial(true);
    if (callbacks.onComplete) {
      callbacks.onComplete();
    }
  });

  cardFooter.append(prevBtn, realRoundBtn, nextBtn);
  card.append(cardHeader, cardBody, cardFooter);
  overlay.append(card);

  document.body.append(overlay);
  activeOverlay = overlay;

  document.addEventListener('keydown', handleKeydown);

  // Monitor klik pada map jika di langkah 3
  const mapEl = document.getElementById('map-container');
  if (mapEl) {
    const handleMapClick = () => {
      if (currentStep === 2) {
        mapHasBeenClicked = true;
        const hintEl = document.getElementById('tutorial-action-hint');
        if (hintEl) {
          hintEl.textContent = 'Bagus! Titik telah dipilih. Klik "Lanjut" untuk melanjutkan.';
          hintEl.style.color = 'var(--success)';
        }
        const nextBtnEl = document.getElementById('tutorial-btn-next');
        if (nextBtnEl) {
          nextBtnEl.disabled = false;
          nextBtnEl.textContent = 'Lanjut';
          nextBtnEl.focus();
        }
      }
    };

    mapEl.addEventListener('click', handleMapClick, { capture: true });
    mapClickListenerRemover = () => {
      mapEl.removeEventListener('click', handleMapClick, { capture: true });
    };
  }

  goToStep(0);
}
