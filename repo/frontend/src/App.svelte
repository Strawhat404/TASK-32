<script>
  import { onMount } from 'svelte';
  import ForumSectionTree from './components/ForumSectionTree.svelte';
  import CommerceTab from './components/CommerceTab.svelte';
  import MasterDataTab from './components/MasterDataTab.svelte';

  const ROLE_LABELS = {
    admin: 'Administrator',
    moderator: 'Moderator',
    host: 'Store Manager',
    user: 'Customer/Member',
    inventory_clerk: 'Inventory Clerk',
    store_manager: 'Store Manager',
    customer_member: 'Customer/Member',
  };

  const NAV_BY_ROLE = {
    Administrator: ['scripts', 'resources', 'bookings', 'forum', 'scoring', 'commerce', 'master'],
    'Store Manager': ['scripts', 'resources', 'bookings', 'forum', 'scoring', 'commerce', 'master'],
    'Inventory Clerk': ['scripts', 'resources', 'master'],
    Moderator: ['forum'],
    'Customer/Member': ['bookings', 'forum', 'scoring', 'commerce'],
  };

  const TAB_LABELS = {
    scripts: 'Script Manager',
    resources: 'Resource Scheduler',
    bookings: 'Bookings',
    forum: 'Forum',
    scoring: 'Scoring',
    commerce: 'Shop & Checkout',
    master: 'Master Data',
  };

  let token = '';
  let user = null;
  let roleLabel = '';
  let activeTab = 'scripts';
  let error = '';
  let notice = '';
  let undoAction = null;
  let selectedStore = 'MAIN';

  let loginForm = { username: 'admin', password: '' };

  let scripts = [];
  let rooms = [];
  let businessHours = [];
  let hostSchedules = [];
  let bookings = [];
  let customers = [];
  let forumSections = [];
  let forumHierarchy = [];
  let forumThreads = [];
  let forumPosts = [];
  let forumTags = [];
  let filteredThreadsByTag = [];
  let pendingDeletions = [];
  let selectedSectionId = '';
  let selectedThreadId = '';
  let scoringLedger = [];
  let scoringRankings = [];

  let scriptValidation = '';
  let bookingValidation = '';
  let scoringValidation = '';
  let resourceValidation = '';
  let customerValidation = '';

  let scriptForm = {
    title: '',
    description: '',
    difficulty: 3,
    duration_minutes: 60,
    min_party_size: 2,
    max_party_size: 6,
    required_props: '',
    status: 'active',
    tags: '',
  };

  let roomForm = { name: '', room_type: 'room', capacity: 4 };
  let hoursForm = { weekday: 1, open_time: '09:00', close_time: '18:00', is_closed: false };
  let hostForm = {
    host_user_id: '',
    room_id: '',
    weekday: 1,
    start_time: '09:00',
    end_time: '17:00',
    is_available: true,
  };

  let bookingForm = {
    script_id: '',
    room_id: '',
    customer_name: '',
    customer_email: '',
    party_size: 2,
    start_at: '',
    end_at: '',
    notes: '',
  };

  let customerForm = {
    id: '',
    full_name: '',
    email: '',
    phone: '',
    address: '',
    notes: '',
    marketing_email_consent: false,
    marketing_sms_consent: false,
  };

  let forumSectionForm = { name: '', description: '', parent_section_id: '' };
  let forumThreadForm = { title: '', body: '', topic_tags: '' };
  let forumReplyForm = { body: '', parent_post_id: '' };
  let forumTagFilter = '';

  let scoringForm = {
    subject_id: '',
    round_key: '',
    store_code: 'MAIN',
    metric_a: '80',
    metric_b: '',
    weight_a: '0.6',
    weight_b: '0.4',
    strategy: 'drop',
    previous_score: '',
    previous_round_scores: '',
    mapping_rules: '{"a":{"80":95}}',
    from: '',
    to: '',
  };

  function buttonClasses(disabled = false) {
    return `rounded-md bg-black px-3 py-2 text-sm text-white transition hover:bg-slate-800 ${disabled ? 'cursor-not-allowed opacity-40' : ''}`;
  }

  function fieldClasses() {
    return 'w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-0 placeholder:text-slate-500';
  }

  function cardClasses() {
    return 'rounded-2xl border border-slate-800 bg-slate-950/80 p-4 shadow-[0_20px_80px_rgba(0,0,0,0.35)]';
  }

  function mapRole(role) {
    return ROLE_LABELS[role] || role;
  }

  function allowedTabs() {
    return NAV_BY_ROLE[roleLabel] || [];
  }

  function canModerate() {
    return roleLabel === 'Administrator' || roleLabel === 'Moderator';
  }

  function canAdminister() {
    return roleLabel === 'Administrator';
  }

  function canManageBookings() {
    return roleLabel === 'Administrator' || roleLabel === 'Store Manager';
  }

  function tabVisible(tab) {
    return allowedTabs().includes(tab);
  }

  function setNotice(message, action = null) {
    notice = message;
    undoAction = action;
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }
    return data;
  }

  async function login() {
    error = '';
    const result = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(loginForm),
    });
    token = result.token;
    user = result.user;
    roleLabel = result.user.role_label || mapRole(result.user.role);
    activeTab = allowedTabs()[0] || 'scripts';
    setNotice(`Signed in as ${roleLabel}.`);
    await hydrateAll();
  }

  async function hydrateAll() {
    if (!token) return;
    await Promise.all([
      loadScripts(),
      loadResources(),
      loadBookings(),
      loadCustomers(),
      loadForum(),
      loadScoringLedger(),
    ]);
  }

  async function loadScripts() {
    const result = await api('/api/scripts');
    scripts = result.items || [];
  }

  async function loadResources() {
    const [roomsResult, hoursResult, schedulesResult] = await Promise.all([
      api('/api/resources/rooms'),
      api('/api/resources/business-hours'),
      api('/api/resources/host-schedules'),
    ]);
    rooms = roomsResult.items || [];
    businessHours = hoursResult.items || [];
    hostSchedules = schedulesResult.items || [];
  }

  async function loadBookings() {
    const result = await api('/api/bookings');
    bookings = result.items || [];
  }

  async function loadCustomers() {
    if (!(roleLabel === 'Administrator' || roleLabel === 'Store Manager' || roleLabel === 'Inventory Clerk')) {
      customers = [];
      return;
    }
    const result = await api('/api/master/customers');
    customers = result.items || [];
  }

  async function loadForum() {
    const sectionsResult = await api('/api/forum/sections');
    forumSections = sectionsResult.items || [];
    forumHierarchy = sectionsResult.hierarchy || [];
    const tagsResult = await api('/api/forum/tags');
    forumTags = tagsResult.items || [];
    if (!selectedSectionId && forumSections.length) {
      selectedSectionId = forumSections[0].id;
    }
    if (selectedSectionId) {
      const threadsResult = await api(`/api/forum/threads?section_id=${selectedSectionId}`);
      forumThreads = threadsResult.items || [];
      if (!selectedThreadId && forumThreads.length) {
        selectedThreadId = forumThreads[0].id;
      }
    }
    if (selectedThreadId) {
      const postsResult = await api(`/api/forum/threads/${selectedThreadId}/posts`);
      forumPosts = postsResult.items || [];
    } else {
      forumPosts = [];
    }
  }

  async function loadScoringLedger() {
    if (!scoringForm.subject_id) {
      scoringLedger = [];
      return;
    }
    const result = await api(`/api/scoring/ledger/${encodeURIComponent(scoringForm.subject_id)}`);
    scoringLedger = result.items || [];
  }

  async function loadScoringRankings() {
    if (!scoringForm.store_code || !scoringForm.from || !scoringForm.to) {
      scoringValidation = 'Store code and date range are required to load rankings.';
      return;
    }
    const params = new URLSearchParams({
      store_code: scoringForm.store_code,
      from: scoringForm.from,
      to: scoringForm.to,
    });
    const result = await api(`/api/scoring/grades-rankings?${params.toString()}`);
    scoringRankings = result.rankings || [];
  }

  async function submitScript() {
    scriptValidation = '';
    if (scriptForm.min_party_size > scriptForm.max_party_size) {
      scriptValidation = 'Minimum party size must be less than or equal to the maximum.';
      return;
    }
    await api('/api/scripts', {
      method: 'POST',
      body: JSON.stringify({
        ...scriptForm,
        difficulty: Number(scriptForm.difficulty),
        duration_minutes: Number(scriptForm.duration_minutes),
        min_party_size: Number(scriptForm.min_party_size),
        max_party_size: Number(scriptForm.max_party_size),
        required_props: scriptForm.required_props.split(',').map((item) => item.trim()).filter(Boolean),
        tags: scriptForm.tags.split(',').map((item) => item.trim()).filter(Boolean),
      }),
    });
    scriptForm = {
      title: '',
      description: '',
      difficulty: 3,
      duration_minutes: 60,
      min_party_size: 2,
      max_party_size: 6,
      required_props: '',
      status: 'active',
      tags: '',
    };
    await loadScripts();
    setNotice('Script created.');
  }

  async function toggleScriptStatus(script) {
    const nextStatus = script.status === 'active' ? 'paused' : 'active';
    await api(`/api/scripts/${script.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: nextStatus }),
    });
    await loadScripts();
    setNotice(`Script moved to ${nextStatus}.`, {
      label: `Undo ${script.title}`,
      run: async () => {
        await api(`/api/scripts/${script.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: script.status }),
        });
        await loadScripts();
        setNotice('Undo complete.');
      },
    });
  }

  async function submitRoom() {
    resourceValidation = '';
    if (Number(roomForm.capacity) <= 0) {
      resourceValidation = 'Capacity must be greater than zero.';
      return;
    }
    await api('/api/resources/rooms', {
      method: 'POST',
      body: JSON.stringify({
        ...roomForm,
        capacity: Number(roomForm.capacity),
      }),
    });
    roomForm = { name: '', room_type: 'room', capacity: 4 };
    await loadResources();
    setNotice('Room or table created.');
  }

  async function saveBusinessHours() {
    await api('/api/resources/business-hours', {
      method: 'PUT',
      body: JSON.stringify({
        items: [
          {
            ...hoursForm,
            weekday: Number(hoursForm.weekday),
            is_closed: !!hoursForm.is_closed,
          },
        ],
      }),
    });
    await loadResources();
    setNotice('Business hours updated.');
  }

  async function submitHostSchedule() {
    resourceValidation = '';
    if (!hostForm.host_user_id) {
      resourceValidation = 'Host user id is required for schedule creation.';
      return;
    }
    await api('/api/resources/host-schedules', {
      method: 'POST',
      body: JSON.stringify({
        ...hostForm,
        weekday: Number(hostForm.weekday),
      }),
    });
    await loadResources();
    setNotice('Host schedule created.');
  }

  async function submitBooking() {
    bookingValidation = '';
    if (!bookingForm.script_id || !bookingForm.room_id) {
      bookingValidation = 'Select both a script and a room or table.';
      return;
    }
    if (new Date(bookingForm.end_at) <= new Date(bookingForm.start_at)) {
      bookingValidation = 'End time must be later than start time.';
      return;
    }
    await api('/api/bookings', {
      method: 'POST',
      body: JSON.stringify({
        ...bookingForm,
        party_size: Number(bookingForm.party_size),
      }),
    });
    await loadBookings();
    setNotice('Booking created.');
  }

  async function submitCustomer() {
    customerValidation = '';
    if (!customerForm.full_name.trim()) {
      customerValidation = 'Customer name is required.';
      return;
    }
    const payload = {
      full_name: customerForm.full_name,
      email: customerForm.email || null,
      phone: customerForm.phone || null,
      marketing_email_consent: !!customerForm.marketing_email_consent,
      marketing_sms_consent: !!customerForm.marketing_sms_consent,
    };
    if (!customerForm.id || customerForm.address) {
      payload.address = customerForm.address || '';
    }
    if (!customerForm.id || customerForm.notes) {
      payload.notes = customerForm.notes || '';
    }
    if (customerForm.id) {
      await api(`/api/master/customers/${customerForm.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setNotice('Customer updated.');
    } else {
      await api('/api/master/customers', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setNotice('Customer created.');
    }
    customerForm = {
      id: '',
      full_name: '',
      email: '',
      phone: '',
      address: '',
      notes: '',
      marketing_email_consent: false,
      marketing_sms_consent: false,
    };
    await loadCustomers();
  }

  function editCustomer(customer) {
    customerForm = {
      id: customer.id,
      full_name: customer.full_name || '',
      email: customer.email || '',
      phone: customer.phone || '',
      address: '',
      notes: '',
      marketing_email_consent: !!customer.marketing_email_consent,
      marketing_sms_consent: !!customer.marketing_sms_consent,
    };
  }

  async function updateBookingStatus(booking, status) {
    await api(`/api/bookings/${booking.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    await loadBookings();
    setNotice(`Booking moved to ${status}.`, {
      label: `Undo booking ${booking.customer_name}`,
      run: async () => {
        await api(`/api/bookings/${booking.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: booking.status }),
        });
        await loadBookings();
        setNotice('Undo complete.');
      },
    });
  }

  async function submitForumSection() {
    await api('/api/forum/sections', {
      method: 'POST',
      body: JSON.stringify({
        ...forumSectionForm,
        parent_section_id: forumSectionForm.parent_section_id || null,
      }),
    });
    forumSectionForm = { name: '', description: '', parent_section_id: '' };
    await loadForum();
    setNotice('Forum section created.');
  }

  async function submitForumThread() {
    if (!selectedSectionId) {
      error = 'Select a section before creating a thread.';
      return;
    }
    await api('/api/forum/threads', {
      method: 'POST',
      body: JSON.stringify({
        section_id: selectedSectionId,
        title: forumThreadForm.title,
        body: forumThreadForm.body,
        topic_tags: forumThreadForm.topic_tags.split(',').map((item) => item.trim()).filter(Boolean),
      }),
    });
    forumThreadForm = { title: '', body: '', topic_tags: '' };
    await loadForum();
    setNotice('Thread created.');
  }

  async function submitForumReply() {
    if (!selectedThreadId) {
      error = 'Select a thread before posting a reply.';
      return;
    }
    await api('/api/forum/posts', {
      method: 'POST',
      body: JSON.stringify({
        thread_id: selectedThreadId,
        body: forumReplyForm.body,
        parent_post_id: forumReplyForm.parent_post_id || null,
      }),
    });
    forumReplyForm = { body: '', parent_post_id: '' };
    await loadForum();
    setNotice('Reply posted.');
  }

  async function moderate(entity, id, field, nextValue) {
    await api(`/api/forum/${entity}/${id}/moderation`, {
      method: 'PATCH',
      body: JSON.stringify({ [field]: nextValue }),
    });
    await loadForum();
    setNotice(`Forum state updated for ${field}.`, null);
  }

  async function requestDeletion(entity, id) {
    await api(`/api/forum/${entity}/${id}/delete-request`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    await loadForum();
    setNotice('Deletion request created with 7-day restore window.');
  }

  async function runRetention() {
    const result = await api('/api/forum/retention/run', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    await loadPendingDeletions();
    setNotice(`Retention run complete. Purged ${result.purged_deleted_content} records.`);
  }

  async function loadPendingDeletions() {
    try {
      const result = await api('/api/forum/deletion-requests');
      pendingDeletions = result.items || [];
    } catch { pendingDeletions = []; }
  }

  async function restoreDeletion(delReq) {
    undoAction = null;
    const deadlineStr = new Date(delReq.restore_deadline).toLocaleDateString();
    setNotice(`⚠ Restore ${delReq.entity_type} (${delReq.entity_id.slice(0,8)}…)? Window expires ${deadlineStr}.`, {
      label: 'Confirm Restore',
      run: async () => {
        await api(`/api/forum/deletion/${delReq.id}/restore`, {
          method: 'POST',
          body: JSON.stringify({}),
        });
        await loadForum();
        await loadPendingDeletions();
        setNotice('Restored successfully. Recorded in immutable log.');
      },
    });
  }

  async function submitScoring() {
    scoringValidation = '';
    if (!scoringForm.subject_id || !scoringForm.round_key || !scoringForm.store_code) {
      scoringValidation = 'Subject id, round key, and store code are required.';
      return;
    }

    let mappingRules = {};
    try {
      mappingRules = scoringForm.mapping_rules ? JSON.parse(scoringForm.mapping_rules) : {};
    } catch (err) {
      scoringValidation = 'Mapping rules must be valid JSON.';
      return;
    }

    const previousScores = scoringForm.previous_round_scores
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => Number(item));

    await api('/api/scoring/calculate', {
      method: 'POST',
      body: JSON.stringify({
        subject_id: scoringForm.subject_id,
        round_key: scoringForm.round_key,
        store_code: scoringForm.store_code,
        previous_score: scoringForm.previous_score ? Number(scoringForm.previous_score) : null,
        previous_round_scores: previousScores,
        strategy: scoringForm.strategy,
        metrics: {
          a: scoringForm.metric_a === '' ? null : Number(scoringForm.metric_a),
          b: scoringForm.metric_b === '' ? null : Number(scoringForm.metric_b),
        },
        weights: {
          a: Number(scoringForm.weight_a),
          b: Number(scoringForm.weight_b),
        },
        mapping_rules: mappingRules,
      }),
    });
    await loadScoringLedger();
    if (scoringForm.from && scoringForm.to) {
      await loadScoringRankings();
    }
    setNotice('Scoring run recorded in the adjustment ledger.');
  }

  async function loadSectionThreads(id) {
    selectedSectionId = id;
    selectedThreadId = '';
    await loadForum();
  }

  async function loadThreadPosts(id) {
    selectedThreadId = id;
    await loadForum();
  }

  async function loadThreadsByTag(tag) {
    forumTagFilter = tag;
    const result = await api(`/api/forum/threads/by-tag/${encodeURIComponent(tag)}`);
    filteredThreadsByTag = result.items || [];
  }

  async function logout() {
    await api('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    token = '';
    user = null;
    roleLabel = '';
    activeTab = 'scripts';
    setNotice('Signed out.');
  }

  onMount(() => {
    document.body.classList.add('bg-slate-950');
  });
</script>

{#if !token}
  <div class="min-h-screen bg-[radial-gradient(circle_at_top,#1e293b_0%,#020617_45%,#000_100%)] px-4 py-16 text-slate-100">
    <div class="mx-auto max-w-md rounded-[28px] border border-slate-800 bg-slate-950/90 p-8 shadow-[0_30px_120px_rgba(0,0,0,0.55)]">
      <p class="text-xs uppercase tracking-[0.35em] text-slate-500">VaultRoom</p>
      <h1 class="mt-3 text-3xl font-semibold tracking-tight">Operations Access</h1>
      <p class="mt-2 text-sm text-slate-400">Svelte console with real backend integrations and role-aware navigation.</p>

      <form
        class="mt-8 space-y-3"
        on:submit|preventDefault={async () => {
          try {
            await login();
          } catch (err) {
            error = err.message;
          }
        }}
      >
        <input class={fieldClasses()} bind:value={loginForm.username} placeholder="username" />
        <input class={fieldClasses()} bind:value={loginForm.password} placeholder="password" type="password" />
        <button class={buttonClasses()} type="submit">Sign In</button>
      </form>

      {#if error}
        <p class="mt-4 text-sm text-red-300">{error}</p>
      {/if}
    </div>
  </div>
{:else}
  <div class="min-h-screen bg-[linear-gradient(180deg,#020617_0%,#000_100%)] text-slate-100">
    <header class="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
      <div class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4">
        <div>
          <p class="text-xs uppercase tracking-[0.35em] text-slate-500">VaultRoom</p>
          <h1 class="text-xl font-semibold tracking-tight">Operations Console</h1>
          <p class="text-xs text-slate-400">{user.username} · {roleLabel}</p>
        </div>

        <nav class="flex flex-wrap gap-2">
          {#each Object.keys(TAB_LABELS) as tab}
            {#if tabVisible(tab)}
              <button class={activeTab === tab ? buttonClasses() : 'rounded-md bg-slate-900 px-3 py-2 text-sm text-slate-300'} on:click={() => (activeTab = tab)}>
                {TAB_LABELS[tab]}
              </button>
            {/if}
          {/each}
        </nav>

        <div class="flex items-center gap-2">
          <span class="rounded-full border border-slate-800 px-3 py-1 text-xs text-slate-400">Roles: Administrator, Store Manager, Inventory Clerk, Moderator, Customer/Member</span>
          <button class={buttonClasses()} on:click={logout}>Sign Out</button>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-7xl px-4 py-6">
      {#if error}
        <div class="mb-4 rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-200">{error}</div>
      {/if}

      {#if notice}
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
          <span>{notice}</span>
          {#if undoAction}
            <button
              class={buttonClasses()}
              on:click={async () => {
                try {
                  await undoAction.run();
                  undoAction = null;
                } catch (err) {
                  error = err.message;
                }
              }}
            >
              {undoAction.label}
            </button>
          {/if}
        </div>
      {/if}

      {#if activeTab === 'scripts' && tabVisible('scripts')}
        <div class="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <section class={cardClasses()}>
            <div class="flex items-center justify-between">
              <h2 class="text-xl font-semibold">Script Manager</h2>
              <span class="text-xs text-slate-500">Administrator and Store Manager view</span>
            </div>
            <form
              class="mt-4 grid gap-3 md:grid-cols-2"
              on:submit|preventDefault={async () => {
                try {
                  await submitScript();
                } catch (err) {
                  error = err.message;
                }
              }}
            >
              <input class={fieldClasses()} bind:value={scriptForm.title} placeholder="Title" />
              <select class={fieldClasses()} bind:value={scriptForm.status}>
                <option value="active">active</option>
                <option value="paused">paused</option>
              </select>
              <input class={fieldClasses()} bind:value={scriptForm.difficulty} min="1" max="5" type="number" placeholder="Difficulty 1-5" />
              <input class={fieldClasses()} bind:value={scriptForm.duration_minutes} min="1" type="number" placeholder="Duration minutes" />
              <input class={fieldClasses()} bind:value={scriptForm.min_party_size} min="1" type="number" placeholder="Minimum party size" />
              <input class={fieldClasses()} bind:value={scriptForm.max_party_size} min="1" type="number" placeholder="Maximum party size" />
              <input class={fieldClasses()} bind:value={scriptForm.required_props} placeholder="Required props, comma-separated" />
              <input class={fieldClasses()} bind:value={scriptForm.tags} placeholder="Tags, comma-separated" />
              <textarea class={`${fieldClasses()} md:col-span-2 min-h-[120px]`} bind:value={scriptForm.description} placeholder="Description"></textarea>
              <div class="md:col-span-2 flex items-center gap-3">
                <button class={buttonClasses(!canAdminister())} disabled={!canAdminister()} type="submit">Create Script</button>
                {#if scriptValidation}
                  <span class="text-sm text-amber-300">{scriptValidation}</span>
                {/if}
              </div>
            </form>
          </section>

          <section class={cardClasses()}>
            <h3 class="text-lg font-semibold">Scripts</h3>
            <div class="mt-4 space-y-3">
              {#each scripts as script}
                <div class="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <p class="font-medium">{script.title}</p>
                      <p class="text-sm text-slate-400">{script.description}</p>
                    </div>
                    <span class="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">{script.status}</span>
                  </div>
                  <p class="mt-3 text-xs text-slate-500">
                    Difficulty {script.difficulty} · {script.duration_minutes} mins · Party {script.min_party_size}-{script.max_party_size}
                  </p>
                  <p class="mt-1 text-xs text-slate-500">Props: {(script.required_props || []).join(', ') || 'none'} · Tags: {(script.tags || []).join(', ') || 'none'}</p>
                  <button class={`${buttonClasses(!canAdminister())} mt-3`} disabled={!canAdminister()} on:click={() => toggleScriptStatus(script)}>Toggle Active/Paused</button>
                </div>
              {/each}
            </div>
          </section>
        </div>
      {/if}

      {#if activeTab === 'resources' && tabVisible('resources')}
        <div class="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
          <section class={cardClasses()}>
            <h2 class="text-xl font-semibold">Resource Scheduler</h2>
            <div class="mt-4 grid gap-4 xl:grid-cols-3">
              <form
                class="space-y-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4"
                on:submit|preventDefault={async () => {
                  try {
                    await submitRoom();
                  } catch (err) {
                    error = err.message;
                  }
                }}
              >
                <p class="font-medium">Rooms and Tables</p>
                <input class={fieldClasses()} bind:value={roomForm.name} placeholder="Resource name" />
                <select class={fieldClasses()} bind:value={roomForm.room_type}>
                  <option value="room">room</option>
                  <option value="table">table</option>
                </select>
                <input class={fieldClasses()} bind:value={roomForm.capacity} type="number" min="1" placeholder="Capacity" />
                <button class={buttonClasses(!canAdminister())} disabled={!canAdminister()}>Create Resource</button>
              </form>

              <form
                class="space-y-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4"
                on:submit|preventDefault={async () => {
                  try {
                    await saveBusinessHours();
                  } catch (err) {
                    error = err.message;
                  }
                }}
              >
                <p class="font-medium">Business Hours</p>
                <input class={fieldClasses()} bind:value={hoursForm.weekday} min="0" max="6" type="number" placeholder="Weekday 0-6" />
                <input class={fieldClasses()} bind:value={hoursForm.open_time} type="time" />
                <input class={fieldClasses()} bind:value={hoursForm.close_time} type="time" />
                <label class="flex items-center gap-2 text-sm text-slate-300">
                  <input bind:checked={hoursForm.is_closed} type="checkbox" />
                  Closed
                </label>
                <button class={buttonClasses(!canAdminister())} disabled={!canAdminister()}>Save Hours</button>
              </form>

              <form
                class="space-y-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4"
                on:submit|preventDefault={async () => {
                  try {
                    await submitHostSchedule();
                  } catch (err) {
                    error = err.message;
                  }
                }}
              >
                <p class="font-medium">Host Schedules</p>
                <input class={fieldClasses()} bind:value={hostForm.host_user_id} placeholder="Host user id" />
                <select class={fieldClasses()} bind:value={hostForm.room_id}>
                  <option value="">Select room or table</option>
                  {#each rooms as room}
                    <option value={room.id}>{room.name}</option>
                  {/each}
                </select>
                <input class={fieldClasses()} bind:value={hostForm.weekday} min="0" max="6" type="number" placeholder="Weekday 0-6" />
                <input class={fieldClasses()} bind:value={hostForm.start_time} type="time" />
                <input class={fieldClasses()} bind:value={hostForm.end_time} type="time" />
                <button class={buttonClasses(!canAdminister())} disabled={!canAdminister()}>Create Schedule</button>
              </form>
            </div>
            {#if resourceValidation}
              <p class="mt-3 text-sm text-amber-300">{resourceValidation}</p>
            {/if}
          </section>

          <section class={cardClasses()}>
            <h3 class="text-lg font-semibold">Availability View</h3>
            <div class="mt-4 grid gap-4">
              <div>
                <p class="text-sm font-medium text-slate-300">Rooms and Tables</p>
                <div class="mt-2 space-y-2">
                  {#each rooms as room}
                    <div class="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-sm">
                      {room.name} · {room.room_type} · capacity {room.capacity}
                    </div>
                  {/each}
                </div>
              </div>
              <div>
                <p class="text-sm font-medium text-slate-300">Business Hours</p>
                <div class="mt-2 space-y-2">
                  {#each businessHours as hour}
                    <div class="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-sm">
                      Day {hour.weekday} · {hour.is_closed ? 'Closed' : `${hour.open_time} to ${hour.close_time}`}
                    </div>
                  {/each}
                </div>
              </div>
              <div>
                <p class="text-sm font-medium text-slate-300">Host Availability</p>
                <div class="mt-2 space-y-2">
                  {#each hostSchedules as schedule}
                    <div class="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-sm">
                      {schedule.host_username} · {schedule.room_name} · day {schedule.weekday} · {schedule.start_time} to {schedule.end_time}
                    </div>
                  {/each}
                </div>
              </div>
            </div>
          </section>
        </div>
      {/if}

      {#if activeTab === 'bookings' && tabVisible('bookings')}
        <div class="grid gap-4 lg:grid-cols-[1fr_1fr_1.05fr]">
          {#if roleLabel === 'Administrator' || roleLabel === 'Store Manager' || roleLabel === 'Inventory Clerk'}
            <section class={cardClasses()}>
              <h2 class="text-xl font-semibold">Customer Profiles</h2>
              <p class="mt-2 text-sm text-slate-400">Consent defaults to false unless explicitly checked.</p>
              <form
                class="mt-4 grid gap-3"
                on:submit|preventDefault={async () => {
                  try {
                    await submitCustomer();
                  } catch (err) {
                    error = err.message;
                  }
                }}
              >
                <input class={fieldClasses()} bind:value={customerForm.full_name} placeholder="Full name" />
                <input class={fieldClasses()} bind:value={customerForm.email} placeholder="Email" />
                <input class={fieldClasses()} bind:value={customerForm.phone} placeholder="Phone" />
                <input class={fieldClasses()} bind:value={customerForm.address} placeholder="Address" />
                <textarea class={`${fieldClasses()} min-h-[100px]`} bind:value={customerForm.notes} placeholder="Notes"></textarea>
                <label class="flex items-center gap-2 text-sm text-slate-300">
                  <input bind:checked={customerForm.marketing_email_consent} type="checkbox" />
                  Marketing email consent
                </label>
                <label class="flex items-center gap-2 text-sm text-slate-300">
                  <input bind:checked={customerForm.marketing_sms_consent} type="checkbox" />
                  Marketing SMS consent
                </label>
                <button class={buttonClasses()} type="submit">{customerForm.id ? 'Update Customer' : 'Create Customer'}</button>
              </form>
              {#if customerValidation}
                <p class="mt-3 text-sm text-amber-300">{customerValidation}</p>
              {/if}
              <div class="mt-4 space-y-2">
                {#each customers as customer}
                  <button class="w-full rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-left" on:click={() => editCustomer(customer)}>
                    <p class="font-medium">{customer.full_name}</p>
                    <p class="mt-1 text-xs text-slate-500">
                      {customer.email || 'no email'} · {customer.phone_masked || customer.phone || 'no phone'}
                    </p>
                    <p class="mt-1 text-[11px] uppercase tracking-[0.2em] text-slate-500">
                      Email consent {customer.marketing_email_consent ? 'yes' : 'no'} · SMS consent {customer.marketing_sms_consent ? 'yes' : 'no'}
                    </p>
                  </button>
                {/each}
              </div>
            </section>
          {/if}

          <section class={cardClasses()}>
            <h2 class="text-xl font-semibold">Bookings</h2>
            <form
              class="mt-4 grid gap-3"
              on:submit|preventDefault={async () => {
                try {
                  await submitBooking();
                } catch (err) {
                  error = err.message;
                }
              }}
            >
              <select class={fieldClasses()} bind:value={bookingForm.script_id}>
                <option value="">Select script</option>
                {#each scripts as script}
                  <option value={script.id}>{script.title}</option>
                {/each}
              </select>
              <select class={fieldClasses()} bind:value={bookingForm.room_id}>
                <option value="">Select room or table</option>
                {#each rooms as room}
                  <option value={room.id}>{room.name}</option>
                {/each}
              </select>
              <input class={fieldClasses()} bind:value={bookingForm.customer_name} placeholder="Customer name" />
              <input class={fieldClasses()} bind:value={bookingForm.customer_email} placeholder="Customer email" />
              <input class={fieldClasses()} bind:value={bookingForm.party_size} type="number" min="1" placeholder="Party size" />
              <input class={fieldClasses()} bind:value={bookingForm.start_at} type="datetime-local" />
              <input class={fieldClasses()} bind:value={bookingForm.end_at} type="datetime-local" />
              <textarea class={`${fieldClasses()} min-h-[120px]`} bind:value={bookingForm.notes} placeholder="Notes"></textarea>
              <button class={buttonClasses()} type="submit">Create Booking</button>
            </form>
            {#if bookingValidation}
              <p class="mt-3 text-sm text-amber-300">{bookingValidation}</p>
            {/if}
          </section>

          <section class={cardClasses()}>
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-semibold">Booking Queue</h3>
              <span class="text-xs text-slate-500">Validation feedback is enforced before submission</span>
            </div>
            <div class="mt-4 space-y-3">
              {#each bookings as booking}
                <div class="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <p class="font-medium">{booking.customer_name}</p>
                      <p class="text-sm text-slate-400">{booking.script_title} · {booking.room_name}</p>
                    </div>
                    <span class="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">{booking.status}</span>
                  </div>
                  <p class="mt-3 text-xs text-slate-500">
                    {new Date(booking.start_at).toLocaleString()} to {new Date(booking.end_at).toLocaleString()}
                  </p>
                  {#if canManageBookings()}
                    <div class="mt-3 flex flex-wrap gap-2">
                      {#each ['pending', 'confirmed', 'cancelled', 'completed'] as status}
                        <button class={buttonClasses()} on:click={() => updateBookingStatus(booking, status)}>{status}</button>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          </section>
        </div>
      {/if}

      {#if activeTab === 'forum' && tabVisible('forum')}
        <div class="grid gap-4 lg:grid-cols-[0.95fr_1fr_1.05fr]">
          <section class={cardClasses()}>
            <div class="flex items-center justify-between">
              <h2 class="text-xl font-semibold">Sections</h2>
              {#if canModerate()}
                <span class="text-xs text-slate-500">Moderator actions live</span>
              {/if}
            </div>
            {#if canModerate()}
              <form
                class="mt-4 space-y-3"
                on:submit|preventDefault={async () => {
                  try {
                    await submitForumSection();
                  } catch (err) {
                    error = err.message;
                  }
                }}
              >
                <input class={fieldClasses()} bind:value={forumSectionForm.name} placeholder="Section name" />
                <input class={fieldClasses()} bind:value={forumSectionForm.description} placeholder="Description" />
                <select class={fieldClasses()} bind:value={forumSectionForm.parent_section_id}>
                  <option value="">Top-level section</option>
                  {#each forumSections as section}
                    <option value={section.id}>{section.name}</option>
                  {/each}
                </select>
                <button class={buttonClasses()} type="submit">Create Section</button>
              </form>
            {/if}
            <div class="mt-4">
              <ForumSectionTree
                sections={forumHierarchy}
                {selectedSectionId}
                canModerate={canModerate()}
                {buttonClasses}
                onSelect={loadSectionThreads}
                onModerate={moderate}
              />
            </div>
          </section>

          <section class={cardClasses()}>
            <h3 class="text-lg font-semibold">Threads</h3>
            <form
              class="mt-4 space-y-3"
              on:submit|preventDefault={async () => {
                try {
                  await submitForumThread();
                } catch (err) {
                  error = err.message;
                }
              }}
            >
              <input class={fieldClasses()} bind:value={forumThreadForm.title} placeholder="Thread title" />
              <input class={fieldClasses()} bind:value={forumThreadForm.topic_tags} placeholder="Topic tags, comma-separated" />
              <textarea class={`${fieldClasses()} min-h-[120px]`} bind:value={forumThreadForm.body} placeholder="Thread body"></textarea>
              <button class={buttonClasses()} type="submit">Create Thread</button>
            </form>
            <div class="mt-4 flex flex-wrap gap-2">
              <button class={forumTagFilter === '' ? buttonClasses() : 'rounded-md bg-slate-900 px-3 py-2 text-sm text-slate-300'} on:click={() => { forumTagFilter = ''; filteredThreadsByTag = []; }}>
                All
              </button>
              {#each forumTags as tag}
                <button class={forumTagFilter === tag.name ? buttonClasses() : 'rounded-md bg-slate-900 px-3 py-2 text-sm text-slate-300'} on:click={() => loadThreadsByTag(tag.name)}>
                  #{tag.name}
                </button>
              {/each}
            </div>
            <div class="mt-4 space-y-2">
              {#each (forumTagFilter ? filteredThreadsByTag : forumThreads) as thread}
                <div class={`rounded-xl border p-3 ${selectedThreadId === thread.id ? 'border-white bg-slate-900' : 'border-slate-800 bg-slate-900/60'}`}>
                  <button class="w-full text-left" on:click={() => loadThreadPosts(thread.id)}>
                    <p class="font-medium">{thread.title}</p>
                    <p class="mt-1 text-xs text-slate-500">{thread.body}</p>
                  </button>
                  <p class="mt-2 text-xs text-slate-400">Tags: {(thread.topic_tags || []).join(', ') || 'none'}</p>
                  <div class="mt-2 text-[11px] uppercase tracking-[0.2em] text-slate-500">
                    {thread.pinned ? 'Pinned ' : ''}{thread.featured ? 'Featured ' : ''}{thread.locked ? 'Locked ' : ''}{thread.archived ? 'Archived' : ''}
                  </div>
                  {#if canModerate()}
                    <div class="mt-3 flex flex-wrap gap-2">
                      <button class={buttonClasses()} on:click={() => moderate('threads', thread.id, 'featured', !thread.featured)}>feature</button>
                      <button class={buttonClasses()} on:click={() => moderate('threads', thread.id, 'archived', !thread.archived)}>archive</button>
                      <button class={buttonClasses()} on:click={() => requestDeletion('thread', thread.id)}>delete request</button>
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          </section>

          <section class={cardClasses()}>
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-semibold">Nested Replies</h3>
              {#if canAdminister()}
                <button class={buttonClasses()} on:click={runRetention}>Run Retention</button>
                <button class={buttonClasses()} on:click={loadPendingDeletions}>Load Restore Queue</button>
              {/if}
            </div>

            {#if canAdminister() && pendingDeletions.length > 0}
              <div class="mt-4 rounded-xl border border-amber-500/20 bg-amber-950/20 p-4">
                <h4 class="text-sm font-semibold text-amber-300 mb-2">Pending Deletions — 7-Day Restore Window ({pendingDeletions.length})</h4>
                <p class="text-xs text-slate-500 mb-2">These items are scheduled for permanent deletion. Click Restore to reverse the deletion within the 7-day window.</p>
                <div class="space-y-2 max-h-48 overflow-y-auto">
                  {#each pendingDeletions as dr}
                    <div class="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs">
                      <div>
                        <span class="text-slate-300 font-medium">{dr.entity_type}</span>
                        <span class="text-slate-500 font-mono ml-1">{dr.entity_id.slice(0,8)}…</span>
                        <span class="text-slate-500 ml-2">expires: {new Date(dr.restore_deadline).toLocaleDateString()}</span>
                      </div>
                      <button class="rounded bg-emerald-600 px-3 py-1 text-xs text-white hover:bg-emerald-500 transition" on:click={() => restoreDeletion(dr)}>Restore</button>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
            <form
              class="mt-4 space-y-3"
              on:submit|preventDefault={async () => {
                try {
                  await submitForumReply();
                } catch (err) {
                  error = err.message;
                }
              }}
            >
              <select class={fieldClasses()} bind:value={forumReplyForm.parent_post_id}>
                <option value="">Top-level reply</option>
                {#each forumPosts as post}
                  <option value={post.id}>{post.id.slice(0, 8)}…</option>
                {/each}
              </select>
              <textarea class={`${fieldClasses()} min-h-[120px]`} bind:value={forumReplyForm.body} placeholder="Reply body"></textarea>
              <button class={buttonClasses()} type="submit">Post Reply</button>
            </form>
            <div class="mt-4 space-y-2">
              {#each forumPosts as post}
                <div class="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                  <p class="text-sm">{post.parent_post_id ? 'Reply · ' : ''}{post.body}</p>
                  <p class="mt-1 text-xs text-slate-500">
                    {post.pinned ? 'Pinned ' : ''}{post.featured ? 'Featured ' : ''}{post.locked ? 'Locked ' : ''}{post.archived ? 'Archived' : ''}
                  </p>
                  {#if canModerate()}
                    <div class="mt-3 flex flex-wrap gap-2">
                      <button class={buttonClasses()} on:click={() => moderate('posts', post.id, 'locked', !post.locked)}>lock</button>
                      <button class={buttonClasses()} on:click={() => moderate('posts', post.id, 'archived', !post.archived)}>archive</button>
                      <button class={buttonClasses()} on:click={() => requestDeletion('post', post.id)}>delete request</button>
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          </section>
        </div>
      {/if}

      {#if activeTab === 'scoring' && tabVisible('scoring')}
        <div class="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <section class={cardClasses()}>
            <h2 class="text-xl font-semibold">Scoring</h2>
            <p class="mt-2 text-sm text-slate-400">Weighted aggregation, missing-value strategy, mapping rules, multi-round merge, auditable history, and optional grades/rankings by store and date range.</p>
            <form
              class="mt-4 grid gap-3 md:grid-cols-2"
              on:submit|preventDefault={async () => {
                try {
                  await submitScoring();
                } catch (err) {
                  error = err.message;
                }
              }}
            >
              <input class={fieldClasses()} bind:value={scoringForm.subject_id} placeholder="Subject id" />
              <input class={fieldClasses()} bind:value={scoringForm.round_key} placeholder="Round key" />
              <input class={fieldClasses()} bind:value={scoringForm.store_code} placeholder="Store code" />
              <input class={fieldClasses()} bind:value={scoringForm.from} type="datetime-local" />
              <input class={fieldClasses()} bind:value={scoringForm.to} type="datetime-local" />
              <input class={fieldClasses()} bind:value={scoringForm.metric_a} placeholder="Metric A" />
              <input class={fieldClasses()} bind:value={scoringForm.metric_b} placeholder="Metric B" />
              <input class={fieldClasses()} bind:value={scoringForm.weight_a} placeholder="Weight A" />
              <input class={fieldClasses()} bind:value={scoringForm.weight_b} placeholder="Weight B" />
              <select class={fieldClasses()} bind:value={scoringForm.strategy}>
                <option value="drop">drop</option>
                <option value="zero-fill">zero-fill</option>
                <option value="average-fill">average-fill</option>
              </select>
              <input class={fieldClasses()} bind:value={scoringForm.previous_score} placeholder="Previous score (optional)" />
              <input class={`${fieldClasses()} md:col-span-2`} bind:value={scoringForm.previous_round_scores} placeholder="Previous round scores, comma-separated" />
              <textarea class={`${fieldClasses()} md:col-span-2 min-h-[150px]`} bind:value={scoringForm.mapping_rules} placeholder={`Mapping rules JSON, e.g. {"a":{"80":95}}`}></textarea>
              <div class="md:col-span-2 flex items-center gap-3">
                <button class={buttonClasses()} type="submit">Run Scoring</button>
                <button class={buttonClasses()} type="button" on:click={loadScoringLedger}>Refresh History</button>
                <button class={buttonClasses()} type="button" on:click={loadScoringRankings}>Load Grades/Rankings</button>
              </div>
            </form>
            {#if scoringValidation}
              <p class="mt-3 text-sm text-amber-300">{scoringValidation}</p>
            {/if}
          </section>

          <section class={cardClasses()}>
            <h3 class="text-lg font-semibold">Auditable Adjustment History</h3>
            <div class="mt-4 space-y-3">
              {#each scoringLedger as entry}
                <div class="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <p class="font-medium">{entry.subject_id} · {entry.round_key}</p>
                      <p class="text-sm text-slate-400">Strategy: {entry.strategy} · Store {entry.store_code || 'n/a'}</p>
                    </div>
                    <span class="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">after {entry.score_after}</span>
                  </div>
                  <p class="mt-2 text-xs text-slate-500">before {entry.score_before ?? 'n/a'} · created {new Date(entry.created_at).toLocaleString()}</p>
                  <pre class="mt-3 overflow-auto rounded-xl bg-black/60 p-3 text-xs text-slate-300">{JSON.stringify(entry.details, null, 2)}</pre>
                </div>
              {/each}
            </div>
            {#if scoringForm.store_code && scoringForm.from && scoringForm.to}
              <div class="mt-6">
                <h4 class="text-lg font-semibold">Grades and Rankings</h4>
                <p class="mt-1 text-xs text-slate-500">Thresholds: A 90+, B 80+, C 70+, D 60+, F below 60.</p>
                <div class="mt-3 space-y-2">
                  {#each scoringRankings as ranking}
                    <div class="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                      <p class="font-medium">#{ranking.rank} · {ranking.subject_id}</p>
                      <p class="mt-1 text-xs text-slate-400">Score {ranking.aggregated_score} · Grade {ranking.grade} · Store {ranking.store_code}</p>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          </section>
        </div>
      {/if}

      {#if activeTab === 'commerce' && tabVisible('commerce')}
        <CommerceTab {token} />
      {/if}

      {#if activeTab === 'master' && tabVisible('master')}
        <MasterDataTab {token} />
      {/if}
    </main>
  </div>
{/if}
