/**
 * A–Z quick filter — Remaining + Scanned tables (A-Z Browse Mode only).
 */
(function () {
  'use strict';

  const PRODUCT_NAME_COL = 0;
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const FILTER_KEYS = ['All'].concat(LETTERS, ['#']);
  const BROWSE_DESKTOP_KEY = 'alphabetBrowseSavedDesktop';

  let activeFilter = 'All';
  let browseModeActive = false;
  let sidebarEl = null;
  let innerEl = null;
  let initialized = false;

  function isBrowseModeActive() {
    if (typeof window.AppSettings !== 'undefined' && window.AppSettings.get) {
      return !!window.AppSettings.get().alphabetBrowseMode;
    }
    return document.body && document.body.classList.contains('alphabet-browse-mode');
  }

  function getLetterBucket(name) {
    const text = String(name == null ? '' : name).trim();
    if (!text) return '#';
    const ch = text.charAt(0).toUpperCase();
    if (ch >= 'A' && ch <= 'Z') return ch;
    return '#';
  }

  function getProductNameFromRow(tr) {
    if (!tr) return '';
    const cell = tr.querySelector('td.col-0');
    return cell ? cell.textContent : '';
  }

  function getRemainingProductsArray() {
    if (typeof remainingProducts !== 'undefined' && Array.isArray(remainingProducts)) {
      return remainingProducts;
    }
    return [];
  }

  function collectAllProductNames() {
    const names = [];
    getRemainingProductsArray().forEach(function (row) {
      names.push(row[PRODUCT_NAME_COL]);
    });
    const scannedBody = document.getElementById('productTableBody');
    if (scannedBody) {
      Array.from(scannedBody.rows).forEach(function (tr) {
        names.push(getProductNameFromRow(tr));
      });
    }
    return names;
  }

  function computeCountsFromNames(names) {
    const counts = { All: names.length, '#': 0 };
    LETTERS.forEach(function (L) { counts[L] = 0; });
    for (let i = 0; i < names.length; i++) {
      const bucket = getLetterBucket(names[i]);
      counts[bucket]++;
    }
    return counts;
  }

  function buildSidebarDom() {
    if (sidebarEl) return;

    sidebarEl = document.createElement('nav');
    sidebarEl.id = 'remainingAlphabetFilter';
    sidebarEl.className = 'remaining-alphabet-filter d-none';
    sidebarEl.setAttribute('aria-label', 'Products alphabet filter (scanned and remaining)');

    innerEl = document.createElement('div');
    innerEl.className = 'remaining-alphabet-filter-inner';
    sidebarEl.appendChild(innerEl);

    FILTER_KEYS.forEach(function (key) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'alphabet-filter-btn';
      btn.dataset.letter = key;
      btn.setAttribute('aria-label', key === 'All' ? 'Show all products' : 'Filter by ' + key);

      const letterSpan = document.createElement('span');
      letterSpan.className = 'alphabet-filter-letter';
      letterSpan.textContent = key;

      const countSpan = document.createElement('span');
      countSpan.className = 'alphabet-filter-count';
      countSpan.textContent = '';

      btn.appendChild(letterSpan);
      btn.appendChild(countSpan);
      innerEl.appendChild(btn);
    });

    innerEl.addEventListener('click', function (e) {
      const btn = e.target.closest('.alphabet-filter-btn');
      if (!btn || btn.disabled) return;
      setFilter(btn.dataset.letter, true);
    });

    document.body.appendChild(sidebarEl);
  }

  function updateCountLabels(counts) {
    if (!innerEl) return;
    innerEl.querySelectorAll('.alphabet-filter-btn').forEach(function (btn) {
      const key = btn.dataset.letter;
      const count = counts[key] != null ? counts[key] : 0;
      const countEl = btn.querySelector('.alphabet-filter-count');
      if (countEl) {
        countEl.textContent = count > 0 ? String(count) : '';
      }
      btn.title = key === 'All'
        ? 'All (' + count + ')'
        : (count > 0 ? key + ' (' + count + ')' : key + ' (0)');
      btn.classList.toggle('is-empty', count === 0 && key !== 'All');
      btn.disabled = key !== 'All' && count === 0;
    });
  }

  function updateActiveButton() {
    if (!innerEl) return;
    innerEl.querySelectorAll('.alphabet-filter-btn').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.dataset.letter === activeFilter);
    });
  }

  function tagRowLetter(tr, nameOrRowData) {
    if (!tr) return;
    let name = nameOrRowData;
    if (Array.isArray(nameOrRowData)) {
      name = nameOrRowData[PRODUCT_NAME_COL];
    }
    tr.dataset.filterLetter = getLetterBucket(name);
  }

  function retagAllRows() {
    const remainingBody = document.getElementById('remainingTableBody');
    if (remainingBody) {
      Array.from(remainingBody.rows).forEach(function (tr) {
        if (!tr.dataset.filterLetter) {
          tagRowLetter(tr, getProductNameFromRow(tr));
        }
      });
    }
    const scannedBody = document.getElementById('productTableBody');
    if (scannedBody) {
      Array.from(scannedBody.rows).forEach(function (tr) {
        tagRowLetter(tr, getProductNameFromRow(tr));
      });
    }
  }

  function filterTableBody(tbody) {
    if (!tbody) return null;
    let firstMatch = null;
    for (let i = 0; i < tbody.rows.length; i++) {
      const row = tbody.rows[i];
      if (!row.dataset.filterLetter) {
        tagRowLetter(row, getProductNameFromRow(row));
      }
      const bucket = row.dataset.filterLetter || '#';
      const visible = activeFilter === 'All' || bucket === activeFilter;
      row.classList.toggle('alphabet-filter-hidden', !visible);
      if (visible && !firstMatch) firstMatch = row;
    }
    return firstMatch;
  }

  function applyFilterToDom(scrollToFirst) {
    const remainingFirst = filterTableBody(document.getElementById('remainingTableBody'));
    const scannedFirst = filterTableBody(document.getElementById('productTableBody'));
    const firstMatch = remainingFirst || scannedFirst;

    if (scrollToFirst && firstMatch && activeFilter !== 'All') {
      requestAnimationFrame(function () {
        firstMatch.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    }
  }

  function updateVisibility() {
    browseModeActive = isBrowseModeActive();
    const main = document.getElementById('mainAppContainer');
    const mainVisible = main && !main.classList.contains('d-none');
    const show = browseModeActive && mainVisible;
    document.body.classList.toggle('remaining-alphabet-filter-active', show);
    if (sidebarEl) sidebarEl.classList.toggle('d-none', !show);
  }

  function ensureVisible() {
    if (!isBrowseModeActive()) return;
    if (!initialized) init();
    updateVisibility();
  }

  function setFilter(letter, scrollToFirst) {
    if (FILTER_KEYS.indexOf(letter) === -1) return;
    activeFilter = letter;
    updateActiveButton();
    applyFilterToDom(!!scrollToFirst);
  }

  function refresh(options) {
    if (!isBrowseModeActive()) {
      updateVisibility();
      return;
    }
    if (!initialized) init();
    const opts = options || {};
    retagAllRows();
    const counts = computeCountsFromNames(collectAllProductNames());

    updateCountLabels(counts);
    updateVisibility();

    if (activeFilter !== 'All' && counts[activeFilter] === 0) {
      activeFilter = 'All';
    }

    updateActiveButton();
    applyFilterToDom(!!opts.scrollToFirst);
  }

  function clearTableFilterState(tbody) {
    if (!tbody) return;
    Array.from(tbody.rows).forEach(function (row) {
      row.classList.remove('alphabet-filter-hidden');
      delete row.dataset.filterLetter;
    });
  }

  function reset() {
    activeFilter = 'All';
    browseModeActive = false;
    if (innerEl) {
      innerEl.querySelectorAll('.alphabet-filter-btn').forEach(function (btn) {
        btn.classList.remove('is-active', 'is-empty');
        btn.disabled = false;
        btn.title = '';
        const countEl = btn.querySelector('.alphabet-filter-count');
        if (countEl) countEl.textContent = '';
      });
    }
    document.body.classList.remove('remaining-alphabet-filter-active');
    if (sidebarEl) sidebarEl.classList.add('d-none');

    clearTableFilterState(document.getElementById('remainingTableBody'));
    const remainingBody = document.getElementById('remainingTableBody');
    if (remainingBody) {
      Array.from(remainingBody.rows).forEach(function (row) {
        delete row.dataset.remainingIndex;
      });
    }
    clearTableFilterState(document.getElementById('productTableBody'));
  }

  function tagRemainingRow(tr, rowData, index) {
    if (!tr || !rowData) return;
    tagRowLetter(tr, rowData);
    if (typeof index === 'number') {
      tr.dataset.remainingIndex = String(index);
    }
  }

  function tagScannedRow(tr, rowData) {
    tagRowLetter(tr, rowData || getProductNameFromRow(tr));
  }

  function onBrowseModeChange(on) {
    browseModeActive = !!on;
    if (!on) {
      reset();
      return;
    }
    if (!initialized) init();
    activeFilter = 'All';
    updateActiveButton();
    refresh({ scrollToFirst: false });
  }

  function init() {
    if (initialized) return;
    buildSidebarDom();
    initialized = true;
    if (isBrowseModeActive()) {
      refresh({ scrollToFirst: false });
    }
  }

  window.RemainingAlphabetFilter = {
    init: init,
    refresh: refresh,
    reset: reset,
    setFilter: setFilter,
    updateVisibility: updateVisibility,
    ensureVisible: ensureVisible,
    onBrowseModeChange: onBrowseModeChange,
    tagRemainingRow: tagRemainingRow,
    tagScannedRow: tagScannedRow,
    getLetterBucket: getLetterBucket,
    getActiveFilter: function () { return activeFilter; },
    isBrowseModeActive: isBrowseModeActive,
    BROWSE_DESKTOP_KEY: BROWSE_DESKTOP_KEY
  };
})();
