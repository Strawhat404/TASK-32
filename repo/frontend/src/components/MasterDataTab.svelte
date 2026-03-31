<script>
  import { onMount } from 'svelte';
  export let token;

  let skus = [], rules = [], bins = [], carriers = [], customers = [], inventoryNotice = '';
  let error = '', notice = '';
  let activeSection = 'rules';
  let selectedSkuId = '';
  let dedupeResults = [];
  let importForm = { file_path: '' };
  let confirmAction = null;
  let undoAction = null;
  let barcodes = [], lots = [], packaging = [];

  let ruleForm = { name: '', template: 'SKU-####', entity_type: 'sku', effective_start_at: '', effective_end_at: '', priority: 100 };
  let skuForm = { name: '', description: '', expiry_date: '' };
  let barcodeForm = { barcode: '', symbology: 'EAN-13', is_primary: false };
  let lotForm = { lot_number: '', manufactured_at: '', expires_at: '', batch_attributes: '{}' };
  let packForm = { package_type: 'box', units_per_package: 1, weight_grams: '', dimensions_cm: '{}' };
  let binForm = { warehouse_code: '', aisle: '', shelf: '', bin_code: '' };
  let carrierForm = { code: '', name: '', service_levels: '' };
  let customerForm = { full_name: '', email: '', phone: '', marketing_email_consent: false, marketing_sms_consent: false };
  let inventoryForm = { store_code: 'MAIN', sku_id: '', stock_qty: 0, unit_price_cents: 0 };
  let shippingForm = { store_code: 'MAIN', method: 'pickup', min_subtotal_cents: 0, rate_cents: 0 };
  let promoForm = { promo_type: 'coupon', code: '', discount_percent: 10, threshold_cents: '' };

  function fieldClasses() { return 'w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500'; }
  function btnClasses() { return 'rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500'; }
  function btnSuccess() { return 'rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500'; }
  function btnSmall() { return 'rounded bg-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-600 transition'; }

  async function api(path, req = {}) {
    const res = await fetch(path, { ...req, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(req.headers || {}) } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  function formatExpiryDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  }

  function expiryToApiFormat(dateStr) {
    return dateStr;
  }

  async function load() {
    try {
      const [sk, rl, bn, cr, cu] = await Promise.all([
        api('/api/master/skus').catch(() => ({ items: [] })),
        api('/api/master/sku-rules').catch(() => ({ items: [] })),
        api('/api/master/bins').catch(() => ({ items: [] })),
        api('/api/master/carriers').catch(() => ({ items: [] })),
        api('/api/master/customers').catch(() => ({ items: [] })),
      ]);
      skus = sk.items || []; rules = rl.items || []; bins = bn.items || []; carriers = cr.items || []; customers = cu.items || [];
    } catch {}
  }

  async function loadSkuDetails(id) {
    selectedSkuId = id;
    try {
      const [bc, lt, pk] = await Promise.all([
        api(`/api/master/skus/${id}/barcodes`).catch(() => ({ items: [] })),
        api(`/api/master/skus/${id}/lots`).catch(() => ({ items: [] })),
        api(`/api/master/skus/${id}/packaging`).catch(() => ({ items: [] })),
      ]);
      barcodes = bc.items || []; lots = lt.items || []; packaging = pk.items || [];
    } catch {}
  }

  async function createRule() {
    try {
      error = ''; notice = '';
      const payload = { ...ruleForm, priority: Number(ruleForm.priority) };
      if (!payload.effective_start_at) payload.effective_start_at = new Date().toISOString();
      if (payload.effective_end_at) {
        const d = new Date(payload.effective_end_at);
        d.setHours(23, 59, 0, 0);
        payload.effective_end_at = d.toISOString();
      } else { delete payload.effective_end_at; }
      await api('/api/master/sku-rules', { method: 'POST', body: JSON.stringify(payload) });
      notice = 'Coding rule created.';
      ruleForm = { name: '', template: 'SKU-####', entity_type: 'sku', effective_start_at: '', effective_end_at: '', priority: 100 };
      await load();
    } catch (e) { error = e.message; }
  }

  async function createSku() {
    try {
      error = ''; notice = '';
      if (!skuForm.expiry_date) { error = 'Expiry date (MM/DD/YYYY) is required.'; return; }
      await api('/api/master/skus', { method: 'POST', body: JSON.stringify({ ...skuForm, expiry_date: expiryToApiFormat(skuForm.expiry_date) }) });
      notice = 'SKU created.';
      skuForm = { name: '', description: '', expiry_date: '' };
      await load();
    } catch (e) { error = e.message; }
  }

  async function createBarcode() {
    try {
      error = '';
      await api(`/api/master/skus/${selectedSkuId}/barcodes`, { method: 'POST', body: JSON.stringify(barcodeForm) });
      notice = 'Barcode added.';
      barcodeForm = { barcode: '', symbology: 'EAN-13', is_primary: false };
      await loadSkuDetails(selectedSkuId);
    } catch (e) { error = e.message; }
  }

  async function createLot() {
    try {
      error = '';
      let attrs = {};
      try { attrs = JSON.parse(lotForm.batch_attributes || '{}'); } catch { error = 'Batch attributes must be valid JSON.'; return; }
      await api(`/api/master/skus/${selectedSkuId}/lots`, {
        method: 'POST',
        body: JSON.stringify({ lot_number: lotForm.lot_number, manufactured_at: lotForm.manufactured_at || null, expires_at: lotForm.expires_at || null, batch_attributes: attrs }),
      });
      notice = 'Lot created.';
      lotForm = { lot_number: '', manufactured_at: '', expires_at: '', batch_attributes: '{}' };
      await loadSkuDetails(selectedSkuId);
    } catch (e) { error = e.message; }
  }

  async function createPackaging() {
    try {
      error = '';
      let dims = {};
      try { dims = JSON.parse(packForm.dimensions_cm || '{}'); } catch { error = 'Dimensions must be valid JSON.'; return; }
      await api(`/api/master/skus/${selectedSkuId}/packaging`, {
        method: 'POST',
        body: JSON.stringify({ package_type: packForm.package_type, units_per_package: Number(packForm.units_per_package), weight_grams: packForm.weight_grams ? Number(packForm.weight_grams) : null, dimensions_cm: dims }),
      });
      notice = 'Packaging spec added.';
      packForm = { package_type: 'box', units_per_package: 1, weight_grams: '', dimensions_cm: '{}' };
      await loadSkuDetails(selectedSkuId);
    } catch (e) { error = e.message; }
  }

  async function createBin() {
    try {
      error = '';
      await api('/api/master/bins', { method: 'POST', body: JSON.stringify(binForm) });
      notice = 'Bin location created.';
      binForm = { warehouse_code: '', aisle: '', shelf: '', bin_code: '' };
      await load();
    } catch (e) { error = e.message; }
  }

  async function createCarrier() {
    try {
      error = '';
      await api('/api/master/carriers', { method: 'POST', body: JSON.stringify({ ...carrierForm, service_levels: carrierForm.service_levels.split(',').map(s => s.trim()).filter(Boolean) }) });
      notice = 'Carrier created.';
      carrierForm = { code: '', name: '', service_levels: '' };
      await load();
    } catch (e) { error = e.message; }
  }

  async function createCustomer() {
    try {
      error = '';
      await api('/api/master/customers', { method: 'POST', body: JSON.stringify(customerForm) });
      notice = 'Customer created.';
      customerForm = { full_name: '', email: '', phone: '', marketing_email_consent: false, marketing_sms_consent: false };
      await load();
    } catch (e) { error = e.message; }
  }

  async function runDedupe() {
    try {
      error = '';
      const scan = await api('/api/master/customers/dedupe-scan');
      dedupeResults = scan.items || [];
      notice = `Dedupe scan found ${dedupeResults.length} potential duplicate pairs.`;
    } catch (e) { error = e.message; }
  }

  async function dedupeMerge(sourceId, targetId) {
    confirmAction = {
      message: `Merge customer ${sourceId} into ${targetId}? This action is logged immutably and cannot be fully undone.`,
      run: async () => {
        try {
          error = '';
          const result = await api('/api/master/customers/dedupe-merge', {
            method: 'POST',
            body: JSON.stringify({ source_customer_id: sourceId, target_customer_id: targetId }),
          });
          notice = `Customers merged (reason: ${result.reason}). Recorded in immutable log.`;
          dedupeResults = dedupeResults.filter(d => d.a !== sourceId && d.b !== sourceId);
          confirmAction = null;
          await load();
        } catch (e) { error = e.message; confirmAction = null; }
      },
    };
  }

  async function importCsv() {
    if (!importForm.file_path) { error = 'File path is required for CSV import.'; return; }
    confirmAction = {
      message: `Import customers from "${importForm.file_path}"? Duplicates will be skipped.`,
      run: async () => {
        try {
          error = '';
          const result = await api('/api/master/customers/import-csv', {
            method: 'POST',
            body: JSON.stringify({ file_path: importForm.file_path }),
          });
          notice = `CSV import complete: ${result.created} created, ${result.merged} skipped (duplicates).`;
          importForm = { file_path: '' };
          confirmAction = null;
          await load();
        } catch (e) { error = e.message; confirmAction = null; }
      },
    };
  }

  async function exportCsv() {
    try {
      error = '';
      await api('/api/master/customers/export-csv', { method: 'POST', body: JSON.stringify({ file_path: '/tmp/customers_export.csv' }) });
      notice = 'Customer CSV exported to /tmp/customers_export.csv';
    } catch (e) { error = e.message; }
  }

  function confirmRiskyAction(message, action) {
    confirmAction = { message, run: action };
  }

  function cancelConfirm() {
    confirmAction = null;
  }

  async function setInventory() {
    confirmRiskyAction(`Update inventory for SKU ${inventoryForm.sku_id} in store ${inventoryForm.store_code}?`, async () => {
      try {
        error = ''; inventoryNotice = '';
        const prev = { ...inventoryForm };
        await api('/api/master/inventory', { method: 'POST', body: JSON.stringify({ ...inventoryForm, stock_qty: Number(inventoryForm.stock_qty), unit_price_cents: Number(inventoryForm.unit_price_cents) }) });
        inventoryNotice = 'Inventory updated.';
        confirmAction = null;
        undoAction = { label: 'Undo inventory change', run: async () => { await api('/api/master/inventory', { method: 'POST', body: JSON.stringify({ store_code: prev.store_code, sku_id: prev.sku_id, stock_qty: Number(prev.stock_qty), unit_price_cents: Number(prev.unit_price_cents) }) }); notice = 'Inventory reverted.'; undoAction = null; } };
      } catch (e) { error = e.message; confirmAction = null; }
    });
  }

  async function createShippingRate() {
    confirmRiskyAction('Create a new shipping rate? This adds a new rate entry.', async () => {
      try {
        error = '';
        await api('/api/master/shipping-rates', { method: 'POST', body: JSON.stringify({ ...shippingForm, min_subtotal_cents: Number(shippingForm.min_subtotal_cents), rate_cents: Number(shippingForm.rate_cents) }) });
        notice = 'Shipping rate created.';
        confirmAction = null;
      } catch (e) { error = e.message; confirmAction = null; }
    });
  }

  async function createPromotion() {
    confirmRiskyAction(`Create ${promoForm.promo_type} promotion${promoForm.code ? ' (' + promoForm.code + ')' : ''}?`, async () => {
      try {
        error = '';
        const payload = { promo_type: promoForm.promo_type, discount_percent: Number(promoForm.discount_percent) };
        if (promoForm.code) payload.code = promoForm.code;
        if (promoForm.threshold_cents) payload.threshold_cents = Number(promoForm.threshold_cents);
        await api('/api/master/promotions', { method: 'POST', body: JSON.stringify(payload) });
        notice = 'Promotion created.';
        promoForm = { promo_type: 'coupon', code: '', discount_percent: 10, threshold_cents: '' };
        confirmAction = null;
      } catch (e) { error = e.message; confirmAction = null; }
    });
  }

  onMount(load);
</script>

<div class="space-y-6 text-slate-100">
  <h2 class="text-2xl font-bold tracking-tight">Merchandise & Master Data Administration</h2>

  {#if error}<div class="rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-200">{error}</div>{/if}
  {#if notice}
    <div class="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
      <span>{notice}</span>
      {#if undoAction}
        <button class="rounded-md bg-amber-600 px-3 py-1 text-xs text-white hover:bg-amber-500 transition" on:click={async () => { try { await undoAction.run(); } catch(e) { error = e.message; } }}>{undoAction.label}</button>
      {/if}
    </div>
  {/if}
  {#if confirmAction}
    <div class="rounded-xl border border-amber-500/30 bg-amber-950/40 px-4 py-3 text-sm text-amber-200 flex items-center justify-between gap-4">
      <span>⚠ {confirmAction.message}</span>
      <div class="flex gap-2">
        <button class="rounded-md bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-500 transition" on:click={confirmAction.run}>Confirm</button>
        <button class="rounded-md bg-slate-700 px-3 py-1 text-xs text-white hover:bg-slate-600 transition" on:click={cancelConfirm}>Cancel</button>
      </div>
    </div>
  {/if}

  <!-- Section Nav -->
  <nav class="flex flex-wrap gap-2">
    {#each [['rules','Coding Rules'],['skus','SKUs'],['bins','Bins'],['carriers','Carriers'],['customers','Customers'],['inventory','Inventory'],['shipping','Shipping Rates'],['promos','Promotions']] as [key, label]}
      <button class={activeSection === key ? 'rounded-md bg-white px-3 py-2 text-sm text-black font-medium' : 'rounded-md bg-slate-900 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800'} on:click={() => (activeSection = key)}>{label}</button>
    {/each}
  </nav>

  <!-- Coding Rules -->
  {#if activeSection === 'rules'}
    <section class="rounded-2xl border border-slate-800 bg-slate-950/80 p-5 shadow-lg">
      <h3 class="text-lg font-semibold mb-4">SKU Coding Rules</h3>
      <p class="text-xs text-slate-500 mb-3">Define human-readable identifier templates (e.g. "SKU-YYYYMM-####") with effective dates. Expiry is automatically set to 11:59 PM on the chosen date.</p>
      <div class="grid gap-3 md:grid-cols-2 mb-4">
        <input class={fieldClasses()} bind:value={ruleForm.name} placeholder="Rule name" />
        <input class={fieldClasses()} bind:value={ruleForm.template} placeholder="Template (e.g. SKU-####)" />
        <div>
          <label class="block text-xs text-slate-400 mb-1">Effective Start (MM/DD/YYYY)</label>
          <input class={fieldClasses()} type="date" bind:value={ruleForm.effective_start_at} />
        </div>
        <div>
          <label class="block text-xs text-slate-400 mb-1">Effective End (expires at 11:59 PM)</label>
          <input class={fieldClasses()} type="date" bind:value={ruleForm.effective_end_at} />
        </div>
        <input class={fieldClasses()} type="number" bind:value={ruleForm.priority} placeholder="Priority" />
        <button class={btnClasses()} on:click={createRule}>Create Rule</button>
      </div>
      <div class="space-y-2 max-h-48 overflow-y-auto">
        {#each rules as r}
          <div class="flex justify-between items-center rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-2 text-sm">
            <div><strong class="text-slate-200">{r.name}</strong> <span class="text-slate-500">— {r.template}</span></div>
            <div class="text-xs text-slate-500">
              {r.effective_start_at ? formatExpiryDate(r.effective_start_at) : '—'} → {r.effective_end_at ? formatExpiryDate(r.effective_end_at) + ' 11:59 PM' : 'no end'}
            </div>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <!-- SKUs -->
  {#if activeSection === 'skus'}
    <section class="rounded-2xl border border-slate-800 bg-slate-950/80 p-5 shadow-lg">
      <h3 class="text-lg font-semibold mb-4">SKU Management</h3>
      <div class="grid gap-3 md:grid-cols-3 mb-4">
        <input class={fieldClasses()} bind:value={skuForm.name} placeholder="SKU Name" />
        <input class={fieldClasses()} bind:value={skuForm.description} placeholder="Description" />
        <div>
          <label class="block text-xs text-slate-400 mb-1">Expiry Date (MM/DD/YYYY at 11:59 PM)</label>
          <input class={fieldClasses()} bind:value={skuForm.expiry_date} placeholder="MM/DD/YYYY" />
        </div>
      </div>
      <button class={btnClasses()} on:click={createSku}>Create SKU</button>

      <h4 class="text-sm font-semibold text-slate-400 mt-6 mb-2">Existing SKUs <span class="text-slate-600">({skus.length})</span></h4>
      <div class="space-y-2 max-h-48 overflow-y-auto">
        {#each skus as s}
          <div class="flex justify-between items-center rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-2 text-sm">
            <div>
              <span class="font-mono text-emerald-400">{s.code}</span> — {s.name}
              <span class="text-xs text-slate-500 ml-2">exp: {s.code_expires_at ? formatExpiryDate(s.code_expires_at) : '—'}</span>
            </div>
            <button class={btnSmall()} on:click={() => loadSkuDetails(s.id)}>Details</button>
          </div>
        {/each}
      </div>

      {#if selectedSkuId}
        <div class="mt-6 space-y-4 border-t border-slate-800 pt-4">
          <h4 class="font-semibold text-slate-300">SKU Details: <span class="font-mono text-emerald-400">{selectedSkuId}</span></h4>

          <!-- Barcodes -->
          <div class="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <h5 class="text-sm font-semibold text-slate-400 mb-2">Barcodes</h5>
            <div class="grid gap-2 md:grid-cols-3 mb-2">
              <input class={fieldClasses()} bind:value={barcodeForm.barcode} placeholder="Barcode value" />
              <select class={fieldClasses()} bind:value={barcodeForm.symbology}>
                <option>EAN-13</option><option>UPC-A</option><option>Code-128</option><option>QR</option>
              </select>
              <button class={btnSmall()} on:click={createBarcode}>Add Barcode</button>
            </div>
            {#each barcodes as bc}<div class="text-xs text-slate-500">{bc.barcode} ({bc.symbology}) {bc.is_primary ? '★' : ''}</div>{/each}
          </div>

          <!-- Lots -->
          <div class="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <h5 class="text-sm font-semibold text-slate-400 mb-2">Batch / Lot Attributes</h5>
            <div class="grid gap-2 md:grid-cols-2 mb-2">
              <input class={fieldClasses()} bind:value={lotForm.lot_number} placeholder="Lot number" />
              <input class={fieldClasses()} type="date" bind:value={lotForm.manufactured_at} placeholder="Manufactured at" />
              <input class={fieldClasses()} type="date" bind:value={lotForm.expires_at} placeholder="Lot expires at" />
              <input class={fieldClasses()} bind:value={lotForm.batch_attributes} placeholder='Attributes JSON e.g. {"color":"red"}' />
            </div>
            <button class={btnSmall()} on:click={createLot}>Add Lot</button>
            {#each lots as lt}<div class="text-xs text-slate-500 mt-1">#{lt.lot_number} — mfg: {lt.manufactured_at || '—'} exp: {lt.expires_at || '—'}</div>{/each}
          </div>

          <!-- Packaging -->
          <div class="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <h5 class="text-sm font-semibold text-slate-400 mb-2">Packaging Specs</h5>
            <div class="grid gap-2 md:grid-cols-2 mb-2">
              <select class={fieldClasses()} bind:value={packForm.package_type}>
                <option>box</option><option>bag</option><option>crate</option><option>pallet</option><option>envelope</option>
              </select>
              <input class={fieldClasses()} type="number" bind:value={packForm.units_per_package} placeholder="Units per package" />
              <input class={fieldClasses()} bind:value={packForm.weight_grams} placeholder="Weight (grams)" />
              <input class={fieldClasses()} bind:value={packForm.dimensions_cm} placeholder='Dimensions JSON e.g. {"l":30,"w":20,"h":10}' />
            </div>
            <button class={btnSmall()} on:click={createPackaging}>Add Packaging</button>
            {#each packaging as pk}<div class="text-xs text-slate-500 mt-1">{pk.package_type} — {pk.units_per_package} units, {pk.weight_grams || '?'}g</div>{/each}
          </div>
        </div>
      {/if}
    </section>
  {/if}

  <!-- Bins -->
  {#if activeSection === 'bins'}
    <section class="rounded-2xl border border-slate-800 bg-slate-950/80 p-5 shadow-lg">
      <h3 class="text-lg font-semibold mb-4">Bin Locations</h3>
      <div class="grid gap-3 md:grid-cols-4 mb-4">
        <input class={fieldClasses()} bind:value={binForm.warehouse_code} placeholder="Warehouse code" />
        <input class={fieldClasses()} bind:value={binForm.aisle} placeholder="Aisle" />
        <input class={fieldClasses()} bind:value={binForm.shelf} placeholder="Shelf" />
        <input class={fieldClasses()} bind:value={binForm.bin_code} placeholder="Bin code" />
      </div>
      <button class={btnClasses()} on:click={createBin}>Create Bin</button>
      <div class="space-y-1 mt-4 max-h-40 overflow-y-auto">
        {#each bins as b}<div class="text-xs text-slate-500 bg-slate-900 border border-slate-800 p-2 rounded">{b.warehouse_code} / {b.aisle} / {b.shelf} / <strong>{b.bin_code}</strong></div>{/each}
      </div>
    </section>
  {/if}

  <!-- Carriers -->
  {#if activeSection === 'carriers'}
    <section class="rounded-2xl border border-slate-800 bg-slate-950/80 p-5 shadow-lg">
      <h3 class="text-lg font-semibold mb-4">Carriers</h3>
      <div class="grid gap-3 md:grid-cols-3 mb-4">
        <input class={fieldClasses()} bind:value={carrierForm.code} placeholder="Carrier code" />
        <input class={fieldClasses()} bind:value={carrierForm.name} placeholder="Carrier name" />
        <input class={fieldClasses()} bind:value={carrierForm.service_levels} placeholder="Service levels (comma-separated)" />
      </div>
      <button class={btnClasses()} on:click={createCarrier}>Create Carrier</button>
      <div class="space-y-1 mt-4 max-h-40 overflow-y-auto">
        {#each carriers as c}<div class="text-xs text-slate-500 bg-slate-900 border border-slate-800 p-2 rounded"><strong>{c.code}</strong> — {c.name}</div>{/each}
      </div>
    </section>
  {/if}

  <!-- Customers -->
  {#if activeSection === 'customers'}
    <section class="rounded-2xl border border-slate-800 bg-slate-950/80 p-5 shadow-lg">
      <h3 class="text-lg font-semibold mb-4">Customer Administration</h3>
      <div class="grid gap-3 md:grid-cols-2 mb-3">
        <input class={fieldClasses()} bind:value={customerForm.full_name} placeholder="Full name" />
        <input class={fieldClasses()} bind:value={customerForm.email} placeholder="Email" />
        <input class={fieldClasses()} bind:value={customerForm.phone} placeholder="Phone" />
        <div class="flex items-center gap-4">
          <label class="flex items-center gap-2 text-sm text-slate-400"><input type="checkbox" bind:checked={customerForm.marketing_email_consent} /> Email consent</label>
          <label class="flex items-center gap-2 text-sm text-slate-400"><input type="checkbox" bind:checked={customerForm.marketing_sms_consent} /> SMS consent</label>
        </div>
      </div>
      <div class="flex flex-wrap gap-3 mb-4">
        <button class={btnClasses()} on:click={createCustomer}>Create Customer</button>
        <button class={btnSmall()} on:click={runDedupe}>Run Dedupe Scan</button>
        <button class={btnSmall()} on:click={exportCsv}>Export CSV</button>
      </div>

      <!-- CSV Import -->
      <div class="rounded-xl border border-slate-800 bg-slate-900/40 p-4 mb-4">
        <h4 class="text-sm font-semibold text-slate-400 mb-2">Import Customers from CSV</h4>
        <p class="text-xs text-slate-500 mb-2">Provide the path to a local CSV file (max 20 MB). Duplicate customers matched by email or normalized phone will be skipped.</p>
        <div class="flex gap-3">
          <input class={fieldClasses()} bind:value={importForm.file_path} placeholder="File path (e.g. /tmp/customers.csv)" />
          <button class={btnSmall()} on:click={importCsv}>Import CSV</button>
        </div>
      </div>

      <!-- Dedupe Merge Results -->
      {#if dedupeResults.length > 0}
        <div class="rounded-xl border border-amber-500/20 bg-amber-950/20 p-4 mb-4">
          <h4 class="text-sm font-semibold text-amber-300 mb-2">Duplicate Pairs Found ({dedupeResults.length})</h4>
          <p class="text-xs text-slate-500 mb-2">Click "Merge" to merge the source into the target. This is recorded in the immutable change log.</p>
          <div class="space-y-2 max-h-40 overflow-y-auto">
            {#each dedupeResults as dup}
              <div class="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs">
                <span class="text-slate-300">
                  <span class="font-mono">{dup.a}</span> ↔ <span class="font-mono">{dup.b}</span>
                  <span class="text-amber-400 ml-2">({dup.reason})</span>
                </span>
                <button class="rounded bg-amber-600 px-3 py-1 text-xs text-white hover:bg-amber-500 transition" on:click={() => dedupeMerge(dup.a, dup.b)}>Merge {dup.a} → {dup.b}</button>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <div class="space-y-1 max-h-48 overflow-y-auto">
        {#each customers as c}
          <div class="text-xs bg-slate-900 border border-slate-800 p-2 rounded text-slate-400">
            <strong class="text-slate-200">{c.full_name}</strong> — {c.email || '—'} / {c.phone_masked || c.phone || '—'}
            {#if c.marketing_email_consent}<span class="text-blue-400 ml-1">📧</span>{/if}
            {#if c.marketing_sms_consent}<span class="text-blue-400 ml-1">📱</span>{/if}
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <!-- Inventory -->
  {#if activeSection === 'inventory'}
    <section class="rounded-2xl border border-slate-800 bg-slate-950/80 p-5 shadow-lg">
      <h3 class="text-lg font-semibold mb-4">Inventory Management</h3>
      <div class="grid gap-3 md:grid-cols-4 mb-4">
        <input class={fieldClasses()} bind:value={inventoryForm.store_code} placeholder="Store code (e.g. MAIN)" />
        <input class={fieldClasses()} bind:value={inventoryForm.sku_id} placeholder="SKU ID" />
        <input class={fieldClasses()} type="number" bind:value={inventoryForm.stock_qty} placeholder="Stock qty" />
        <input class={fieldClasses()} type="number" bind:value={inventoryForm.unit_price_cents} placeholder="Unit price (cents)" />
      </div>
      <button class={btnClasses()} on:click={setInventory}>Set Inventory</button>
      {#if inventoryNotice}<p class="text-xs text-emerald-400 mt-2">{inventoryNotice}</p>{/if}
    </section>
  {/if}

  <!-- Shipping Rates -->
  {#if activeSection === 'shipping'}
    <section class="rounded-2xl border border-slate-800 bg-slate-950/80 p-5 shadow-lg">
      <h3 class="text-lg font-semibold mb-4">Shipping / Delivery Rates</h3>
      <div class="grid gap-3 md:grid-cols-4 mb-4">
        <input class={fieldClasses()} bind:value={shippingForm.store_code} placeholder="Store code" />
        <select class={fieldClasses()} bind:value={shippingForm.method}>
          <option value="pickup">Pickup</option>
          <option value="local_delivery">Local Delivery</option>
          <option value="shipment">Shipment</option>
        </select>
        <input class={fieldClasses()} type="number" bind:value={shippingForm.min_subtotal_cents} placeholder="Min subtotal (cents)" />
        <input class={fieldClasses()} type="number" bind:value={shippingForm.rate_cents} placeholder="Rate (cents)" />
      </div>
      <button class={btnClasses()} on:click={createShippingRate}>Create Rate</button>
    </section>
  {/if}

  <!-- Promotions -->
  {#if activeSection === 'promos'}
    <section class="rounded-2xl border border-slate-800 bg-slate-950/80 p-5 shadow-lg">
      <h3 class="text-lg font-semibold mb-4">Promotions</h3>
      <p class="text-xs text-slate-500 mb-3">At most one coupon may combine with member pricing but never with threshold discounts.</p>
      <div class="grid gap-3 md:grid-cols-4 mb-4">
        <select class={fieldClasses()} bind:value={promoForm.promo_type}>
          <option value="coupon">Coupon</option>
          <option value="threshold">Threshold</option>
        </select>
        <input class={fieldClasses()} bind:value={promoForm.code} placeholder="Code (for coupon)" />
        <input class={fieldClasses()} type="number" bind:value={promoForm.discount_percent} placeholder="Discount %" />
        <input class={fieldClasses()} bind:value={promoForm.threshold_cents} placeholder="Threshold (cents, for threshold type)" />
      </div>
      <button class={btnClasses()} on:click={createPromotion}>Create Promotion</button>
    </section>
  {/if}
</div>
