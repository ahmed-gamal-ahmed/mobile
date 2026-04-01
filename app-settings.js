/**
 * app-settings.js
 * Include this in <head> on every page — BEFORE page styles.
 * It immediately applies saved CSS variables from localStorage to avoid
 * any flash of wrong scale / font / density.
 * It also exposes window.AppSettings with save/load helpers for
 * Firestore persistence (called after auth resolves on each page).
 */
(function () {
  'use strict';

  const SETTINGS_KEY = 'appSettings';

  const DEFAULTS = {
    fontSize: 'medium',        // 'small' | 'medium' | 'large'
    tableDensity: 'normal',    // 'compact' | 'normal' | 'large'
    scale: 1,                  // 0.7 – 1.3
    zebra: true,
    language: 'ar',            // 'ar' | 'en'  ← Arabic is default
    columnFilterEnabled: false,
    tabbedScanningMode: false,
    showReceivedQtyColumn: true,
    enableManualInput: true
  };

  /* ── CSS value maps ──────────────────────────────────────────────────── */
  const FS_MAP  = { small: '13px', medium: '15px', large: '18px' };
  const TD_MAP  = { compact: '0.2rem', normal: '0.5rem', large: '0.9rem' };

  /* ── Load persisted settings ─────────────────────────────────────────── */
  let _settings = Object.assign({}, DEFAULTS);
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    Object.assign(_settings, stored);
  } catch (_) {}

  /* ── Apply CSS variables & direction immediately ─────────────────────── */
  function _apply(s) {
    const root = document.documentElement;
    root.style.setProperty('--app-font-size',      FS_MAP[s.fontSize]      || '15px');
    root.style.setProperty('--app-table-density',  TD_MAP[s.tableDensity]  || '0.5rem');
    root.style.setProperty('--app-scale',          s.scale                 || 1);
    root.dir  = s.language === 'ar' ? 'rtl' : 'ltr';
    root.lang = s.language || 'ar';
  }

  _apply(_settings); // ← runs immediately, before DOM paint

  /* ── Public API ──────────────────────────────────────────────────────── */
  window.AppSettings = {

    /** Returns a copy of current settings */
    get: function () { return Object.assign({}, _settings); },

    /** Defaults for external use */
    DEFAULTS: DEFAULTS,

    /**
     * Save settings locally + apply CSS vars + notify other tabs.
     * Optionally pass db+uid to also persist to Firestore.
     */
    save: function (newSettings, db, uid) {
      Object.assign(_settings, newSettings);
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(_settings));
      _apply(_settings);
      if (db && uid) {
        this._writeFirestore(db, uid, _settings);
      }
    },

    /**
     * After auth resolves, load from Firestore and sync locally.
     * Any Firestore value wins over localStorage (server is source of truth).
     */
    loadFromFirestore: async function (db, uid) {
      try {
        const ref  = db.collection('users').doc(uid)
                       .collection('preferences').doc('settings');
        const snap = await ref.get();
        if (snap.exists) {
          Object.assign(_settings, snap.data());
          localStorage.setItem(SETTINGS_KEY, JSON.stringify(_settings));
          _apply(_settings);
        } else {
          // First login on this account — write defaults to Firestore
          await this._writeFirestore(db, uid, _settings);
        }
      } catch (err) {
        console.warn('[AppSettings] Firestore load failed (using localStorage):', err.message);
      }
      return Object.assign({}, _settings);
    },

    /** Write to Firestore (fire-and-forget) */
    _writeFirestore: async function (db, uid, s) {
      try {
        await db.collection('users').doc(uid)
                .collection('preferences').doc('settings')
                .set(s, { merge: true });
      } catch (err) {
        console.warn('[AppSettings] Firestore save failed:', err.message);
      }
    },

    /** Shared Translations Engine **/
    baseTranslations: {
      "Product Inventory": "جرد المنتجات",
      "Settings": "الإعدادات",
      "Barcode Manager": "إدارة الباركود",
      "Saved Operations": "العمليات المحفوظة",
      "Data Import": "استيراد البيانات",
      "Inventory Menu": "قائمة الجرد",
      "Statistics": "الإحصائيات",
      "File Name": "اسم الملف",
      "No file uploaded": "لم يتم رفع ملف",
      "Total": "الإجمالي",
      "Remaining": "المتبقي",
      "Scanned": "الممسوح",
      "New inventory assigned by admin": "جرد جديد تم تعيينه من قبل المسؤول",
      "Admin assigned a new inventory order — saving your current work automatically...": "المسؤول قام بتعيين جرد جديد — يتم حفظ عملك الحالي تلقائياً...",
      "New inventory loaded by admin.": "تم تحميل الجرد الجديد بنجاح من قبل المسؤول.",
      "Your work was saved and new inventory loaded by admin.": "تم حفظ عملك وتحميل الجرد الجديد من قبل المسؤول.",
      "Total Items": "إجمالي العناصر",
      "Progress:": "التقدم:",
      "Enter Barcode": "أدخل الباركود",
      "Barcode not found": "الباركود غير موجود",
      "Scanned Products": "المنتجات الممسوحة",
      "Remaining Products": "المنتجات المتبقية",
      "Clear Storage": "مسح التخزين",
      "Export Products": "تصدير المنتجات",
      "Save JSON": "حفظ كـ JSON",
      "Load JSON": "تحميل JSON",
      "Save Review Operation": "حفظ عملية المراجعة",
      "No description available for search.": "لا يوجد وصف متاح للبحث.",
      "Add New Mapping": "إضافة تعيين جديد",
      "Original Barcode (correct)": "الباركود الأصلي (الصحيح)",
      "Edited Barcode (scanned)": "الباركود المعدل (الممسوح)",
      "Save": "حفظ",
      "Search mappings by barcode...": "بحث في التعيينات بالباركود...",
      "Original Barcode": "الباركود الأصلي",
      "Edited Barcode": "الباركود المعدل",
      "Actions": "إجراءات",
      "Ignore first 3 rows of the file": "تجاهل أول 3 صفوف من الملف",
      "Offline Import (Excel / CSV)": "استيراد بدون اتصال (Excel / CSV)",
      "Upload Excel or CSV File": "رفع ملف Excel أو CSV",
      "Online Import (Google Sheets)": "استيراد متصل (جداول جوجل)",
      "Import from Google Sheets": "استيراد من جداول جوجل",
      "Paste public link": "ضع الرابط العام هنا",
      "Load Worksheets": "تحميل أوراق العمل",
      "Search worksheets...": "البحث في أوراق العمل...",
      "No sheets found.": "لا توجد أوراق عمل.",
      "Worksheet Name": "اسم ورقة العمل",
      "Number of Items": "عدد العناصر",
      "Total Operations:": "إجمالي العمليات:",
      "Total Scanned:": "إجمالي الممسوح:",
      "Delete Selected": "حذف المحدد",
      "Merge Selected": "دمج المحدد",
      "Extract Selected": "استخراج المحدد",
      "Search operations...": "بحث في العمليات...",
      "Operation Name": "اسم العملية",
      "Auditors": "المراجعون",
      "Date & Time": "التاريخ والوقت",
      "Total Products": "إجمالي المنتجات",
      "Back to Inventory": "العودة للجرد",
      "Appearance Settings": "إعدادات المظهر",
      "Font Size": "حجم الخط",
      "Table Density": "كثافة الجدول",
      "Global UI Scale": "حجم واجهة المستخدم",
      "Zebra Striped Tables": "الجداول المخططة",
      "Language": "اللغة",
      "Feature Toggles & UI Elements": "إعدادات ميزات واجهة المستخدم",
      "Column Visibility": "عرض الأعمدة",
      "Add Empty Column (Remaining)": "إضافة عمود فارغ (المتبقي)",
      "Toggle Search Column (Remaining)": "تبديل عمود البحث (المتبقي)",
      "Toggle Action Column": "تبديل عمود الإجراءات",
      "Toggle Scan Time": "تبديل وقت المسح",
      "Behavioral Settings": "إعدادات السلوك",
      "Input Mode": "وضع الإدخال",
      "Scan Mode": "وضع المسح",
      "Search": "بحث",
      "Misc Toggles": "مفاتيح متنوعة",
      "Focus on Added: On": "التركيز التلقائي: قيد التشغيل",
      "Voice: Off": "الصوت: معطل",
      "Enable Tabbed View": "تفعيل عرض التبويبات",
      "Tabbed View allows switching between Scan and Remaining screens": "يتيح عرض التبويبات التبديل بين شاشة الفحص والمتبقي",
      "Show Received Quantity Column": "عرض عمود الكمية المستلمة",
      "Displays the Received Qty column in the Scanned Products table": "يعرض عمود الكمية المستلمة في جدول المنتجات الممسوحة",
      "Enable Manual Input": "تفعيل الإدخال اليدوي",
      "Allows typing numbers directly into the Received Qty column": "يسمح بكتابة الأرقام مباشرة في عمود الكمية المستلمة",
      "Reset to Default Settings": "إعادة تعيين للافتراضي",
      "Close Sidebar": "إغلاق القائمة الجانبية",
      "Open Data Import": "استيراد البيانات",
      "Open Barcode Manager": "إدارة الباركود",
      "Open Settings": "الإعدادات",
      "Show/Hide Remaining Products": "إظهار/إخفاء المتبقي",
      "Clear Local Storage": "مسح مساحة التخزين المحلية",
      "Export Scanned Products": "تصدير المنتجات الممسوحة",
      "Export Session (JSON)": "تصدير الجلسة (JSON)",
      "Import Session (JSON)": "استيراد الجلسة (JSON)",
      "Open Sidebar": "فتح القائمة الجانبية",
      "Small": "صغير",
      "Medium": "متوسط",
      "Large": "كبير",
      "Compact": "مضغوط",
      "Normal": "طبيعي",
      "Import": "استيراد",
      "Delete": "حذف",
      "Move": "نقل",
      "Return": "استرجاع",
      "Scan": "مسح",
      "English (LTR)": "الإنجليزية (LTR)",
      "Arabic (RTL)": "العربية (RTL)",
      "English": "الإنجليزية",
      "Arabic": "العربية",
      "Source": "المصدر",
      "Scan Time": "وقت المسح",
      "Action": "إجراء",
      "Notes": "ملاحظات",
      "Write here...": "اكتب هنا...",
      "Remove Empty Column (Remaining)": "إزالة عمود فارغ (المتبقي)",
      "Show Search Column (Remaining)": "إظهار عمود البحث (المتبقي)",
      "Hide Search Column (Remaining)": "إخفاء عمود البحث (المتبقي)",

      // Admin & Tracker Page Additions
      "Admin Dashboard": "لوحة تحكم المسؤول",
      "Shipment Tracker": "متتبع الشحنات",
      "Users": "المستخدمون",
      "Operations": "العمليات",
      "Import Assignment": "تعيين الاستيراد",
      "Create New User": "إنشاء مستخدم جديد",
      "Display Name": "الاسم الكامل",
      "Email": "البريد الإلكتروني",
      "Phone": "الهاتف",
      "Role": "الصلاحية",
      "Created At": "تاريخ الإنشاء",
      "Logout": "تسجيل خروج",
      "Back to App": "رجوع للتطبيق",
      "Loading Admin Dashboard...": "جاري تحميل لوحة المسؤول...",
      "Loading Shipment Tracker...": "جاري تحميل متتبع الشحنات...",
      "Total Operations": "إجمالي العمليات",
      "Total Operations:": "إجمالي العمليات:",
      "Search by operation or user name...": "بحث باسم العملية أو المستخدم...",
      "Filter by auditor name...": "تصفية بمدقق...",
      "Clear Filters": "مسح الفلاتر",
      "Select File": "اختر ملف",
      "Sheet URL": "رابط الجدول",
      "Assign to User": "تعيين للمستخدم",
      "Force Assignment": "فرض التعيين",
      "Select a user": "اختر مستخدم"
    },

    translationObserver: null,

    getDictionary: function () {
      const isAr = _settings.language === "ar";
      if (isAr) return this.baseTranslations;
      return Object.fromEntries(Object.entries(this.baseTranslations).map(([k, v]) => [v, k]));
    },

    applyTranslations: function () {
      if (!_settings || !_settings.language) return;
      const isAr = _settings.language === "ar";
      document.documentElement.dir = isAr ? "rtl" : "ltr";
      document.documentElement.lang = isAr ? "ar" : "en";
      const dict = this.getDictionary();

      if (this.translationObserver) {
        this.translationObserver.disconnect();
      }

      function walkTextNodes(node) {
        if (node.nodeType === 3) {
           let text = node.nodeValue.trim();
           if (text && dict[text]) {
             node.nodeValue = node.nodeValue.replace(text, dict[text]);
           }
        } else if (node.nodeType === 1 && node.nodeName !== 'SCRIPT' && node.nodeName !== 'STYLE') {
           if (node.hasAttribute && node.hasAttribute('placeholder')) {
             let holder = node.getAttribute('placeholder').trim();
             if (dict[holder]) node.setAttribute('placeholder', dict[holder]);
           }
           if (node.hasAttribute && node.hasAttribute('title')) {
             let titleAttr = node.getAttribute('title').trim();
             if (dict[titleAttr]) node.setAttribute('title', dict[titleAttr]);
           }
           if (node.tagName === 'INPUT' && (node.type === 'button' || node.type === 'submit')) {
             let val = node.value.trim();
             if (dict[val]) node.value = dict[val];
           }
           let children = Array.from(node.childNodes);
           for (let i = 0; i < children.length; i++) {
             walkTextNodes(children[i]);
           }
        }
      }
      
      walkTextNodes(document.body);

      this.translationObserver = new MutationObserver((mutations) => {
        this.translationObserver.disconnect();
        mutations.forEach(m => {
          m.addedNodes.forEach(added => {
            if (added.nodeType === 1 || added.nodeType === 3) walkTextNodes(added);
          });
          if (m.type === 'characterData') {
             let text = m.target.nodeValue.trim();
             if (text && dict[text]) {
               m.target.nodeValue = m.target.nodeValue.replace(text, dict[text]);
             }
          }
        });
        this.translationObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
      });
      this.translationObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
    }
  };
})();
