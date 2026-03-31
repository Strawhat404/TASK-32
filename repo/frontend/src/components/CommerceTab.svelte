<script>
  import { onMount } from 'svelte';
  export let token;
  let cartItems = [], preview = null, orderResult = null;
  let stores = [];
  let form = { sku_id: '', quantity: 1, member_pricing_applied: false, coupon_code: '' };
  let mergeForm = { from_store_code: '', to_store_code: 'MAIN' };
  let checkoutForm = { delivery_method: 'pickup', coupon_code: '', member_pricing: false, shipping_address: '' };
  let selectedStore = 'MAIN';
  let notice = '', error = '';
  let undoAction = null;
  let confirmAction = null;

  function fieldClasses() {
    return 'w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500';
  }
  function btnClasses(disabled = false) {
    return `rounded-md px-4 py-2 text-sm font-medium transition ${disabled ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-500'}`;
  }
  function btnSuccess(disabled = false) {
    return `rounded-md px-4 py-2 text-sm font-medium transition ${disabled ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-500'}`;
  }
  function btnDanger() {
    return 'rounded-md px-4 py-2 text-sm font-medium transition bg-rose-600 text-white hover:bg-rose-500';
  }

  async function api(path, req = {}) {
    const res = await fetch(path, {
      ...req,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(req.headers || {}) },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  async function loadStores() {
    try { stores = (await api('/api/master/stores'))?.items || []; } catch { stores = []; }
  }

  async function loadCart() {
    try {
      const result = await api(`/api/commerce/carts/${encodeURIComponent(selectedStore)}`);
      cartItems = result.items || [];
    } catch { cartItems = []; }
  }

  async function addToCart() {
    try {
      error = ''; notice = ''; orderResult = null;
      const payload = {
        sku_id: form.sku_id,
        quantity: Number(form.quantity),
        member_pricing_applied: form.member_pricing_applied,
      };
      if (form.coupon_code) payload.coupon_code = form.coupon_code;
      await api(`/api/commerce/carts/${encodeURIComponent(selectedStore)}/items`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      notice = `Added ${form.sku_id} (qty ${form.quantity}) to ${selectedStore} cart.`;
      form = { sku_id: '', quantity: 1, member_pricing_applied: false, coupon_code: '' };
      await loadCart();
    } catch (e) { error = e.message; }
  }

  async function mergeCarts() {
    const savedFrom = mergeForm.from_store_code;
    const savedTo = mergeForm.to_store_code;
    confirmAction = {
      message: `Merge cart from ${savedFrom} into ${savedTo}? Quantities sum with a cap of 10. Latest edit wins per line item.`,
      run: async () => {
        try {
          error = ''; notice = ''; confirmAction = null;
          const result = await api('/api/commerce/carts/merge', {
            method: 'POST',
            body: JSON.stringify({ from_store_code: savedFrom, to_store_code: savedTo }),
          });
          notice = `Merged ${result.items?.length || 0} line items from ${savedFrom} → ${savedTo}. Qty cap: ${result.quantity_cap}.`;
          undoAction = {
            label: `Undo merge (reverse ${savedTo} → ${savedFrom})`,
            run: async () => {
              await api('/api/commerce/carts/merge', {
                method: 'POST',
                body: JSON.stringify({ from_store_code: savedTo, to_store_code: savedFrom }),
              });
              notice = 'Merge reversed.'; undoAction = null;
              await loadCart();
            },
          };
          await loadCart();
        } catch (e) { error = e.message; confirmAction = null; }
      },
    };
  }

  async function loadPreview() {
    try {
      error = ''; preview = null;
      let url = `/api/commerce/checkout/preview?store_code=${encodeURIComponent(selectedStore)}`;
      if (checkoutForm.coupon_code) url += `&coupon_code=${encodeURIComponent(checkoutForm.coupon_code)}`;
      if (checkoutForm.member_pricing) url += `&member_pricing=true`;
      preview = await api(url);
    } catch (e) { error = e.message; }
  }

  async function placeOrder() {
    confirmAction = {
      message: `Place order for store ${selectedStore} via ${checkoutForm.delivery_method}? This will finalize the purchase and clear your cart.`,
      run: async () => {
        try {
          error = ''; notice = ''; orderResult = null; confirmAction = null;
          const payload = {
            store_code: selectedStore,
            delivery_method: checkoutForm.delivery_method,
          };
          if (checkoutForm.coupon_code) payload.coupon_code = checkoutForm.coupon_code;
          if (checkoutForm.member_pricing) payload.member_pricing = true;
          if (checkoutForm.shipping_address) payload.shipping_address = checkoutForm.shipping_address;
          orderResult = await api('/api/commerce/checkout/place', { method: 'POST', body: JSON.stringify(payload) });
          notice = `Order placed! Total: $${(orderResult.totals.total_cents / 100).toFixed(2)}`;
          preview = null;
          await loadCart();
        } catch (e) { error = e.message; confirmAction = null; }
      },
    };
  }

  function cancelConfirm() { confirmAction = null; }

  function cents(v) { return `$${(Number(v || 0) / 100).toFixed(2)}`; }

  onMount(async () => { await loadStores(); await loadCart(); });
</script>

<div class="space-y-6 text-slate-100">
  <h2 class="text-2xl font-bold tracking-tight">Shop & Checkout</h2>

  {#if error}<div class="rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-200">{error}</div>{/if}
  {#if notice}
    <div class="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
      <span>{notice}</span>
      {#if undoAction}
        <button class={btnDanger()} on:click={async () => { try { await undoAction.run(); undoAction = null; } catch(e) { error = e.message; } }}>{undoAction.label}</button>
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

  <!-- Store Selector -->
  <div class="rounded-2xl border border-slate-800 bg-slate-950/80 p-5 shadow-lg">
    <label class="block text-sm font-medium text-slate-400 mb-2">Active Store</label>
    <select class={fieldClasses()} bind:value={selectedStore} on:change={loadCart}>
      <option value="MAIN">MAIN</option>
      <option value="EAST">EAST</option>
      {#each stores as s}
        {#if s.code !== 'MAIN' && s.code !== 'EAST'}
          <option value={s.code}>{s.code}</option>
        {/if}
      {/each}
    </select>
  </div>

  <div class="grid gap-6 lg:grid-cols-2">
    <!-- Add to Cart -->
    <section class="rounded-2xl border border-slate-800 bg-slate-950/80 p-5 shadow-lg">
      <h3 class="text-lg font-semibold mb-4">Add to Cart</h3>
      <div class="space-y-3">
        <input class={fieldClasses()} bind:value={form.sku_id} placeholder="SKU ID" />
        <input class={fieldClasses()} type="number" min="1" max="10" bind:value={form.quantity} placeholder="Quantity" />
        <input class={fieldClasses()} bind:value={form.coupon_code} placeholder="Coupon code (optional)" />
        <label class="flex items-center gap-2 text-sm text-slate-400">
          <input type="checkbox" bind:checked={form.member_pricing_applied} class="rounded" /> Apply member pricing
        </label>
        <button class={btnClasses(!form.sku_id)} disabled={!form.sku_id} on:click={addToCart}>Add to Cart</button>
      </div>
    </section>

    <!-- Cart Items -->
    <section class="rounded-2xl border border-slate-800 bg-slate-950/80 p-5 shadow-lg">
      <h3 class="text-lg font-semibold mb-4">Cart — {selectedStore} ({cartItems.length} items)</h3>
      {#if cartItems.length === 0}
        <p class="text-sm text-slate-500">Cart is empty.</p>
      {:else}
        <div class="space-y-2 max-h-64 overflow-y-auto">
          {#each cartItems as item}
            <div class="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm">
              <div>
                <span class="font-mono text-emerald-400">{item.sku_id}</span>
                <span class="text-slate-500 ml-2">× {item.quantity}</span>
              </div>
              <div class="text-right text-slate-400">
                <span>{cents(item.unit_price_snapshot_cents)}/ea</span>
                {#if item.coupon_code}<span class="ml-2 text-amber-400 text-xs">🏷 {item.coupon_code}</span>{/if}
                {#if item.member_pricing_applied}<span class="ml-2 text-blue-400 text-xs">★ member</span>{/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  </div>

  <!-- Cart Merge -->
  <section class="rounded-2xl border border-slate-800 bg-slate-950/80 p-5 shadow-lg">
    <h3 class="text-lg font-semibold mb-4">Cart Merge (Cross-Store & Same-Store)</h3>
    <p class="text-xs text-slate-500 mb-3">Merges line items from one store cart into another. Quantities sum with a cap of 10. Latest edit wins per line item.</p>
    <div class="grid gap-3 md:grid-cols-3">
      <input class={fieldClasses()} bind:value={mergeForm.from_store_code} placeholder="From store code (e.g. EAST)" />
      <input class={fieldClasses()} bind:value={mergeForm.to_store_code} placeholder="To store code (e.g. MAIN)" />
      <button class={btnClasses(!mergeForm.from_store_code || !mergeForm.to_store_code)} disabled={!mergeForm.from_store_code || !mergeForm.to_store_code} on:click={mergeCarts}>Merge Carts</button>
    </div>
  </section>

  <!-- Checkout -->
  <section class="rounded-2xl border border-slate-800 bg-slate-950/80 p-5 shadow-lg">
    <h3 class="text-lg font-semibold mb-4">Checkout</h3>
    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-4">
      <div>
        <label class="block text-xs text-slate-400 mb-1">Delivery Method</label>
        <select class={fieldClasses()} bind:value={checkoutForm.delivery_method}>
          <option value="pickup">Pickup</option>
          <option value="local_delivery">Local Delivery</option>
          <option value="shipment">Shipment</option>
        </select>
      </div>
      <div>
        <label class="block text-xs text-slate-400 mb-1">Coupon Code</label>
        <input class={fieldClasses()} bind:value={checkoutForm.coupon_code} placeholder="e.g. WELCOME10" />
      </div>
      <div class="flex items-end">
        <label class="flex items-center gap-2 text-sm text-slate-400 pb-2">
          <input type="checkbox" bind:checked={checkoutForm.member_pricing} class="rounded" /> Member pricing
        </label>
      </div>
      <div>
        <label class="block text-xs text-slate-400 mb-1">Shipping Address</label>
        <input class={fieldClasses()} bind:value={checkoutForm.shipping_address} placeholder="Address (for shipment)" />
      </div>
    </div>
    <div class="flex gap-3 mb-4">
      <button class={btnClasses()} on:click={loadPreview}>Preview Checkout</button>
      <button class={btnSuccess(cartItems.length === 0)} disabled={cartItems.length === 0} on:click={placeOrder}>Place Order</button>
    </div>

    {#if preview}
      <div class="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3 text-sm">
        <h4 class="font-semibold text-slate-200">Order Preview</h4>

        {#if preview.promo?.message}
          <div class="rounded-lg border border-amber-500/30 bg-amber-950/40 px-3 py-2 text-amber-200 text-xs">
            💡 {preview.promo.message}
          </div>
        {/if}
        {#if preview.promo?.blocked}
          <div class="rounded-lg border border-red-500/30 bg-red-950/40 px-3 py-2 text-red-200 text-xs">
            🚫 {preview.promo.reason}
          </div>
        {/if}

        <div class="grid grid-cols-2 gap-y-2 border-b border-slate-800 pb-3">
          <span class="text-slate-400">Subtotal:</span><span class="text-right font-mono">{cents(preview.subtotal_cents)}</span>
          {#if preview.promo?.totalDiscount}
            <span class="text-slate-400">Discount:</span><span class="text-right font-mono text-emerald-400">−{cents(preview.promo.totalDiscount)}</span>
          {/if}
        </div>

        <div class="grid grid-cols-2 gap-y-2 border-b border-slate-800 pb-3">
          <span class="text-slate-400">Purchase Limit:</span><span class="text-right">{preview.purchase_limit}</span>
          <span class="text-slate-400">Already Purchased Today:</span><span class="text-right">{preview.purchase_limit_status?.already_purchased_today ?? '—'}</span>
          <span class="text-slate-400">In Cart Total Qty:</span><span class="text-right">{preview.purchase_limit_status?.in_cart_total_quantity ?? '—'}</span>
          <span class="text-slate-400">Would Exceed Limit:</span>
          <span class="text-right" class:text-red-400={preview.purchase_limit_status?.would_exceed} class:text-emerald-400={!preview.purchase_limit_status?.would_exceed}>
            {preview.purchase_limit_status?.would_exceed ? 'Yes' : 'No'}
          </span>
        </div>

        {#if preview.lines?.length}
          <h5 class="text-xs font-semibold text-slate-400 mt-2">Line Items</h5>
          <div class="space-y-1">
            {#each preview.lines as line}
              <div class="flex justify-between text-xs text-slate-400">
                <span class="font-mono">{line.sku_id} × {line.quantity}</span>
                <span>{cents(line.latest_unit_price * line.quantity)}</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    {#if orderResult}
      <div class="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-4 text-sm text-emerald-200">
        <h4 class="font-semibold mb-2">✅ Order Confirmed</h4>
        <div class="grid grid-cols-2 gap-y-1 text-xs">
          <span>Order ID:</span><span class="font-mono">{orderResult.order?.id}</span>
          <span>Subtotal:</span><span>{cents(orderResult.totals?.subtotal_cents)}</span>
          <span>Discount:</span><span>{cents(orderResult.totals?.discount_cents)}</span>
          <span>Shipping:</span><span>{cents(orderResult.totals?.shipping_cents)}</span>
          <span>Tax:</span><span>{cents(orderResult.totals?.tax_cents)}</span>
          <span class="font-semibold">Total:</span><span class="font-semibold">{cents(orderResult.totals?.total_cents)}</span>
        </div>
      </div>
    {/if}
  </section>
</div>
