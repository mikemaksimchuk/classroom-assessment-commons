(function () {
  'use strict';
  var config = window.CAC_CONFIG || {};
  var client = null;
  var session = null;
  var publicResources = [];
  var adminResources = [];
  var adminRatings = [];
  var adminNotes = [];
  var activeAdminStatus = 'all';
  var currentDetailsResourceId = null;
  var toastTimer = null;

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
    document.getElementById('explore-button').addEventListener('click', showPublicView);
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
    document.getElementById('clear-filters').addEventListener('click', clearFilters);
    document.getElementById('catalog-search').addEventListener('input', renderPublicCatalog);
    document.getElementById('admin-search').addEventListener('input', renderAdminResources);
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('submission-form').addEventListener('submit', handleSubmission);
    document.getElementById('resource-form').addEventListener('submit', saveResource);
    document.getElementById('rating-form').addEventListener('submit', saveRating);
    document.getElementById('note-form').addEventListener('submit', saveNote);
    document.getElementById('rating-criteria').addEventListener('change', updateRatingTotal);
    document.getElementById('admin-resource-list').addEventListener('click', handleAdminAction);
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
      if (event.key === 'Escape') closeAllModals();
    });
  }

  async function loadPublicResources() {
    setPublicLoading(true);
    var result = await client.from('resources')
      .select('id,title,url,provider,summary,length,resource_type,audience,topics,grade_ranges,assessment_types,ratings_count,average_score,seal,created_at')
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
    return '<div class="bg-white/10 border border-white/15 backdrop-blur rounded-xl p-4 ' + (extraClass || '') + '">' +
      '<div class="text-2xl font-extrabold">' + escapeHtml(String(value)) + '</div>' +
      '<div class="text-xs text-blue-100 mt-1">' + escapeHtml(label) + '</div></div>';
  }

  function renderFilterControls() {
    var controls = document.getElementById('filter-controls');
    var groups = [
      { key: 'audience', label: 'Audience', values: uniqueValues(flatMap(publicResources, 'audience')) },
      { key: 'topics', label: 'Topic', values: uniqueValues(flatMap(publicResources, 'topics')) },
      { key: 'resource_type', label: 'Resource type', values: uniqueValues(publicResources.map(function (item) { return item.resource_type; })) }
    ];
    controls.innerHTML = '';
    groups.forEach(function (group) {
      var section = document.createElement('fieldset');
      section.className = 'border-t border-slate-100 pt-4';
      var legend = document.createElement('legend');
      legend.className = 'text-xs font-bold text-slate-700 mb-2';
      legend.textContent = group.label;
      section.appendChild(legend);
      var list = document.createElement('div');
      list.className = 'space-y-2 max-h-48 overflow-y-auto pr-1';
      group.values.forEach(function (value) {
        var label = document.createElement('label');
        label.className = 'flex items-start gap-2 text-xs text-slate-600 cursor-pointer';
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
    var grid = document.getElementById('resource-grid');
    grid.innerHTML = '';
    filtered.forEach(function (resource) { grid.appendChild(createResourceCard(resource)); });
    document.getElementById('result-count').textContent = filtered.length + (filtered.length === 1 ? ' resource' : ' resources');
    document.getElementById('empty-state').classList.toggle('hidden', filtered.length !== 0);
    refreshIcons();
  }

  function createResourceCard(resource) {
    var card = document.createElement('article');
    card.className = 'resource-card';
    var seal = '';
    if (resource.seal) {
      var sealClass = resource.seal === 'Gold' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-700 border-slate-300';
      seal = '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-bold ' + sealClass + '">' +
        '<i data-lucide="star" class="w-3 h-3"></i>' + escapeHtml(resource.seal) + ' Standard</span>';
    }
    var safeUrl = sanitizeUrl(resource.url);
    var tags = (resource.topics || []).slice(0, 3).concat((resource.audience || []).slice(0, 2));
    card.innerHTML =
      '<div class="flex items-start justify-between gap-4 mb-4">' +
        '<div class="p-2.5 bg-blue-50 text-blue-700 rounded-xl"><i data-lucide="' + iconForType(resource.resource_type) + '" class="w-5 h-5"></i></div>' +
        '<div class="flex flex-col items-end gap-1">' + seal +
          '<span class="text-[10px] font-bold text-slate-500 bg-slate-100 rounded px-2 py-1">' + escapeHtml(resource.resource_type || 'Resource') + '</span></div></div>' +
      '<h3 class="text-lg font-bold text-slate-900 leading-snug"><a class="hover:text-blue-700 hover:underline" href="' + escapeAttribute(safeUrl) +
        '" target="_blank" rel="noopener noreferrer">' + escapeHtml(resource.title) + '<span class="sr-only"> (opens in a new tab)</span></a></h3>' +
      '<p class="text-xs font-semibold text-slate-500 mt-2">Provider: <span class="text-slate-700">' + escapeHtml(resource.provider) + '</span></p>' +
      '<p class="text-sm text-slate-600 leading-relaxed mt-4 flex-grow">' + escapeHtml(resource.summary) + '</p>' +
      '<div class="mt-5 pt-4 border-t border-slate-100"><div class="flex items-center justify-between gap-3 mb-3 text-xs text-slate-400">' +
        '<span>' + escapeHtml(resource.length || 'Length not specified') + '</span><span>' + Number(resource.ratings_count || 0) + ' verified rating' +
        (Number(resource.ratings_count || 0) === 1 ? '' : 's') + '</span></div><div class="flex flex-wrap gap-1.5">' +
        tags.map(function (tag) { return '<span class="tag">' + escapeHtml(tag) + '</span>'; }).join('') + '</div></div>';
    return card;
  }

  function clearFilters() {
    document.getElementById('catalog-search').value = '';
    Array.prototype.forEach.call(document.querySelectorAll('[data-filter-key]'), function (input) { input.checked = false; });
    renderPublicCatalog();
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
    renderAdminSummary();
    renderAdminResources();
  }

  function renderAdminSummary() {
    var published = adminResources.filter(function (item) { return item.status === 'published'; }).length;
    var pending = adminResources.filter(function (item) { return item.status === 'pending'; }).length;
    var reviewed = adminResources.filter(function (item) { return Number(item.ratings_count) >= 3; }).length;
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
      var average = resource.average_score === null ? 'No average' : Number(resource.average_score).toFixed(1) + ' / 20';
      row.innerHTML =
        '<div class="flex flex-col xl:flex-row xl:items-center justify-between gap-5"><div class="min-w-0 flex-1">' +
        '<div class="flex flex-wrap items-center gap-2 mb-2"><span class="status-pill status-' + escapeAttribute(resource.status) + '">' + escapeHtml(resource.status) + '</span>' +
        (resource.seal ? '<span class="status-pill ' + (resource.seal === 'Gold' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700') + '">' + escapeHtml(resource.seal) + '</span>' : '') +
        '</div><h3 class="font-bold text-slate-900">' + escapeHtml(resource.title) + '</h3>' +
        '<p class="text-xs text-slate-500 mt-1">' + escapeHtml(resource.provider) + ' · ' + escapeHtml(resource.resource_type) + ' · ' +
        escapeHtml(ratingLabel) + ' · ' + escapeHtml(average) + '</p>' + submitter + '</div>' +
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

  function statusActionButtons(resource) {
    if (resource.status === 'pending') return '<button class="button-primary text-xs" data-action="publish" data-id="' + resource.id + '"><i data-lucide="check" class="w-4 h-4"></i> Publish</button>';
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
    var result = await client.from('resources').update({ status: status }).eq('id', id);
    if (result.error) return showToast(result.error.message, 'error');
    showToast(status === 'published' ? 'Resource published.' : 'Resource archived.', 'success');
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
      document.getElementById('resource-summary').value = resource.summary || '';
      document.getElementById('resource-audience').value = (resource.audience || []).join(', ');
      document.getElementById('resource-topics').value = (resource.topics || []).join(', ');
      document.getElementById('resource-grades').value = (resource.grade_ranges || []).join(', ');
      document.getElementById('resource-assessment-types').value = (resource.assessment_types || []).join(', ');
    } else {
      document.getElementById('resource-status').value = 'pending';
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
      summary: cleanValue('resource-summary'),
      audience: readCommaList('resource-audience', ['Public']),
      topics: readCommaList('resource-topics', []),
      grade_ranges: readCommaList('resource-grades', ['All Grades']),
      assessment_types: readCommaList('resource-assessment-types', [])
    };
    var button = document.getElementById('resource-save');
    setButtonLoading(button, true, 'Saving...');
    var result = id ? await client.from('resources').update(payload).eq('id', id) : await client.from('resources').insert(payload);
    setButtonLoading(button, false, 'Save resource');
    if (result.error) return showToast(friendlyDatabaseError(result.error), 'error');
    closeAllModals();
    showToast(id ? 'Resource updated.' : 'Resource added.', 'success');
    await reloadAfterAdminChange();
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
    var ratings = adminRatings.filter(function (item) { return item.resource_id === resourceId; });
    if (!ratings.length) {
      container.innerHTML = '<div class="bg-slate-50 border border-slate-200 rounded-xl p-5 text-sm text-slate-500">No ratings have been entered for this resource.</div>';
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
    closeAllModals();
    document.getElementById('modal-backdrop').classList.remove('hidden');
    document.getElementById('modal-backdrop').setAttribute('aria-hidden', 'false');
    var modal = document.getElementById(id);
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    var target = modal.querySelector('input:not([type="hidden"]), select, textarea, button');
    if (target) window.setTimeout(function () { target.focus(); }, 20);
    refreshIcons();
  }

  function closeAllModals() {
    Array.prototype.forEach.call(document.querySelectorAll('.modal'), function (modal) { modal.classList.add('hidden'); });
    document.getElementById('modal-backdrop').classList.add('hidden');
    document.getElementById('modal-backdrop').setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
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
