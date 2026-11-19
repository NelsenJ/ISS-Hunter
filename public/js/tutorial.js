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

import { setTutorialDone, getState } from './store.js';
import { createIcon } from './icons.js';
import { setBottomSheetExpanded, setActiveTab, getActiveTab } from './ui.js';
import { centerOnIss } from './map.js';

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
    expandSheet: false, // Tutup panel agar peta terlihat luas
  },
  {
    step: 2,
    title: 'Garis Jejak Orbit & Legenda',
    desc: 'Garis di belakang ISS adalah jejak lintasannya beberapa menit terakhir. ISS memiliki kemiringan orbit 51,6° dan menempuh 1 putaran penuh Bumi dalam ~92 menit. Gunakan lengkungan jejak ini untuk memproyeksikan ke mana ISS akan meluncur!',
    targetSelector: '#map-legend',
    iconName: 'route',
    beaconText: 'Legenda & Jejak Orbit',
    fallbackSelector: '#map-container',
    expandSheet: false, // Tutup panel agar legenda terlihat jelas
  },
  {
    step: 3,
    title: 'Misi Target Waktu (10–30 Menit)',
    desc: 'Setiap ronde memiliki tantangan unik: target waktu diacak antara 10 hingga 30 menit ke depan! Tugasmu adalah memprediksi di belahan bumi mana ISS akan berada tepat saat waktu target tiba. Panel permainan otomatis dibuka pada langkah ini.',
    targetSelector: '#mission-target-badge, .state-box',
    iconName: 'clock',
    beaconText: 'Target Acak (10-30 Menit)',
    fallbackSelector: '.state-box, .bottom-sheet-body, .side-panel-body, #bottom-sheet',
    expandSheet: true, // Buka panel permainan
    targetTab: 'round', // Beralih ke tab Permainan jika pemain sedang di tab lain
  },
  {
    step: 4,
    title: 'Tombol "Mulai Ronde"',
    desc: 'Ketuk tombol ini untuk memulai ronde baru. Countdown akan mulai berjalan dan peta langsung siap menerima titik tebakanmu.',
    targetSelector: '#start-round-btn, .btn-primary',
    iconName: 'rocket',
    beaconText: 'Mulai Ronde',
    fallbackSelector: '.btn-primary, #bottom-sheet',
    expandSheet: true,
    targetTab: 'round',
  },
  {
    step: 5,
    title: 'Cara Menaruh Tebakan di Peta',
    desc: 'Cukup ketuk titik mana saja di peta pada arah terbang ISS untuk meletakkan pin tebakanmu. Di HP, panel ditutup agar area peta leluasa. Pin tebakan bisa digeser, atau tekan tombol Esc untuk membatalkan.',
    targetSelector: '#map-container',
    iconName: 'map-pin',
    beaconText: 'Ketuk Peta Disini',
    fallbackSelector: '#game-viewport',
    expandSheet: false, // Tutup panel agar peta leluasa diklik
  },
  {
    step: 6,
    title: 'Tombol "Kunci Tebakan" & Skor',
    desc: 'Setelah yakin dengan tebakanmu, ketuk "Kunci Tebakan". Server mengukur jarak Haversine (km) antara tebakanmu ke posisi nyata ISS. Semakin dekat jaraknya, semakin tinggi skormu (hingga 1.000 poin)!',
    targetSelector: '#lock-guess-btn, .state-box, .btn-primary',
    iconName: 'lock',
    beaconText: 'Kunci Tebakan',
    fallbackSelector: '.state-box, .bottom-sheet-body, .side-panel-body',
    expandSheet: true,
    targetTab: 'round',
  },
  {
    step: 7,
    title: 'Tab Peringkat & Profil',
    desc: 'Gunakan tab navigasi untuk melihat peringkat di Papan Peringkat (Bulanan, Mingguan, Harian) dan memantau statistikmu di tab Profil. Di HP, tab ada di dalam panel bawah.',
    targetSelector: '#panel-tab-nav, .tabs',
    iconName: 'trophy',
    beaconText: 'Papan Peringkat & Profil',
    fallbackSelector: '.tabs, #bottom-sheet',
    expandSheet: true,
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

  // Kembalikan status panel bawah ke kondisi awal di HP
  if (typeof window !== 'undefined' && window.innerWidth <= 768) {
    const roundState = typeof getState === 'function' ? getState()?.roundStatus : 'idle';
    if (roundState !== 'active' && roundState !== 'result') {
      setBottomSheetExpanded(false);
    }
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

function resolveTarget(stepDef) {
  if (!stepDef) return null;

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  const panelContainer = isMobile
    ? document.getElementById('bottom-sheet')
    : document.getElementById('side-panel');

  const tryFindVisible = (selectorStr) => {
    if (!selectorStr) return null;
    const parts = selectorStr.split(',').map((s) => s.trim()).filter(Boolean);

    for (const selector of parts) {
      // 1. Jika langkah terkait panel, prioritaskan cari di dalam kontainer panel aktif
      if (stepDef.expandSheet && panelContainer) {
        try {
          const scopedEls = panelContainer.querySelectorAll(selector);
          for (const el of scopedEls) {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) return el;
          }
        } catch {
          // Abaikan kesalahan querySelector
        }
      }

      // 2. Cari di dokumen global, tapi HANYA ambil elemen yang benar-benar visible (width & height > 0)
      try {
        const allEls = document.querySelectorAll(selector);
        for (const el of allEls) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) return el;
        }
      } catch {
        // Abaikan kesalahan querySelector
      }
    }
    return null;
  };

  let targetEl = tryFindVisible(stepDef.targetSelector);
  if (!targetEl && stepDef.fallbackSelector) {
    targetEl = tryFindVisible(stepDef.fallbackSelector);
  }

  // Fallback terakhir: jika elemen panel, gunakan kontainer panel itu sendiri jika terlihat
  if (!targetEl && stepDef.expandSheet && panelContainer) {
    const r = panelContainer.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return panelContainer;
  }

  return targetEl;
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

  // Dynamic Card & Arrow Placement
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const cardW = Math.min(390, viewportW - 24);
  const cardH = 260;
  const gap = 20;
  let cardPlacedAbove = false;

  card.style.transform = 'none';
  card.style.width = `${cardW}px`;

  if (arrow) {
    arrow.style.display = 'block';
    arrow.className = 'tutorial-arrow';
  }

  if (viewportW <= 768) {
    // Layar ponsel: selalu posisikan tengah secara horizontal
    const headerH = 60;
    card.style.left = `${(viewportW - cardW) / 2}px`;

    const spaceBelow = viewportH - targetRect.bottom;

    if (spaceBelow >= cardH + gap) {
      // Ada cukup ruang di bawah target (mis. Legenda di atas, atau Tab jika card muat di bawah)
      const cTop = Math.min(viewportH - cardH - 12, targetRect.bottom + gap);
      card.style.top = `${cTop}px`;
      if (arrow) arrow.classList.add('arrow-top');
      cardPlacedAbove = false;
    } else {
      // Tidak cukup ruang di bawah → tempatkan di atas target (atau dekat header)
      const cTop = Math.max(headerH + 8, Math.min(viewportH - cardH - 12, targetRect.top - cardH - gap));
      card.style.top = `${cTop}px`;
      if (arrow) arrow.classList.add('arrow-bottom');
      cardPlacedAbove = true;
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
      cardPlacedAbove = true;
    }
  }

  // Pointer Beacon dengan Icon Vektor SVG — POSISI AMAN (tidak tabrakan dengan Card!)
  if (beacon) {
    if (beaconIconEl) {
      beaconIconEl.replaceChildren(createIcon(stepDef.iconName, 14));
    }
    if (beaconTextEl) {
      beaconTextEl.textContent = stepDef.beaconText || 'Fungsi Ini';
    }

    const bLeft = Math.min(viewportW - 180, Math.max(10, sLeft + sWidth / 2 - 60));
    beacon.style.left = `${bLeft}px`;

    if (viewportW <= 768) {
      if (cardPlacedAbove) {
        // Jika Card berada di ATAS target (mis. Langkah 1 ISS Live):
        // Taruh beacon di BAWAH target agar sama sekali tidak bertabrakan dengan Card / tombol Lanjut!
        const bTop = sTop + sHeight + 8;
        if (bTop + 28 <= viewportH - 8) {
          beacon.style.top = `${bTop}px`;
          beacon.style.display = 'flex';
        } else {
          // Jika di luar layar bawah, sembunyikan beacon (spotlight sudah cukup)
          beacon.style.display = 'none';
        }
      } else {
        // Jika Card berada di BAWAH target (mis. Langkah 2 Legenda):
        // Taruh beacon di ATAS target
        const bTop = Math.max(8, sTop - 34);
        if (bTop >= 48) {
          beacon.style.top = `${bTop}px`;
          beacon.style.display = 'flex';
        } else {
          beacon.style.display = 'none';
        }
      }
    } else {
      // Desktop: taruh di atas target
      const bTop = Math.max(8, sTop - 34);
      beacon.style.top = `${bTop}px`;
      beacon.style.display = 'flex';
    }
  }
}

function goToStep(stepIndex) {
  currentStep = stepIndex;
  const stepDef = TUTORIAL_STEPS[currentStep];

  // 1. Di HP, atur posisi bottom sheet DULU (sebelum render, agar render baca state yg benar)
  //    expandSheet=true  → panel naik (steps 3,4,6,7)
  //    expandSheet=false → panel turun (steps 1,2,5)
  if (typeof window !== 'undefined' && window.innerWidth <= 768) {
    if (typeof setBottomSheetExpanded === 'function') {
      setBottomSheetExpanded(Boolean(stepDef.expandSheet));
    }
  }

  // 2. Jika langkah butuh tab tertentu (misal 'round'), beralih ke tab itu
  //    setActiveTab memanggil render() → renderBottomSheet() akan baca sheetExpanded yg sudah benar
  if (stepDef.targetTab && typeof getActiveTab === 'function' && getActiveTab() !== stepDef.targetTab) {
    setActiveTab(stepDef.targetTab);
  }

  // 3. Pada langkah 1, arahkan peta langsung ke posisi ISS
  if (stepDef.step === 1 && typeof centerOnIss === 'function') {
    centerOnIss();
  }

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

  // Cari elemen target & posisikan overlay segera
  updateOverlayAndArrow(resolveTarget(stepDef), stepDef);

  // Jika langkah butuh expandSheet di HP, polling transisi + timer berkala
  if (stepDef.expandSheet) {
    const sheet = document.getElementById('bottom-sheet');
    let lastTop = null;
    let stableCount = 0;
    let frame = 0;
    const MAX_FRAMES = 50;

    const pollUntilStable = () => {
      frame++;
      const rect = sheet ? sheet.getBoundingClientRect() : null;
      const currentTop = rect ? Math.round(rect.top) : null;

      if (currentTop !== null && currentTop === lastTop) {
        stableCount++;
        if (stableCount >= 2) {
          if (activeOverlay) updateOverlayAndArrow(resolveTarget(stepDef), stepDef);
          return;
        }
      } else {
        stableCount = 0;
        lastTop = currentTop;
      }

      if (frame < MAX_FRAMES && activeOverlay) {
        requestAnimationFrame(pollUntilStable);
      } else if (activeOverlay) {
        updateOverlayAndArrow(resolveTarget(stepDef), stepDef);
      }
    };
    requestAnimationFrame(pollUntilStable);

    // Timer cadangan untuk kepastian 100% setelah transisi CSS selesai
    setTimeout(() => {
      if (activeOverlay) updateOverlayAndArrow(resolveTarget(stepDef), stepDef);
    }, 200);
    setTimeout(() => {
      if (activeOverlay) updateOverlayAndArrow(resolveTarget(stepDef), stepDef);
    }, 400);
  } else {
    setTimeout(() => {
      if (activeOverlay) updateOverlayAndArrow(resolveTarget(stepDef), stepDef);
    }, 150);
  }

  if (nextBtn) {
    nextBtn.focus();
  }
}

export function startInteractiveTutorial({ onComplete = null } = {}) {
  callbacks.onComplete = onComplete;
  currentStep = 0;

  // Pada tampilan HP, langsung arahkan peta ke koordinat ISS
  if (typeof window !== 'undefined' && window.innerWidth <= 768 && typeof centerOnIss === 'function') {
    centerOnIss();
  }

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
    updateOverlayAndArrow(resolveTarget(stepDef), stepDef);
  };

  window.addEventListener('resize', handleResize);
  window.addEventListener('scroll', handleResize, true);
  resizeListenerRemover = () => {
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('scroll', handleResize, true);
  };

  goToStep(0);
}
