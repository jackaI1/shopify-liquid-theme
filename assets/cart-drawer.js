// Cart drawer, delivery add-ons and product variant prices for Fresh Plate Kitchen.
//
// The top half of this file is pure logic with no DOM access. tests/cart-drawer.test.mjs
// imports those helpers directly with Node. The bottom half wires them to the page
// when the browser loads the theme.

export const DELIVERY_NOTE_KEY = 'Delivery note';
export const LEAVE_AT_DOOR_KEY = 'Leave at door';
export const DELIVERY_NOTE_MAX_LENGTH = 140;
const MAX_LINE_QUANTITY = 99;

// Shopify prices arrive as integer cents. Format them for the shop currency.
export function formatCents(cents, currency = 'USD', locale = 'en-US') {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
}

// How far the subtotal is from the free-delivery threshold, as a bar percentage.
export function freeDeliveryProgress(subtotalCents, thresholdCents) {
  const threshold = Math.max(0, Math.round(thresholdCents));
  const subtotal = Math.max(0, Math.round(subtotalCents));
  if (threshold === 0) {
    return { reached: true, remainingCents: 0, percent: 100 };
  }
  const remainingCents = Math.max(0, threshold - subtotal);
  const percent = Math.min(100, Math.round((subtotal / threshold) * 100));
  return { reached: remainingCents === 0, remainingCents, percent };
}

// Customer text goes into a cart attribute, so remove control characters,
// collapse whitespace and cap the length.
export function sanitizeDeliveryNote(raw) {
  return String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, DELIVERY_NOTE_MAX_LENGTH);
}

// Both keys are always sent. An empty string clears a value that was saved earlier.
export function buildCartAttributes({ note = '', leaveAtDoor = false } = {}) {
  return {
    [DELIVERY_NOTE_KEY]: sanitizeDeliveryNote(note),
    [LEAVE_AT_DOOR_KEY]: leaveAtDoor ? 'Yes' : '',
  };
}

// Body for /cart/change.js. Shopify line numbers start at 1.
export function buildLinePayload(line, quantity) {
  if (!Number.isInteger(line) || line < 1) {
    throw new RangeError('line must be a 1-based integer');
  }
  const parsed = Math.floor(Number(quantity));
  const safe = Number.isFinite(parsed) ? parsed : 0;
  return { line, quantity: Math.min(MAX_LINE_QUANTITY, Math.max(0, safe)) };
}

// ---- Browser wiring ----

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Accept: 'application/json', ...(options.headers || {}) },
  });
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${url} failed with ${response.status}`);
  }
  return response.json();
}

function postJson(url, body) {
  return requestJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function createLine(item, index, currency, onQuantity) {
  const li = document.createElement('li');
  li.className = 'cart-drawer__item';

  if (item.image) {
    const img = document.createElement('img');
    img.className = 'cart-drawer__thumb';
    img.src = item.image;
    img.alt = '';
    img.width = 64;
    img.height = 64;
    li.append(img);
  }

  const body = document.createElement('div');
  body.className = 'cart-drawer__item-body';

  const title = document.createElement('p');
  title.className = 'cart-drawer__item-title';
  title.textContent = item.variant_title
    ? `${item.product_title} (${item.variant_title})`
    : item.product_title;

  const price = document.createElement('p');
  price.className = 'cart-drawer__item-price';
  price.textContent = formatCents(item.line_price, currency);

  const controls = document.createElement('div');
  controls.className = 'cart-drawer__qty';

  const minus = document.createElement('button');
  minus.type = 'button';
  minus.textContent = '−';
  minus.setAttribute('aria-label', `Remove one ${item.product_title}`);
  minus.addEventListener('click', () => onQuantity(index, item.quantity - 1));

  const count = document.createElement('span');
  count.textContent = String(item.quantity);

  const plus = document.createElement('button');
  plus.type = 'button';
  plus.textContent = '+';
  plus.setAttribute('aria-label', `Add one ${item.product_title}`);
  plus.addEventListener('click', () => onQuantity(index, item.quantity + 1));

  controls.append(minus, count, plus);
  body.append(title, price, controls);
  li.append(body);
  return li;
}

export function initCartDrawer(doc = globalThis.document) {
  const drawer = doc.getElementById('cart-drawer');
  if (!drawer) return;

  const currency = doc.body.dataset.currency || 'USD';
  const thresholdCents = Number(drawer.dataset.freeDeliveryCents || 0);
  const panel = drawer.querySelector('[data-cart-panel]');
  const itemsList = drawer.querySelector('[data-cart-items]');
  const emptyMessage = drawer.querySelector('[data-cart-empty]');
  const deliveryMessage = drawer.querySelector('[data-delivery-message]');
  const deliveryBar = drawer.querySelector('[data-delivery-bar]');
  const subtotal = drawer.querySelector('[data-cart-subtotal]');
  const addonsForm = drawer.querySelector('[data-cart-addons]');
  const addonsStatus = drawer.querySelector('[data-addons-status]');
  const counters = doc.querySelectorAll('[data-cart-count]');
  let lastOpener = null;

  function setCount(cart) {
    counters.forEach((el) => {
      el.textContent = String(cart.item_count);
    });
  }

  function render(cart) {
    setCount(cart);
    subtotal.textContent = formatCents(cart.total_price, currency);

    const progress = freeDeliveryProgress(cart.total_price, thresholdCents);
    deliveryBar.style.width = `${progress.percent}%`;
    deliveryMessage.textContent = progress.reached
      ? 'You qualify for free delivery.'
      : `Add ${formatCents(progress.remainingCents, currency)} more for free delivery.`;

    itemsList.replaceChildren(
      ...cart.items.map((item, index) => createLine(item, index, currency, changeQuantity))
    );
    emptyMessage.hidden = cart.items.length > 0;
  }

  // Fill the delivery form from the saved cart. Only done when the drawer opens,
  // so quantity clicks never overwrite a note the customer is still typing.
  function syncAddons(cart) {
    addonsForm.elements.delivery_note.value = cart.attributes?.[DELIVERY_NOTE_KEY] ?? '';
    addonsForm.elements.leave_at_door.checked = cart.attributes?.[LEAVE_AT_DOOR_KEY] === 'Yes';
  }

  async function refresh({ syncForm = false } = {}) {
    const cart = await requestJson('/cart.js');
    render(cart);
    if (syncForm) syncAddons(cart);
  }

  async function changeQuantity(index, nextQuantity) {
    try {
      render(await postJson('/cart/change.js', buildLinePayload(index + 1, nextQuantity)));
    } catch (error) {
      console.error(error);
      deliveryMessage.textContent = 'Could not update that item. Please try again.';
    }
  }

  function open(opener = null) {
    lastOpener = opener;
    drawer.hidden = false;
    doc.body.classList.add('cart-open');
    panel.focus();
  }

  function close() {
    drawer.hidden = true;
    doc.body.classList.remove('cart-open');
    lastOpener?.focus();
  }

  doc.querySelectorAll('[data-cart-open]').forEach((button) => {
    button.addEventListener('click', () => {
      refresh({ syncForm: true }).catch(console.error);
      open(button);
    });
  });

  drawer.querySelectorAll('[data-cart-close]').forEach((el) => {
    el.addEventListener('click', close);
  });

  doc.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !drawer.hidden) close();
  });

  // Add-to-cart forms post to /cart/add. Send them with fetch so the drawer
  // opens with the new item. If the request fails, submit the form normally.
  doc.addEventListener('submit', async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.getAttribute('action') !== '/cart/add') return;
    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    if (button) button.disabled = true;
    try {
      const response = await fetch('/cart/add.js', {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: new FormData(form),
      });
      if (!response.ok) throw new Error(`Add to cart failed with ${response.status}`);
      await refresh({ syncForm: true });
      open(button);
    } catch (error) {
      console.error(error);
      form.submit();
    } finally {
      if (button) button.disabled = false;
    }
  });

  addonsForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const { elements } = addonsForm;
    const attributes = buildCartAttributes({
      note: elements.delivery_note.value,
      leaveAtDoor: elements.leave_at_door.checked,
    });
    addonsStatus.textContent = 'Saving...';
    try {
      render(await postJson('/cart/update.js', { attributes }));
      addonsStatus.textContent = 'Saved. Your packing team will see this note.';
    } catch (error) {
      console.error(error);
      addonsStatus.textContent = 'Could not save. Please try again.';
    }
  });

  refresh().catch(console.error);
}

export function initVariantPrices(doc = globalThis.document) {
  const currency = doc.body.dataset.currency || 'USD';
  doc.querySelectorAll('[data-variant-select]').forEach((select) => {
    const priceEl = doc.querySelector('[data-variant-price]');
    if (!priceEl) return;
    const update = () => {
      const option = select.selectedOptions[0];
      if (option?.dataset.priceCents) {
        priceEl.textContent = formatCents(Number(option.dataset.priceCents), currency);
      }
    };
    select.addEventListener('change', update);
  });
}

if (typeof document !== 'undefined') {
  const start = () => {
    initCartDrawer(document);
    initVariantPrices(document);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
}
