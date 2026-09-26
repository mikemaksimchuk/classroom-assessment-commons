(function () {
  'use strict';
  var config = window.CAC_CONFIG || {};
  var client = null;
  var session = null;
  var publicResources = [];
  var adminResources = [];
  var adminRatings = [];
  var adminNotes = [];
  var usageSummary = null;
  var activeAdminStatus = 'all';
  var activePathway = null;
  var currentDetailsResourceId = null;
  var toastTimer = null;
  var lastFocusedElement = null;
  var mikeModeOpen = false;
  var mikeModeSelectedIds = new Set();

  var pathwayResources = {
    teachers: {
      title: 'Teachers',
      intro: 'Begin with practical resources that connect formative assessment, ambitious teaching, and student-centered assessment methods.',
      resources: [
        { title: 'What Teachers Need to Know About the Formative Assessment Process', url: 'https://famemichigan.org/wp-content/uploads/2020/09/KA_04Teachers_4pg.pdf' },
        { title: 'ALN Presentation: How Does the Formative Assessment Process Support Ambitious Teaching and Vice Versa?', url: 'https://vimeo.com/681042346/f00c65ed88' },
        { title: 'What Types of Assessment Methods Support Student-Centered Instruction?', url: 'https://www.michiganassessmentconsortium.org/wp-content/uploads/LP-ASSESSMENT-METHODS-FOR-STUDENT-CENTERED-INSTRUCTION.pdf' }
      ]
    },
    administrators: {
      title: 'Administrators',
      intro: 'Explore concise guidance for leading formative assessment and building thoughtful, balanced assessment systems.',
      resources: [
        { title: 'What Administrators Need to Know About the Formative Assessment Process', url: 'https://famemichigan.org/wp-content/uploads/2020/02/KA_02_Administrators_4pg.pdf' },
        { title: 'Formative Assessment or Formative Assessments: The “S” Makes a Difference', url: 'https://www.michiganassessmentconsortium.org/wp-content/uploads/LP-FORMATIVE-ASSESSMENT-VS-ASSESSMENTS.pdf' },
        { title: 'A Thoughtful Educator’s Guide to Interim/Benchmark Assessment', url: 'https://www.michiganassessmentconsortium.org/wp-content/uploads/BBAF-Interim-Benchmark-Guide.pdf' }
      ]
    },
    policymakers: {
      title: 'Policymakers',
      intro: 'Consider how assessment policy and system design can positively influence teaching, learning, and balanced assessment practice.',
      resources: [
        { title: 'What Local and State Policymakers Need to Know About the Formative Assessment Process', url: 'https://famemichigan.org/wp-content/uploads/2019/10/KnowAbout_01_Policymakers_4pp.pdf' },
        { title: 'Assessment as a Positive Influence on 21st Century Teaching and Learning', url: 'https://www.michiganassessmentconsortium.org/wp-content/uploads/Assessment-as-a-Positive-Influence.pdf' },
        { title: 'What Constitutes a High-Quality, Comprehensive, Balanced Assessment System?', url: 'https://www.michiganassessmentconsortium.org/wp-content/uploads/3-Dec16-2016_Dec_ALN-LEARNING_POINT_BALANCED-2.pdf' }
      ]
    },
    families: {
      title: 'Students & Families',
      intro: 'Use this short guide to understand how formative assessment supports learning and meaningful student participation.',
      resources: [
        { title: 'What Students and Their Families Need to Know About the Formative Assessment Process', url: 'https://famemichigan.org/wp-content/uploads/2020/06/KnowAbout_03StudentsFamilies_4pg_v3.pdf' }
      ]
    },
    'higher-education': {
      title: 'Professional Studies & Higher Education',
      intro: 'Examine foundational ideas in assessment for learning, assessment literacy, formative assessment, and balanced assessment systems.',
      resources: [
        { title: 'What Do We Mean by Assessment for Learning?', url: 'https://www.michiganassessmentconsortium.org/wp-content/uploads/Sept2017_LearningPoint_FormativeAssessment-1.pdf' },
        { title: 'What Fundamental Understandings Are Necessary for Assessment Literacy?', url: 'https://www.michiganassessmentconsortium.org/wp-content/uploads/2018_Nov_FUNDAMENTAL_UNDERSTANDINGS_ASSESSMENT_LITERACY-3.pdf' },
        { title: 'What Do We Mean by Formative Assessment?', url: 'https://www.michiganassessmentconsortium.org/wp-content/uploads/Sept2017_LearningPoint_FormativeAssessment-1.pdf' },
        { title: 'What Constitutes a High-Quality, Comprehensive, Balanced Assessment System?', url: 'https://www.michiganassessmentconsortium.org/wp-content/uploads/3-Dec16-2016_Dec_ALN-LEARNING_POINT_BALANCED-2.pdf' }
      ]
    }
  };

  var ratingDefinitions = [
    { key: 'alignment', label: '1. Alignment to NCME Standards', description: 'Alignment with foundational measurement principles, including validity, reliability, and fairness.' },
    { key: 'utility', label: '2. Practical Utility', description: 'Actionable guidance, usable tools, or clear implementation support for the intended audience.' },
    { key: 'equity', label: '3. Equity and Inclusion', description: 'Attention to bias, accessibility, and the needs of diverse learners and communities.' },
    { key: 'quality', label: '4. Engagement and Quality', description: 'Professional presentation, clarity, organization, and ease of navigation or use.' },
    { key: 'currency', label: '5. Currency', description: 'Use of current evidence, terminology, standards, and educational contexts.' }
  ];
  var ratingOptions = [
    { value: 4, label: '4 - Exemplary' },
    { value: 3, label: '3 - Proficient' },
    { value: 2, label: '2 - Developing' },
    { value: 1, label: '1 - Inadequate' }
  ];

  document.addEventListener('DOMContentLoaded', initialize);

  function initialize() {
    bindGlobalEvents();
    renderRatingCriteria();
    refreshIcons();
    var key = config.SUPABASE_PUBLISHABLE_KEY || '';
    var valid = Boolean(config.SUPABASE_URL && key && key.indexOf('REPLACE_') !== 0 &&
      (key.indexOf('sb_publishable_') === 0 || key.split('.').length === 3));
    if (!valid || !window.supabase) {
      document.getElementById('configuration-warning').classList.remove('hidden');
      document.getElementById('loading-state').classList.add('hidden');
      showToast('The site database configuration is incomplete.', 'error');
      return;
    }
    client = window.supabase.createClient(config.SUPABASE_URL, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });
    recordSiteVisit();
    client.auth.getSession().then(function (result) {
      session = result.data.session;
      updateAccessButton();
      return loadPublicResources();
    }).catch(handleUnexpectedError);
    client.auth.onAuthStateChange(function (_event, nextSession) {
      session = nextSession;
      updateAccessButton();
    });
  }

  function bindGlobalEvents() {
    document.getElementById('home-button').addEventListener('click', showPublicView);
    document.getElementById('explore-button').addEventListener('click', showCatalog);
    document.getElementById('about-button').addEventListener('click', showAbout);
    document.getElementById('submit-button').addEventListener('click', function () {
      document.getElementById('submission-form').reset();
      openModal('submission-modal');
    });
    document.getElementById('reviewer-access-button').addEventListener('click', function () {
      if (session) return showAdminView();
      document.getElementById('login-form').reset();
      document.getElementById('login-error').classList.add('hidden');
      openModal('login-modal');
    });
    document.getElementById('logout-button').addEventListener('click', signOut);
    document.getElementById('add-resource-button').addEventListener('click', function () { openResourceEditor(null); });
    document.getElementById('bulk-import-button').addEventListener('click', openBulkImport);
    document.getElementById('bulk-import-form').addEventListener('submit', importBulkResources);
    document.getElementById('export-csv-button').addEventListener('click', exportResourcesCsv);
    document.getElementById('export-backup-button').addEventListener('click', exportBackup);
    document.getElementById('clear-filters').addEventListener('click', clearFilters);
    document.getElementById('catalog-search').addEventListener('input', renderPublicCatalog);
    document.getElementById('catalog-sort').addEventListener('change', renderPublicCatalog);
    document.getElementById('prelearning-pathways').addEventListener('click', handlePathwaySelection);
    document.getElementById('admin-search').addEventListener('input', renderAdminResources);
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('submission-form').addEventListener('submit', handleSubmission);
    document.getElementById('resource-form').addEventListener('submit', saveResource);
    document.getElementById('rating-form').addEventListener('submit', saveRating);
    document.getElementById('note-form').addEventListener('submit', saveNote);
    document.getElementById('rating-criteria').addEventListener('change', updateRatingTotal);
    document.getElementById('admin-resource-list').addEventListener('click', handleAdminAction);
    document.getElementById('mike-mode-toggle').addEventListener('click', toggleMikeMode);
    document.getElementById('mike-mode-close').addEventListener('click', function () { setMikeModeOpen(false); });
    document.getElementById('mike-mode-search').addEventListener('input', renderMikeMode);
    document.getElementById('mike-mode-select-all').addEventListener('change', toggleMikeModeVisibleSelection);
    document.getElementById('mike-mode-table-body').addEventListener('change', handleMikeModeSelection);
    document.getElementById('mike-mode-accept').addEventListener('click', acceptCheckedMikeModeResources);
    document.getElementById('details-ratings').addEventListener('click', handleRatingAction);
    document.getElementById('details-notes').addEventListener('click', handleNoteAction);
    document.getElementById('details-add-rating').addEventListener('click', function () {
      closeAllModals();
      openRatingEditor(currentDetailsResourceId, null);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.modal-close'), function (button) {
      button.addEventListener('click', closeAllModals);
    });
    document.getElementById('modal-backdrop').addEventListener('click', closeAllModals);
    Array.prototype.forEach.call(document.querySelectorAll('.admin-tab'), function (button) {
      button.addEventListener('click', function () {
        activeAdminStatus = button.getAttribute('data-status');
        Array.prototype.forEach.call(document.querySelectorAll('.admin-tab'), function (tab) {
          tab.classList.toggle('active', tab === button);
        });
        renderAdminResources();
      });
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        closeAllModals();
      } else if (event.key === 'Tab') {
        keepFocusInModal(event);
      }
    });
  }

  async function loadPublicResources() {
    setPublicLoading(true);
    var result = await client.from('resources')
      .select('id,title,url,provider,summary,length,resource_type,audience,topics,grade_ranges,assessment_types,published_date,included_date,created_at')
      .eq('status', 'published').order('title', { ascending: true });
    if (result.error) {
      setPublicLoading(false);
      showDatabaseSetupMessage(result.error);
      return;
    }
    publicResources = result.data || [];
    renderFilterControls();
    renderPublicCatalog();
    renderCatalogSummary();
    setPublicLoading(false);
  }

  function showDatabaseSetupMessage(error) {
    var grid = document.getElementById('resource-grid');
    grid.innerHTML = '<div class="xl:col-span-2 bg-amber-50 border border-amber-200 rounded-2xl p-6 text-amber-900">' +
      '<h3 class="font-bold">Database setup is required</h3>' +
      '<p class="text-sm mt-2">Run <code>supabase-schema.sql</code> in the Supabase SQL Editor, then reload this page.</p>' +
      '<p class="text-xs mt-3 text-amber-700">' + escapeHtml(error.message || 'The resources table is unavailable.') + '</p></div>';
  }

  function setPublicLoading(loading) {
    document.getElementById('loading-state').classList.toggle('hidden', !loading);
    if (loading) document.getElementById('resource-grid').innerHTML = '';
  }

  function renderCatalogSummary() {
    var providers = uniqueValues(publicResources.map(function (item) { return item.provider; })).length;
    var topics = uniqueValues(flatMap(publicResources, 'topics')).length;
    document.getElementById('catalog-summary').innerHTML =
      summaryTile(publicResources.length, 'Curated resources') +
      summaryTile(providers, 'Trusted providers') +
      summaryTile(topics, 'Topics represented', 'hidden sm:block');
  }

  function summaryTile(value, label, extraClass) {
    return '<div class="summary-tile ' + (extraClass || '') + '">' +
      '<div class="summary-value">' + escapeHtml(String(value)) + '</div>' +
      '<div class="summary-label">' + escapeHtml(label) + '</div></div>';
  }

  function renderFilterControls() {
    var controls = document.getElementById('filter-controls');
    var groups = [
      { key: 'audience', label: 'Audience', values: uniqueValues(flatMap(publicResources, 'audience')) },
      { key: 'topics', label: 'Topic', values: uniqueValues(flatMap(publicResources, 'topics')) },
      { key: 'grade_ranges', label: 'Grade range', values: uniqueValues(flatMap(publicResources, 'grade_ranges')) },
      { key: 'assessment_types', label: 'Assessment type', values: uniqueValues(flatMap(publicResources, 'assessment_types')) },
      { key: 'resource_type', label: 'Resource type', values: uniqueValues(publicResources.map(function (item) { return item.resource_type; })) }
    ];
    controls.innerHTML = '';
    groups.forEach(function (group) {
      var section = document.createElement('section');
      section.className = 'filter-group';
      var toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'filter-toggle';
      toggle.setAttribute('aria-expanded', 'false');
      var toggleText = document.createElement('span');
      toggleText.textContent = group.label;
      var toggleMeta = document.createElement('span');
      toggleMeta.className = 'filter-toggle-meta';
      toggleMeta.textContent = group.values.length + ' option' + (group.values.length === 1 ? '' : 's');
      var toggleIcon = document.createElement('i');
      toggleIcon.setAttribute('data-lucide', 'chevron-down');
      toggleIcon.className = 'w-4 h-4 filter-toggle-icon';
      toggle.appendChild(toggleText);
      toggle.appendChild(toggleMeta);
      toggle.appendChild(toggleIcon);
      section.appendChild(toggle);
      var list = document.createElement('div');
      list.id = 'filter-options-' + group.key;
      list.className = 'filter-option-list hidden';
      toggle.setAttribute('aria-controls', list.id);
      toggle.addEventListener('click', function () {
        var isExpanded = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', isExpanded ? 'false' : 'true');
        list.classList.toggle('hidden', isExpanded);
        section.classList.toggle('is-expanded', !isExpanded);
        refreshIcons();
      });
      group.values.forEach(function (value) {
        var label = document.createElement('label');
        label.className = 'filter-option';
        var input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'mt-0.5 rounded border-slate-300 text-blue-600';
        input.setAttribute('data-filter-key', group.key);
        input.value = value;
        input.addEventListener('change', renderPublicCatalog);
        var span = document.createElement('span');
        span.textContent = value;
        label.appendChild(input);
        label.appendChild(span);
        list.appendChild(label);
      });
      section.appendChild(list);
      controls.appendChild(section);
    });
    refreshIcons();
  }

  function renderPublicCatalog() {
    var search = document.getElementById('catalog-search').value.trim().toLowerCase();
    var selected = {};
    Array.prototype.forEach.call(document.querySelectorAll('[data-filter-key]:checked'), function (input) {
      var key = input.getAttribute('data-filter-key');
      if (!selected[key]) selected[key] = [];
      selected[key].push(input.value);
    });
    var filtered = publicResources.filter(function (resource) {
      var haystack = [resource.title, resource.provider, resource.summary,
        (resource.topics || []).join(' '), (resource.audience || []).join(' ')].join(' ').toLowerCase();
      if (search && haystack.indexOf(search) === -1) return false;
      return Object.keys(selected).every(function (key) {
        if (key === 'resource_type') return selected[key].indexOf(resource.resource_type) !== -1;
        var values = resource[key] || [];
        return selected[key].some(function (selectedValue) { return values.indexOf(selectedValue) !== -1; });
      });
    });
    sortPublicResources(filtered, document.getElementById('catalog-sort').value);
    var grid = document.getElementById('resource-grid');
    grid.innerHTML = '';
    filtered.forEach(function (resource) { grid.appendChild(createResourceCard(resource)); });
    document.getElementById('result-count').textContent = filtered.length + (filtered.length === 1 ? ' resource found matching filters' : ' resources found matching filters');
    document.getElementById('empty-state').classList.toggle('hidden', filtered.length !== 0);
    refreshIcons();
  }

  function createResourceCard(resource) {
    var card = document.createElement('article');
    card.className = 'resource-card';
    var safeUrl = sanitizeUrl(resource.url);
    var tags = (resource.topics || []).slice(0, 3).concat((resource.audience || []).slice(0, 2));
    card.innerHTML =
      '<div class="flex items-start justify-between gap-4 mb-4">' +
        '<div class="p-2.5 bg-blue-50 text-blue-700 rounded-xl"><i data-lucide="' + iconForType(resource.resource_type) + '" class="w-5 h-5"></i></div>' +
        '<span class="text-[10px] font-bold text-slate-500 bg-slate-100 rounded px-2 py-1">' + escapeHtml(resource.resource_type || 'Resource') + '</span></div>' +
      '<h3 class="text-lg font-bold text-slate-900 leading-snug"><a class="hover:text-blue-700 hover:underline" href="' + escapeAttribute(safeUrl) +
        '" target="_blank" rel="noopener noreferrer">' + escapeHtml(resource.title) + '<span class="sr-only"> (opens in a new tab)</span></a></h3>' +
      '<p class="text-xs font-semibold text-slate-500 mt-2">Provider: <span class="text-slate-700">' + escapeHtml(resource.provider) + '</span></p>' +
      '<p class="text-sm text-slate-600 leading-relaxed mt-4 flex-grow">' + escapeHtml(resource.summary) + '</p>' +
      '<div class="mt-5 pt-4 border-t border-slate-100"><div class="mb-2 text-xs text-slate-400">' +
        '<span>' + escapeHtml(resource.length || 'Length not specified') + '</span></div>' +
      '<div class="resource-dates mb-3">' + resourceDateMetadata(resource) + '</div><div class="flex flex-wrap gap-1.5">' +
        tags.map(function (tag) { return '<span class="tag">' + escapeHtml(tag) + '</span>'; }).join('') + '</div></div>';
    return card;
  }

  function resourceDateMetadata(resource) {
    var dates = [];
    if (resource.published_date) dates.push('Originally published ' + formatDateOnly(resource.published_date));
    if (resource.included_date) dates.push('Included ' + formatDateOnly(resource.included_date));
    return dates.length ? dates.map(function (date) { return '<span>' + escapeHtml(date) + '</span>'; }).join('<span aria-hidden="true">·</span>') : '';
  }

  function clearFilters() {
    document.getElementById('catalog-search').value = '';
    Array.prototype.forEach.call(document.querySelectorAll('[data-filter-key]'), function (input) { input.checked = false; });
    renderPublicCatalog();
  }

  function handlePathwaySelection(event) {
    var card = event.target.closest('[data-pathway]');
    if (!card) return;
    activePathway = card.getAttribute('data-pathway');
    var pathway = pathwayResources[activePathway];
    if (!pathway) return;
    updatePathwayUI();
    document.getElementById('pathway-modal-title').textContent = pathway.title;
    document.getElementById('pathway-modal-intro').textContent = pathway.intro;
    document.getElementById('pathway-resource-list').innerHTML = pathway.resources.map(function (resource, index) {
      return '<article class="pathway-resource-item"><span class="pathway-resource-number">' + (index + 1) + '</span><div>' +
        '<h3>' + escapeHtml(resource.title) + '</h3><a href="' + escapeAttribute(sanitizeUrl(resource.url)) + '" target="_blank" rel="noopener noreferrer">' +
        'Open resource <i data-lucide="external-link" class="w-3.5 h-3.5"></i><span class="sr-only"> (opens in a new tab)</span></a></div></article>';
    }).join('');
    openModal('pathway-modal');
  }

  function updatePathwayUI() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-pathway]'), function (card) {
      var selected = card.getAttribute('data-pathway') === activePathway;
      card.classList.toggle('active', selected);
      card.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
  }

  function sortPublicResources(resources, mode) {
    resources.sort(function (a, b) {
      if (mode === 'title') return String(a.title || '').localeCompare(String(b.title || ''));
      if (mode === 'provider') {
        return String(a.provider || '').localeCompare(String(b.provider || '')) || String(a.title || '').localeCompare(String(b.title || ''));
      }
      if (mode === 'newest') return new Date(b.included_date || b.created_at || 0) - new Date(a.included_date || a.created_at || 0);
      return String(a.title || '').localeCompare(String(b.title || ''));
    });
  }

  async function handleLogin(event) {
    event.preventDefault();
    if (!client) return;
    var errorLabel = document.getElementById('login-error');
    var button = document.getElementById('login-submit');
    errorLabel.classList.add('hidden');
    setButtonLoading(button, true, 'Signing in...');
    var result = await client.auth.signInWithPassword({
      email: config.REVIEWER_EMAIL,
      password: document.getElementById('reviewer-password').value
    });
    setButtonLoading(button, false, 'Sign in');
    if (result.error) {
      errorLabel.textContent = 'The password was not accepted. Confirm that the shared reviewer account has been created in Supabase Authentication.';
      errorLabel.classList.remove('hidden');
      return;
    }
    session = result.data.session;
    closeAllModals();
    document.getElementById('login-form').reset();
    showToast('Reviewer access granted.', 'success');
    await showAdminView();
  }

  async function signOut() {
    if (client) await client.auth.signOut();
    session = null;
    adminResources = [];
    adminRatings = [];
    adminNotes = [];
    usageSummary = null;
    updateAccessButton();
    showPublicView();
    await loadPublicResources();
    showToast('You have signed out.', 'success');
  }

  function updateAccessButton() {
    var button = document.getElementById('reviewer-access-button');
    button.innerHTML = session ?
      '<i data-lucide="layout-dashboard" class="w-5 h-5"></i><span class="hidden sm:inline">Reviewer dashboard</span>' :
      '<i data-lucide="lock" class="w-5 h-5"></i><span class="hidden sm:inline">Reviewer access</span>';
    refreshIcons();
  }

  function showPublicView() {
    document.getElementById('public-view').classList.remove('hidden');
    document.getElementById('admin-view').classList.add('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showCatalog() {
    showPublicView();
    window.setTimeout(function () {
      document.getElementById('catalog-heading').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  }

  function showAbout() {
    showPublicView();
    window.setTimeout(function () {
      document.getElementById('about').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  }

  async function showAdminView() {
    if (!session) return openModal('login-modal');
    document.getElementById('public-view').classList.add('hidden');
    document.getElementById('admin-view').classList.remove('hidden');
    document.getElementById('admin-session-label').textContent = 'Signed in as the NCME CAC reviewer group.';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await loadAdminData();
  }

  async function loadAdminData() {
    var list = document.getElementById('admin-resource-list');
    list.innerHTML = '<div class="p-12 text-center"><span class="loading-spinner"></span><p class="text-sm text-slate-500 mt-3">Loading shared records...</p></div>';
    var results = await Promise.all([
      client.from('resources').select('*').order('updated_at', { ascending: false }),
      client.from('ratings').select('*').order('updated_at', { ascending: false }),
      client.from('resource_notes').select('*').order('created_at', { ascending: false })
    ]);
    var error = results.map(function (item) { return item.error; }).find(Boolean);
    if (error) {
      list.innerHTML = '<div class="p-8 text-red-700 text-sm">Unable to load secure records: ' + escapeHtml(error.message) + '</div>';
      return;
    }
    adminResources = results[0].data || [];
    adminRatings = results[1].data || [];
    adminNotes = results[2].data || [];
    var usageResult = await client.rpc('get_usage_summary');
    if (!usageResult.error) {
      usageSummary = Array.isArray(usageResult.data) ? usageResult.data[0] : usageResult.data;
    } else {
      usageSummary = null;
    }
    renderAdminSummary();
    renderUsageSummary(usageResult.error);
    renderAdminResources();
    renderMikeMode();
  }

  function renderAdminSummary() {
    var published = adminResources.filter(function (item) { return item.status === 'published'; }).length;
    var pending = adminResources.filter(function (item) { return item.status === 'pending'; }).length;
    var reviewed = adminResources.filter(function (item) { return Number(item.ratings_count) >= 3 || item.review_bypassed; }).length;
    document.getElementById('admin-summary').innerHTML =
      adminSummaryCard(adminResources.length, 'Total resources', 'library') +
      adminSummaryCard(published, 'Published', 'globe-2') +
      adminSummaryCard(pending, 'Pending review', 'inbox') +
      adminSummaryCard(reviewed, 'Fully rated', 'badge-check');
    refreshIcons();
  }

  function adminSummaryCard(value, label, icon) {
    return '<div class="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-sm"><div class="flex items-center justify-between">' +
      '<div><p class="text-2xl font-extrabold text-slate-900">' + value + '</p><p class="text-xs text-slate-500 mt-1">' + escapeHtml(label) + '</p></div>' +
      '<div class="p-2.5 bg-blue-50 text-blue-700 rounded-xl"><i data-lucide="' + icon + '" class="w-5 h-5"></i></div></div></div>';
  }

  function renderUsageSummary(error) {
    var container = document.getElementById('admin-usage-summary');
    if (error || !usageSummary) {
      container.innerHTML = '<div class="usage-unavailable lg:col-span-4">Usage tracking will begin after the included Supabase migration is run.</div>';
      return;
    }
    container.innerHTML =
      usageSummaryCard(usageSummary.total_visits, 'Total visits', 'mouse-pointer-click') +
      usageSummaryCard(usageSummary.unique_browsers, 'Unique browsers', 'monitor-smartphone') +
      usageSummaryCard(usageSummary.visits_30_days, 'Visits, last 30 days', 'calendar-days') +
      usageSummaryCard(usageSummary.visits_7_days, 'Visits, last 7 days', 'activity');
    refreshIcons();
  }

  function usageSummaryCard(value, label, icon) {
    return '<div class="usage-summary-card"><i data-lucide="' + icon + '" class="w-4 h-4"></i><strong>' +
      Number(value || 0).toLocaleString() + '</strong><span>' + escapeHtml(label) + '</span></div>';
  }

  function renderAdminResources() {
    var search = document.getElementById('admin-search').value.trim().toLowerCase();
    var filtered = adminResources.filter(function (resource) {
      if (activeAdminStatus !== 'all' && resource.status !== activeAdminStatus) return false;
      var haystack = [resource.title, resource.provider, resource.summary, resource.submitter_name, resource.submitter_email].join(' ').toLowerCase();
      return !search || haystack.indexOf(search) !== -1;
    });
    var list = document.getElementById('admin-resource-list');
    list.innerHTML = '';
    filtered.forEach(function (resource) {
      var row = document.createElement('article');
      row.className = 'p-5 sm:p-6 hover:bg-slate-50 transition';
      var submitter = resource.submitter_name ?
        '<p class="text-xs text-amber-700 mt-2">Submitted by ' + escapeHtml(resource.submitter_name) +
        (resource.submitter_email ? ' (' + escapeHtml(resource.submitter_email) + ')' : '') + '</p>' : '';
      var ratingLabel = Number(resource.ratings_count || 0) + ' rating' + (Number(resource.ratings_count || 0) === 1 ? '' : 's');
      if (resource.review_bypassed) ratingLabel = 'Expedited approval';
      var average = resource.average_score === null ? 'No average' : Number(resource.average_score).toFixed(1) + ' / 20';
      var dates = '<span class="admin-resource-dates">Published: ' + escapeHtml(formatDateOnly(resource.published_date, 'Unknown')) +
        ' · Included: ' + escapeHtml(formatDateOnly(resource.included_date, 'Not yet included')) + '</span>';
      row.innerHTML =
        '<div class="flex flex-col xl:flex-row xl:items-center justify-between gap-5"><div class="min-w-0 flex-1">' +
        '<div class="flex flex-wrap items-center gap-2 mb-2"><span class="status-pill status-' + escapeAttribute(resource.status) + '">' + escapeHtml(resource.status) + '</span></div>' +
        '<h3 class="font-bold text-slate-900">' + escapeHtml(resource.title) + '</h3>' +
        '<p class="text-xs text-slate-500 mt-1">' + escapeHtml(resource.provider) + ' · ' + escapeHtml(resource.resource_type) + ' · ' +
        escapeHtml(ratingLabel) + ' · ' + escapeHtml(average) + '</p><p class="text-xs text-slate-500 mt-1">' + dates + '</p>' + submitter + '</div>' +
        '<div class="flex flex-wrap gap-2 xl:justify-end"><button class="button-secondary text-xs" data-action="details" data-id="' + resource.id + '">' +
        '<i data-lucide="messages-square" class="w-4 h-4"></i> Ratings and notes</button>' +
        '<button class="button-muted text-xs" data-action="edit" data-id="' + resource.id + '"><i data-lucide="pencil" class="w-4 h-4"></i> Edit</button>' +
        statusActionButtons(resource) +
        '<button class="button-muted text-xs text-red-700" data-action="delete" data-id="' + resource.id + '"><i data-lucide="trash-2" class="w-4 h-4"></i> Delete</button>' +
        '</div></div>';
      list.appendChild(row);
    });
    document.getElementById('admin-empty').classList.toggle('hidden', filtered.length !== 0);
    refreshIcons();
  }

  function toggleMikeMode() {
    setMikeModeOpen(!mikeModeOpen);
  }

  function setMikeModeOpen(open) {
    mikeModeOpen = open;
    var panel = document.getElementById('mike-mode-panel');
    var toggle = document.getElementById('mike-mode-toggle');
    panel.classList.toggle('hidden', !open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      renderMikeMode();
      window.setTimeout(function () {
        document.getElementById('mike-mode-search').focus();
      }, 20);
    } else {
      mikeModeSelectedIds.clear();
      document.getElementById('mike-mode-search').value = '';
      setMikeModeStatus('');
      toggle.focus();
    }
    refreshIcons();
  }

  function pendingMikeModeResources() {
    var search = document.getElementById('mike-mode-search').value.trim().toLowerCase();
    return adminResources.filter(function (resource) {
      if (resource.status !== 'pending') return false;
      var haystack = [resource.title, resource.resource_type, resourceAuthorOrOrganization(resource)].join(' ').toLowerCase();
      return !search || haystack.indexOf(search) !== -1;
    });
  }

  function resourceAuthorOrOrganization(resource) {
    var value = resource.author || resource.authors || resource.creator || resource.provider;
    if (Array.isArray(value)) value = value.join(', ');
    return String(value || 'Not specified');
  }

  function renderMikeMode() {
    if (!mikeModeOpen) return;
    var pendingIds = new Set(adminResources.filter(function (resource) {
      return resource.status === 'pending';
    }).map(function (resource) {
      return resource.id;
    }));
    mikeModeSelectedIds = new Set(Array.from(mikeModeSelectedIds).filter(function (id) {
      return pendingIds.has(id);
    }));

    var resources = pendingMikeModeResources();
    var body = document.getElementById('mike-mode-table-body');
    body.innerHTML = '';
    if (!resources.length) {
      body.innerHTML = '<tr><td colspan="4" class="mike-mode-empty">No pending resources match this view.</td></tr>';
    } else {
      resources.forEach(function (resource) {
        var row = document.createElement('tr');
        var checkCell = document.createElement('td');
        checkCell.className = 'mike-mode-check-cell';
        var checkbox = document.createElement('input');
        var checkboxId = 'mike-resource-' + resource.id;
        checkbox.type = 'checkbox';
        checkbox.id = checkboxId;
        checkbox.setAttribute('data-mike-resource-id', resource.id);
        checkbox.checked = mikeModeSelectedIds.has(resource.id);
        var label = document.createElement('label');
        label.className = 'sr-only';
        label.htmlFor = checkboxId;
        label.textContent = 'Select ' + resource.title;
        checkCell.appendChild(checkbox);
        checkCell.appendChild(label);

        var titleCell = document.createElement('td');
        titleCell.className = 'mike-mode-title';
        titleCell.textContent = resource.title || 'Untitled resource';
        var typeCell = document.createElement('td');
        typeCell.textContent = resource.resource_type || 'Not specified';
        var authorCell = document.createElement('td');
        authorCell.textContent = resourceAuthorOrOrganization(resource);
        row.appendChild(checkCell);
        row.appendChild(titleCell);
        row.appendChild(typeCell);
        row.appendChild(authorCell);
        body.appendChild(row);
      });
    }
    syncMikeModeSelectionControls(resources);
  }

  function syncMikeModeSelectionControls(resources) {
    resources = resources || pendingMikeModeResources();
    var selectedVisible = resources.filter(function (resource) {
      return mikeModeSelectedIds.has(resource.id);
    }).length;
    var selectAll = document.getElementById('mike-mode-select-all');
    selectAll.checked = resources.length > 0 && selectedVisible === resources.length;
    selectAll.indeterminate = selectedVisible > 0 && selectedVisible < resources.length;
    selectAll.disabled = resources.length === 0;
    var selectedCount = mikeModeSelectedIds.size;
    document.getElementById('mike-mode-selection-count').textContent = selectedCount + ' resource' + (selectedCount === 1 ? '' : 's') + ' selected';
    document.getElementById('mike-mode-accept').disabled = selectedCount === 0;
  }

  function handleMikeModeSelection(event) {
    var checkbox = event.target.closest('[data-mike-resource-id]');
    if (!checkbox) return;
    var id = checkbox.getAttribute('data-mike-resource-id');
    if (checkbox.checked) mikeModeSelectedIds.add(id);
    else mikeModeSelectedIds.delete(id);
    syncMikeModeSelectionControls();
  }

  function toggleMikeModeVisibleSelection(event) {
    pendingMikeModeResources().forEach(function (resource) {
      if (event.target.checked) mikeModeSelectedIds.add(resource.id);
      else mikeModeSelectedIds.delete(resource.id);
    });
    renderMikeMode();
  }

  async function acceptCheckedMikeModeResources() {
    var resources = adminResources.filter(function (resource) {
      return resource.status === 'pending' && mikeModeSelectedIds.has(resource.id);
    });
    if (!resources.length) {
      setMikeModeStatus('No pending resources are selected.', 'error');
      return;
    }
    var resourceLabel = resources.length === 1 ? 'resource' : 'resources';
    if (!window.confirm('Accept and publish ' + resources.length + ' selected ' + resourceLabel + ' through the documented expedited-review process?')) return;

    var button = document.getElementById('mike-mode-accept');
    setButtonLoading(button, true, 'Accepting...');
    setMikeModeStatus('Accepting 0 of ' + resources.length + ' selected ' + resourceLabel + '...');
    var accepted = [];
    var failures = [];
    for (var index = 0; index < resources.length; index += 5) {
      var batch = resources.slice(index, index + 5);
      var results = await Promise.all(batch.map(function (resource) {
        return client.rpc('bypass_review_and_approve', { target_resource_id: resource.id })
          .then(function (result) { return { resource: resource, result: result }; })
          .catch(function (error) { return { resource: resource, result: { error: error } }; });
      }));
      results.forEach(function (item) {
        if (item.result && !item.result.error) accepted.push(item.resource);
        else failures.push(item);
      });
      setMikeModeStatus('Accepted ' + accepted.length + ' of ' + resources.length + ' selected ' + resourceLabel + '...');
    }

    mikeModeSelectedIds = new Set(failures.map(function (item) { return item.resource.id; }));
    setButtonLoading(button, false, 'Accept all checked resources');
    await reloadAfterAdminChange();
    if (failures.length) {
      var firstError = failures[0].result && failures[0].result.error;
      var detail = firstError ? friendlyDatabaseError(firstError) : 'Please try again.';
      setMikeModeStatus('Accepted ' + accepted.length + ' resource' + (accepted.length === 1 ? '' : 's') + '. ' + failures.length + ' could not be accepted. ' + detail, 'error');
      showToast(failures.length + ' selected resource' + (failures.length === 1 ? '' : 's') + ' could not be accepted.', 'error');
      return;
    }
    setMikeModeStatus('Accepted and published ' + accepted.length + ' resource' + (accepted.length === 1 ? '' : 's') + '.', 'success');
    showToast('Accepted and published ' + accepted.length + ' resource' + (accepted.length === 1 ? '' : 's') + '.', 'success');
  }

  function setMikeModeStatus(message, type) {
    var status = document.getElementById('mike-mode-status');
    status.textContent = message || '';
    status.className = 'mike-mode-status' + (type ? ' is-' + type : '');
  }

  function statusActionButtons(resource) {
    if (resource.status === 'pending') {
      var remaining = Math.max(0, 3 - Number(resource.ratings_count || 0));
      var publishControl = remaining ? '<span class="text-xs font-semibold text-slate-500 self-center">Needs ' + remaining + ' more review' + (remaining === 1 ? '' : 's') + '</span>' :
        '<button class="button-primary text-xs" data-action="publish" data-id="' + resource.id + '"><i data-lucide="check" class="w-4 h-4"></i> Publish</button>';
      return publishControl + '<button class="button-expedited text-xs" data-action="bypass-approve" data-id="' + resource.id + '"><i data-lucide="badge-check" class="w-4 h-4"></i> Expedited review</button>';
    }
    if (resource.status === 'published') return '<button class="button-muted text-xs" data-action="archive" data-id="' + resource.id + '"><i data-lucide="archive" class="w-4 h-4"></i> Archive</button>';
    return '<button class="button-primary text-xs" data-action="publish" data-id="' + resource.id + '"><i data-lucide="rotate-ccw" class="w-4 h-4"></i> Republish</button>';
  }

  async function handleAdminAction(event) {
    var button = event.target.closest('[data-action]');
    if (!button) return;
    var action = button.getAttribute('data-action');
    var id = button.getAttribute('data-id');
    var resource = adminResources.find(function (item) { return item.id === id; });
    if (!resource) return;
    if (action === 'edit') return openResourceEditor(resource);
    if (action === 'details') return openDetails(id);
    if (action === 'publish') return updateResourceStatus(id, 'published');
    if (action === 'bypass-approve') return bypassReviewAndApprove(resource);
    if (action === 'archive') return updateResourceStatus(id, 'archived');
    if (action === 'delete') {
      if (!window.confirm('Permanently delete "' + resource.title + '" and all of its ratings and notes?')) return;
      var result = await client.from('resources').delete().eq('id', id);
      if (result.error) return showToast(result.error.message, 'error');
      showToast('Resource deleted.', 'success');
      await reloadAfterAdminChange();
    }
  }

  async function updateResourceStatus(id, status) {
    var resource = adminResources.find(function (item) { return item.id === id; });
    var payload = { status: status };
    if (status === 'published' && resource && !resource.included_date) payload.included_date = todayIso();
    var result = await client.from('resources').update(payload).eq('id', id);
    if (result.error) return showToast(result.error.message, 'error');
    showToast(status === 'published' ? 'Resource published.' : 'Resource archived.', 'success');
    await reloadAfterAdminChange();
  }

  async function bypassReviewAndApprove(resource) {
    if (!window.confirm('Approve “' + resource.title + '” through the documented expedited-review process without individual ratings?')) return;
    var result = await client.rpc('bypass_review_and_approve', { target_resource_id: resource.id });
    if (result.error) return showToast(friendlyDatabaseError(result.error), 'error');
    showToast('Resource approved through expedited review.', 'success');
    await reloadAfterAdminChange();
  }

  function openResourceEditor(resource) {
    document.getElementById('resource-form').reset();
    document.getElementById('resource-id').value = resource ? resource.id : '';
    document.getElementById('resource-modal-title').textContent = resource ? 'Edit resource' : 'Add resource';
    if (resource) {
      document.getElementById('resource-title').value = resource.title || '';
      document.getElementById('resource-url').value = resource.url || '';
      document.getElementById('resource-provider').value = resource.provider || '';
      document.getElementById('resource-length').value = resource.length || '';
      document.getElementById('resource-type').value = resource.resource_type || 'Website';
      document.getElementById('resource-status').value = resource.status || 'pending';
      document.getElementById('resource-published-date').value = resource.published_date || '';
      document.getElementById('resource-included-date').value = resource.included_date || '';
      document.getElementById('resource-summary').value = resource.summary || '';
      document.getElementById('resource-audience').value = (resource.audience || []).join(', ');
      document.getElementById('resource-topics').value = (resource.topics || []).join(', ');
      document.getElementById('resource-grades').value = (resource.grade_ranges || []).join(', ');
      document.getElementById('resource-assessment-types').value = (resource.assessment_types || []).join(', ');
    } else {
      document.getElementById('resource-status').value = 'pending';
      document.getElementById('resource-included-date').value = '';
    }
    openModal('resource-modal');
  }

  async function saveResource(event) {
    event.preventDefault();
    var id = document.getElementById('resource-id').value;
    var payload = {
      title: cleanValue('resource-title'),
      url: sanitizeUrl(cleanValue('resource-url')),
      provider: cleanValue('resource-provider'),
      length: cleanValue('resource-length') || null,
      resource_type: cleanValue('resource-type'),
      status: cleanValue('resource-status'),
      published_date: cleanValue('resource-published-date') || null,
      included_date: cleanValue('resource-included-date') || null,
      summary: cleanValue('resource-summary'),
      audience: readCommaList('resource-audience', ['Public']),
      topics: readCommaList('resource-topics', []),
      grade_ranges: readCommaList('resource-grades', ['All Grades']),
      assessment_types: readCommaList('resource-assessment-types', [])
    };
    if (payload.status === 'published' && !payload.included_date) payload.included_date = todayIso();
    var button = document.getElementById('resource-save');
    setButtonLoading(button, true, 'Saving...');
    var result = id ? await client.from('resources').update(payload).eq('id', id) : await client.from('resources').insert(payload);
    setButtonLoading(button, false, 'Save resource');
    if (result.error) return showToast(friendlyDatabaseError(result.error), 'error');
    closeAllModals();
    showToast(id ? 'Resource updated.' : 'Resource added.', 'success');
    await reloadAfterAdminChange();
  }

  function openBulkImport() {
    var form = document.getElementById('bulk-import-form');
    var feedback = document.getElementById('bulk-import-feedback');
    form.reset();
    feedback.textContent = '';
    feedback.className = 'hidden text-sm';
    openModal('bulk-import-modal');
  }

  async function importBulkResources(event) {
    event.preventDefault();
    if (!client) return;
    var fileInput = document.getElementById('bulk-import-file');
    var feedback = document.getElementById('bulk-import-feedback');
    var button = document.getElementById('bulk-import-save');
    var file = fileInput.files && fileInput.files[0];
    if (!file) return showBulkImportFeedback('Choose a CSV or Excel file to continue.', 'error');
    if (!window.XLSX) return showBulkImportFeedback('The spreadsheet reader did not load. Refresh the page and try again.', 'error');

    setButtonLoading(button, true, 'Validating...');
    feedback.className = 'hidden text-sm';
    try {
      var rawRows = await readSpreadsheetRows(file);
      var normalized = normalizeBulkRows(rawRows);
      if (normalized.issues.length) {
        setButtonLoading(button, false, 'Validate and import');
        return showBulkImportFeedback('Import not started. ' + normalized.issues.length + ' issue(s): ' + normalized.issues.slice(0, 6).join(' '), 'error');
      }
      if (!normalized.rows.length) {
        setButtonLoading(button, false, 'Validate and import');
        return showBulkImportFeedback('Import not started. The file did not contain any resource rows.', 'error');
      }

      var existingResult = await client.from('resources').select('url');
      if (existingResult.error) throw existingResult.error;
      var knownUrls = new Set((existingResult.data || []).map(function (resource) { return canonicalUrl(resource.url); }));
      var rowsToImport = [];
      var skipped = 0;
      normalized.rows.forEach(function (row) {
        var urlKey = canonicalUrl(row.url);
        if (knownUrls.has(urlKey)) {
          skipped += 1;
          return;
        }
        knownUrls.add(urlKey);
        rowsToImport.push(row);
      });
      if (!rowsToImport.length) {
        setButtonLoading(button, false, 'Validate and import');
        return showBulkImportFeedback('No resources were imported because every URL already exists in the Commons.', 'error');
      }

      setButtonLoading(button, true, 'Importing...');
      for (var start = 0; start < rowsToImport.length; start += 100) {
        var result = await client.from('resources').insert(rowsToImport.slice(start, start + 100));
        if (result.error) throw result.error;
      }
      closeAllModals();
      showToast(rowsToImport.length + ' resource' + (rowsToImport.length === 1 ? '' : 's') + ' imported as pending review' + (skipped ? '; ' + skipped + ' duplicate URL(s) skipped' : '') + '.', 'success');
      await reloadAfterAdminChange();
    } catch (error) {
      setButtonLoading(button, false, 'Validate and import');
      showBulkImportFeedback(friendlyDatabaseError(error), 'error');
    }
  }

  function readSpreadsheetRows(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('The selected file could not be read.')); };
      reader.onload = function (event) {
        try {
          var workbook = window.XLSX.read(event.target.result, { type: 'array', cellDates: true });
          var sheetName = workbook.SheetNames[0];
          if (!sheetName) throw new Error('The spreadsheet does not contain a worksheet.');
          var rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '', raw: false });
          resolve(rows);
        } catch (error) {
          reject(new Error('The file could not be parsed as CSV or Excel. Confirm that it has a header row.'));
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  function normalizeBulkRows(rawRows) {
    var issues = [];
    var rows = [];
    var allowedTypes = ['Document', 'Website', 'Video', 'Podcast', 'Toolkit', 'Course', 'Journal Article'];
    rawRows.forEach(function (sourceRow, index) {
      var rowNumber = index + 2;
      var row = normalizeBulkRowKeys(sourceRow);
      var title = String(row.title || '').trim();
      var url = sanitizeUrl(String(row.url || '').trim());
      var provider = String(row.provider || '').trim();
      var summary = String(row.summary || row.description || '').trim();
      if (!title || !provider || !summary || url === '#') {
        issues.push('Row ' + rowNumber + ' needs a valid title, URL, provider, and summary.');
        return;
      }
      if (title.length > 240 || provider.length > 200 || summary.length > 2000) {
        issues.push('Row ' + rowNumber + ' exceeds the allowed title, provider, or summary length.');
        return;
      }
      var requestedType = String(row.resource_type || row.type || 'Website').trim().toLowerCase();
      var resourceType = allowedTypes.find(function (type) { return type.toLowerCase() === requestedType; }) || 'Website';
      var publishedDate = normalizeImportDate(row.published_date);
      if (row.published_date && !publishedDate) {
        issues.push('Row ' + rowNumber + ' has an invalid published_date. Use YYYY-MM-DD.');
        return;
      }
      rows.push({
        title: title,
        url: url,
        provider: provider,
        summary: summary,
        length: String(row.length || '').trim().slice(0, 100) || null,
        resource_type: resourceType,
        status: 'pending',
        published_date: publishedDate,
        included_date: null,
        audience: importList(row.audience, ['Public']),
        topics: importList(row.topics, []),
        grade_ranges: importList(row.grade_ranges || row.grades, ['All Grades']),
        assessment_types: importList(row.assessment_types || row.assessment_type, [])
      });
    });
    return { rows: rows, issues: issues };
  }

  function normalizeBulkRowKeys(sourceRow) {
    var aliases = {
      title: 'title', 'resource title': 'title', 'resource_name': 'title',
      url: 'url', link: 'url', 'resource url': 'url',
      provider: 'provider', organization: 'provider', source: 'provider',
      summary: 'summary', description: 'summary', 'practical use': 'summary',
      resource_type: 'resource_type', 'resource type': 'resource_type', type: 'resource_type',
      length: 'length', 'length or format detail': 'length',
      audience: 'audience', audiences: 'audience',
      topics: 'topics', topic: 'topics',
      grade_ranges: 'grade_ranges', 'grade ranges': 'grade_ranges', grades: 'grade_ranges',
      assessment_types: 'assessment_types', 'assessment types': 'assessment_types', 'assessment type': 'assessment_types',
      published_date: 'published_date', 'published date': 'published_date', 'original publication date': 'published_date'
    };
    var row = {};
    Object.keys(sourceRow || {}).forEach(function (key) {
      var normalizedKey = String(key).trim().toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
      var canonicalKey = aliases[normalizedKey] || aliases[normalizedKey.replace(/ /g, '_')];
      if (canonicalKey) row[canonicalKey] = sourceRow[key];
    });
    return row;
  }

  function importList(value, fallback) {
    var list = String(value || '').split(/[;|]/).map(function (item) { return item.trim(); }).filter(Boolean);
    return uniqueValues(list).length ? uniqueValues(list) : fallback;
  }

  function normalizeImportDate(value) {
    var input = String(value || '').trim();
    if (!input) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return null;
    var date = new Date(input + 'T00:00:00Z');
    return Number.isNaN(date.getTime()) ? null : input;
  }

  function canonicalUrl(value) {
    var url = sanitizeUrl(value);
    return url === '#' ? '' : url.replace(/\/$/, '');
  }

  function showBulkImportFeedback(message, type) {
    var feedback = document.getElementById('bulk-import-feedback');
    feedback.textContent = message;
    feedback.className = 'text-sm ' + (type === 'error' ? 'text-red-700' : 'text-emerald-700');
  }

  function exportResourcesCsv() {
    if (!adminResources.length) return showToast('There are no resources to export.', 'error');
    var headers = ['title', 'url', 'provider', 'summary', 'length', 'resource_type', 'status', 'published_date', 'included_date', 'audience', 'topics', 'grade_ranges', 'assessment_types', 'ratings_count', 'average_score', 'review_bypassed', 'created_at', 'updated_at'];
    var csv = [headers.join(',')].concat(adminResources.map(function (resource) {
      return headers.map(function (header) {
        var value = resource[header];
        if (Array.isArray(value)) value = value.join(' | ');
        return csvCell(value);
      }).join(',');
    })).join('\r\n');
    downloadFile('classroom-assessment-commons-resources-' + todayIso() + '.csv', csv, 'text/csv;charset=utf-8');
    showToast('Resource CSV exported.', 'success');
  }

  function exportBackup() {
    var backup = {
      generated_at: new Date().toISOString(),
      resources: adminResources,
      ratings: adminRatings,
      resource_notes: adminNotes
    };
    downloadFile('classroom-assessment-commons-backup-' + todayIso() + '.json', JSON.stringify(backup, null, 2), 'application/json');
    showToast('Review data backup exported.', 'success');
  }

  function csvCell(value) {
    var text = value === null || value === undefined ? '' : String(value);
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function downloadFile(filename, content, type) {
    var blob = new Blob([content], { type: type });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  async function handleSubmission(event) {
    event.preventDefault();
    if (!client) return;
    var payload = {
      title: cleanValue('submission-title-input'),
      url: sanitizeUrl(cleanValue('submission-url')),
      submitter_name: cleanValue('submission-name'),
      submitter_email: cleanValue('submission-email'),
      provider: cleanValue('submission-provider') || 'Contributor Submission',
      resource_type: cleanValue('submission-type'),
      summary: cleanValue('submission-rationale'),
      submission_rationale: cleanValue('submission-rationale'),
      audience: ['Public'], topics: [], grade_ranges: ['All Grades'], assessment_types: [], status: 'pending'
    };
    var button = document.getElementById('submission-save');
    setButtonLoading(button, true, 'Submitting...');
    var result = await client.from('resources').insert(payload);
    setButtonLoading(button, false, 'Send for review');
    if (result.error) return showToast(friendlyDatabaseError(result.error), 'error');
    closeAllModals();
    document.getElementById('submission-form').reset();
    showToast('Thank you. The resource was sent for reviewer approval.', 'success');
  }

  function renderRatingCriteria() {
    var container = document.getElementById('rating-criteria');
    container.innerHTML = '';
    ratingDefinitions.forEach(function (criterion) {
      var wrapper = document.createElement('div');
      wrapper.className = 'bg-slate-50 border border-slate-200 rounded-xl p-4';
      wrapper.innerHTML = '<label class="block font-bold text-sm text-slate-800" for="rating-' + criterion.key + '">' + escapeHtml(criterion.label) + '</label>' +
        '<p class="text-xs text-slate-500 mt-1 mb-3">' + escapeHtml(criterion.description) + '</p><select id="rating-' + criterion.key + '" class="form-control rating-select" required>' +
        '<option value="">Choose a score...</option>' + ratingOptions.map(function (option) {
          return '<option value="' + option.value + '">' + escapeHtml(option.label) + '</option>';
        }).join('') + '</select>';
      container.appendChild(wrapper);
    });
  }

  function openRatingEditor(resourceId, rating) {
    var resource = adminResources.find(function (item) { return item.id === resourceId; });
    if (!resource) return;
    document.getElementById('rating-form').reset();
    document.getElementById('rating-id').value = rating ? rating.id : '';
    document.getElementById('rating-resource-id').value = resourceId;
    document.getElementById('rating-modal-title').textContent = rating ? 'Revise rating' : 'Rate resource';
    document.getElementById('rating-resource-name').textContent = resource.title;
    if (rating) {
      document.getElementById('rating-reviewer').value = rating.reviewer_name || '';
      ratingDefinitions.forEach(function (criterion) {
        document.getElementById('rating-' + criterion.key).value = String(rating[criterion.key]);
      });
      document.getElementById('rating-notes').value = rating.comments || '';
    }
    updateRatingTotal();
    openModal('rating-modal');
  }

  function updateRatingTotal() {
    var total = ratingDefinitions.reduce(function (sum, criterion) {
      return sum + (Number(document.getElementById('rating-' + criterion.key).value) || 0);
    }, 0);
    document.getElementById('rating-total').textContent = 'Total: ' + total + ' / 20';
  }

  async function saveRating(event) {
    event.preventDefault();
    var id = document.getElementById('rating-id').value;
    var resourceId = document.getElementById('rating-resource-id').value;
    var payload = { resource_id: resourceId, reviewer_name: cleanValue('rating-reviewer'), comments: cleanValue('rating-notes') || null };
    ratingDefinitions.forEach(function (criterion) {
      payload[criterion.key] = Number(document.getElementById('rating-' + criterion.key).value);
    });
    var button = document.getElementById('rating-save');
    setButtonLoading(button, true, 'Saving...');
    var result = id ? await client.from('ratings').update(payload).eq('id', id) : await client.from('ratings').insert(payload);
    setButtonLoading(button, false, 'Save rating');
    if (result.error) return showToast(friendlyDatabaseError(result.error), 'error');
    closeAllModals();
    showToast(id ? 'Rating revised.' : 'Rating saved.', 'success');
    await reloadAfterAdminChange();
    await openDetails(resourceId);
  }

  async function openDetails(resourceId) {
    currentDetailsResourceId = resourceId;
    var resource = adminResources.find(function (item) { return item.id === resourceId; });
    if (!resource) return;
    document.getElementById('details-resource-name').textContent = resource.title;
    document.getElementById('note-resource-id').value = resourceId;
    renderResourceRatings(resourceId);
    renderResourceNotes(resourceId);
    openModal('details-modal');
  }

  function renderResourceRatings(resourceId) {
    var container = document.getElementById('details-ratings');
    var resource = adminResources.find(function (item) { return item.id === resourceId; });
    var ratings = adminRatings.filter(function (item) { return item.resource_id === resourceId; });
    if (!ratings.length) {
      container.innerHTML = resource && resource.review_bypassed ?
        '<div class="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-900"><strong>Expedited approval:</strong> Individual ratings were bypassed by an authorized reviewer, and the decision is recorded in the resource record.</div>' :
        '<div class="bg-slate-50 border border-slate-200 rounded-xl p-5 text-sm text-slate-500">No ratings have been entered for this resource.</div>';
      return;
    }
    container.innerHTML = ratings.map(function (rating) {
      return '<article class="border border-slate-200 rounded-xl p-4"><div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3">' +
        '<div><h4 class="font-bold text-slate-900">' + escapeHtml(rating.reviewer_name) + '</h4><p class="text-xs text-slate-400 mt-1">Updated ' +
        escapeHtml(formatDate(rating.updated_at)) + '</p></div><div class="flex items-center gap-2"><span class="rating-score px-3 py-1 rounded-full bg-blue-50 text-blue-800 font-extrabold text-sm">' +
        Number(rating.total_score) + ' / 20</span><button class="icon-button" data-rating-action="edit" data-id="' + rating.id + '" aria-label="Edit rating">' +
        '<i data-lucide="pencil" class="w-4 h-4"></i></button><button class="icon-button text-red-600" data-rating-action="delete" data-id="' + rating.id +
        '" aria-label="Delete rating"><i data-lucide="trash-2" class="w-4 h-4"></i></button></div></div><div class="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-4">' +
        ratingDefinitions.map(function (criterion) {
          return '<div class="bg-slate-50 rounded-lg p-2 text-center"><div class="text-[10px] text-slate-500">' + escapeHtml(shortCriterionName(criterion.key)) +
            '</div><div class="font-bold text-slate-800 mt-1">' + Number(rating[criterion.key]) + ' / 4</div></div>';
        }).join('') + '</div>' + (rating.comments ? '<p class="text-sm text-slate-600 mt-4 border-t border-slate-100 pt-3 whitespace-pre-wrap">' +
        escapeHtml(rating.comments) + '</p>' : '') + '</article>';
    }).join('');
    refreshIcons();
  }

  async function handleRatingAction(event) {
    var button = event.target.closest('[data-rating-action]');
    if (!button) return;
    var rating = adminRatings.find(function (item) { return item.id === button.getAttribute('data-id'); });
    if (!rating) return;
    if (button.getAttribute('data-rating-action') === 'edit') {
      closeAllModals();
      return openRatingEditor(rating.resource_id, rating);
    }
    if (!window.confirm('Delete the rating entered by ' + rating.reviewer_name + '?')) return;
    var result = await client.from('ratings').delete().eq('id', rating.id);
    if (result.error) return showToast(result.error.message, 'error');
    showToast('Rating deleted.', 'success');
    await reloadAfterAdminChange();
    await openDetails(rating.resource_id);
  }

  async function saveNote(event) {
    event.preventDefault();
    var resourceId = document.getElementById('note-resource-id').value;
    var result = await client.from('resource_notes').insert({
      resource_id: resourceId, author_name: cleanValue('note-author'), note: cleanValue('note-text')
    });
    if (result.error) return showToast(result.error.message, 'error');
    document.getElementById('note-text').value = '';
    showToast('Internal note added.', 'success');
    await reloadAfterAdminChange();
    await openDetails(resourceId);
  }

  function renderResourceNotes(resourceId) {
    var container = document.getElementById('details-notes');
    var notes = adminNotes.filter(function (item) { return item.resource_id === resourceId; });
    if (!notes.length) {
      container.innerHTML = '<p class="text-sm text-slate-500">No internal notes have been added.</p>';
      return;
    }
    container.innerHTML = notes.map(function (note) {
      return '<article class="bg-amber-50/60 border border-amber-100 rounded-xl p-4"><div class="flex items-start justify-between gap-4"><div>' +
        '<p class="text-xs font-bold text-amber-900">' + escapeHtml(note.author_name) + '</p><p class="text-xs text-amber-700/70 mt-1">' +
        escapeHtml(formatDate(note.created_at)) + '</p></div><button class="icon-button text-red-600" data-note-action="delete" data-id="' + note.id +
        '" aria-label="Delete note"><i data-lucide="trash-2" class="w-4 h-4"></i></button></div><p class="text-sm text-slate-700 mt-3 whitespace-pre-wrap">' +
        escapeHtml(note.note) + '</p></article>';
    }).join('');
    refreshIcons();
  }

  async function handleNoteAction(event) {
    var button = event.target.closest('[data-note-action]');
    if (!button) return;
    var note = adminNotes.find(function (item) { return item.id === button.getAttribute('data-id'); });
    if (!note || !window.confirm('Delete this internal note?')) return;
    var result = await client.from('resource_notes').delete().eq('id', note.id);
    if (result.error) return showToast(result.error.message, 'error');
    showToast('Note deleted.', 'success');
    await reloadAfterAdminChange();
    await openDetails(note.resource_id);
  }

  async function reloadAfterAdminChange() {
    await loadAdminData();
    await loadPublicResources();
  }

  function openModal(id) {
    var previouslyFocused = document.activeElement;
    closeAllModals(false);
    lastFocusedElement = previouslyFocused && typeof previouslyFocused.focus === 'function' ? previouslyFocused : null;
    document.getElementById('modal-backdrop').classList.remove('hidden');
    document.getElementById('modal-backdrop').setAttribute('aria-hidden', 'false');
    var modal = document.getElementById(id);
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    var target = modal.querySelector('input:not([type="hidden"]), select, textarea, button');
    if (target) window.setTimeout(function () { target.focus(); }, 20);
    refreshIcons();
  }

  function closeAllModals(restoreFocus) {
    var pathwayWasOpen = !document.getElementById('pathway-modal').classList.contains('hidden');
    Array.prototype.forEach.call(document.querySelectorAll('.modal'), function (modal) { modal.classList.add('hidden'); });
    document.getElementById('modal-backdrop').classList.add('hidden');
    document.getElementById('modal-backdrop').setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (pathwayWasOpen) {
      activePathway = null;
      updatePathwayUI();
    }
    if (restoreFocus !== false && lastFocusedElement && document.contains(lastFocusedElement)) {
      var focusTarget = lastFocusedElement;
      lastFocusedElement = null;
      window.setTimeout(function () { focusTarget.focus(); }, 20);
    }
  }

  function keepFocusInModal(event) {
    var modal = Array.prototype.find.call(document.querySelectorAll('.modal'), function (item) {
      return !item.classList.contains('hidden');
    });
    if (!modal) return;
    var focusable = Array.prototype.filter.call(modal.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'), function (item) {
      return item.offsetParent !== null;
    });
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function showToast(message, type) {
    var toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast ' + (type || '');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toast.classList.add('hidden'); }, 4500);
  }

  function setButtonLoading(button, loading, label) {
    button.disabled = loading;
    button.textContent = label;
  }

  function recordSiteVisit() {
    var visitorId;
    try {
      visitorId = window.localStorage.getItem('cac_visitor_id');
      if (!visitorId) {
        visitorId = window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() :
          'cac-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
        window.localStorage.setItem('cac_visitor_id', visitorId);
      }
    } catch (_error) {
      visitorId = 'session-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    }
    client.rpc('record_site_visit', {
      p_visitor_id: visitorId,
      p_path: String(window.location.pathname || '/').slice(0, 300)
    }).then(function () {}).catch(function () {});
  }

  function cleanValue(id) { return document.getElementById(id).value.trim(); }
  function readCommaList(id, fallback) {
    var values = uniqueValues(cleanValue(id).split(',').map(function (item) { return item.trim(); }).filter(Boolean));
    return values.length ? values : fallback;
  }
  function uniqueValues(values) {
    return Array.from(new Set((values || []).filter(Boolean))).sort(function (a, b) { return String(a).localeCompare(String(b)); });
  }
  function flatMap(items, key) {
    return items.reduce(function (all, item) { return all.concat(item[key] || []); }, []);
  }
  function sanitizeUrl(value) {
    try {
      var url = new URL(value);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Unsupported URL');
      return url.href;
    } catch (_error) { return '#'; }
  }
  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
  function escapeAttribute(value) { return escapeHtml(value); }
  function formatDate(value) {
    if (!value) return 'date unavailable';
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  }
  function formatDateOnly(value, fallback) {
    if (!value) return fallback || 'Unknown';
    var parts = String(value).slice(0, 10).split('-');
    if (parts.length !== 3) return fallback || String(value);
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(
      new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])))
    );
  }
  function todayIso() { return new Date().toISOString().slice(0, 10); }
  function iconForType(type) {
    var icons = { Video: 'video', Podcast: 'mic', Website: 'globe-2', Toolkit: 'briefcase-business', Course: 'graduation-cap', 'Journal Article': 'book-open' };
    return icons[type] || 'file-text';
  }
  function shortCriterionName(key) {
    var labels = { alignment: 'Alignment', utility: 'Utility', equity: 'Equity', quality: 'Quality', currency: 'Currency' };
    return labels[key] || key;
  }
  function friendlyDatabaseError(error) {
    if (error.code === '23505') return 'This resource URL or reviewer rating already exists. Edit the existing record instead.';
    return error.message || 'The change could not be saved.';
  }
  function refreshIcons() { if (window.lucide) window.lucide.createIcons(); }
  function handleUnexpectedError(error) {
    console.error(error);
    showToast('An unexpected connection error occurred.', 'error');
  }
})();
