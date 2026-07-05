(function () {
  function selectedPlanId(panel) {
    const checked = panel?.querySelector('input[type="radio"]:checked');
    if (!checked) return '';
    return checked.dataset.sellingPlanId || checked.value || '';
  }

  function findProductForm(container, formId) {
    const byId = formId ? document.getElementById(formId) : null;
    if (byId) return byId;

    const section = container.closest('.shopify-section');
    if (section) {
      const inSection = section.querySelector('form[action*="/cart/add"]');
      if (inSection) return inSection;
    }

    return document.querySelector('form[action*="/cart/add"]');
  }

  function mountHiddenInputInsideForm(form, hiddenInput) {
    if (!form || !hiddenInput) return hiddenInput;

    if (!form.contains(hiddenInput)) {
      form.appendChild(hiddenInput);
      hiddenInput.removeAttribute('form');
    }

    return hiddenInput;
  }

  function variantIdFromForm(form) {
    const input = form?.querySelector('[name="id"]');
    return input?.value ? String(input.value) : null;
  }

  function init(container) {
    const formId = container.dataset.formId;
    const hiddenInput = container.querySelector('.retain-selling-plan-input');
    if (!hiddenInput) return;

    const form = findProductForm(container, formId);
    if (!form) return;

    mountHiddenInputInsideForm(form, hiddenInput);

    const panels = Array.from(container.querySelectorAll('[data-variant-id]'));

    function syncForVariant(variantId) {
      if (!variantId) return;
      panels.forEach((panel) => {
        const match = panel.dataset.variantId === variantId;
        panel.classList.toggle('retain-purchase-options--hidden', !match);
        if (match) {
          hiddenInput.value = selectedPlanId(panel);
        }
      });
    }

    container.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.type !== 'radio') return;
      if (!target.name.startsWith('retain_purchase_option_')) return;
      hiddenInput.value = target.dataset.sellingPlanId || target.value || '';
    });

    form.addEventListener('change', (event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.name === 'id') {
        syncForVariant(String(target.value));
      }
      if (target instanceof HTMLSelectElement && target.name === 'id') {
        syncForVariant(String(target.value));
      }
    });

    document.addEventListener('variant:change', (event) => {
      const variant = event.detail?.variant;
      if (variant?.id) {
        syncForVariant(String(variant.id));
      }
    });

    syncForVariant(variantIdFromForm(form));
  }

  function boot(root) {
    root.querySelectorAll('[data-retain-purchase-options]').forEach(init);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => boot(document));
  } else {
    boot(document);
  }

  document.addEventListener('shopify:section:load', (event) => {
    if (event.target) boot(event.target);
  });
})();
