(function () {
  const HIDDEN_CLASS = 'selling_plan_theme_integration--hidden';

  class RetainSellingPlansWidget {
    constructor(container) {
      this.container = container;
      this.hideNativeSellingPlans();
      this.appendSellingPlanInputs();
      this.bindSubmitHandlers();
      this.patchCartAddFetch();
      this.updateSellingPlanInputsValues();
      this.listenToVariantChange();
      this.listenToSellingPlanFormRadioButtonChange();
      this.syncOptionLabels();
      this.updatePrice();
    }

    hideNativeSellingPlans() {
      if (this.container.dataset.hideNativeSellingPlans !== 'true') return;
      document.body.classList.add('retain-hide-native-selling-plans');

      // Theme-native / custom selling-plan wrappers (Dawn, Horizon, custom snippets)
      const selectors = [
        'product-subscriptions:not([data-retain-purchase-options])',
        '[data-module="product/subscriptions"]',
        '[data-selling-plan-group]',
        '.selling-plan-group',
        '.product-form__selling-plan',
        '.product__selling-plans',
        '.selling-plans',
        '.subscription-options',
        'fieldset.product-form__input--dropdown[name*="selling"]',
        'select[name="selling_plan"]',
        'select[name="purchase_option_values"]',
        'input[name="selling_plan"]:not(.retain-selected-selling-plan-id)',
      ];

      const roots = [this.shopifySection, document].filter(Boolean);

      roots.forEach((root) => {
        selectors.forEach((selector) => {
          root.querySelectorAll(selector).forEach((el) => {
            if (el.closest('[data-retain-purchase-options]')) return;
            if (el.classList.contains('retain-selected-selling-plan-id'))
              return;
            if (el.hasAttribute('data-retain-theme-purchase-options')) return;
            el.setAttribute('data-retain-hidden-native', 'true');
            el.style.setProperty('display', 'none', 'important');
          });
        });
      });
    }

    resolveOptionLabel(radio) {
      const fromData = radio.dataset.optionLabel;
      if (fromData && !fromData.includes('SellingPlanOptionDrop')) {
        return fromData;
      }

      return radio.dataset.groupName || radio.dataset.sellingPlanName || '';
    }

    resolveDeliveryLabel(radio) {
      const fromData = radio.dataset.deliveryLabel;
      if (fromData && !fromData.includes('SellingPlanOptionDrop')) {
        return fromData;
      }

      const frequency = radio.dataset.frequency;
      if (frequency) {
        return `Delivers every ${frequency.toLowerCase()}`;
      }

      return '';
    }

    syncOptionLabels() {
      this.container
        .querySelectorAll('[data-radio-type="selling_plan"]')
        .forEach((radio) => {
          const option = radio.closest('.retain-purchase-options__option');
          if (!option) return;

          const labelEl = option.querySelector('[data-retain-option-label]');
          const deliveryEl = option.querySelector(
            '[data-retain-delivery-label]',
          );
          const optionLabel = this.resolveOptionLabel(radio);
          const deliveryLabel = this.resolveDeliveryLabel(radio);

          if (labelEl && optionLabel) {
            labelEl.textContent = optionLabel;
          }
          if (deliveryEl) {
            if (deliveryLabel) {
              deliveryEl.textContent = deliveryLabel;
              deliveryEl.hidden = false;
            } else {
              deliveryEl.textContent = '';
              deliveryEl.hidden = true;
            }
          }

          radio.dataset.optionLabel = optionLabel;
          radio.dataset.deliveryLabel = deliveryLabel;
        });
    }

    get sectionId() {
      return (
        this.container.dataset.sectionId ||
        this.shopifySection?.id?.replace(/^shopify-section-/, '') ||
        ''
      );
    }

    get shopifySection() {
      const fromId = this.container.dataset.sectionId
        ? document.querySelector(
            `#shopify-section-${this.container.dataset.sectionId}`,
          )
        : null;
      return fromId || this.container.closest('.shopify-section');
    }

    get addToCartForms() {
      const section = this.shopifySection;
      if (!section) return [];

      const forms = section.querySelectorAll('form[action*="/cart/add"]');
      if (forms.length > 0) return Array.from(forms);

      const productForm = section.querySelector('product-form form');
      return productForm ? [productForm] : [];
    }

    get variantIdInput() {
      const forms = this.addToCartForms;
      return (
        forms[1]?.querySelector('input[name="id"], select[name="id"]') ||
        forms[0]?.querySelector('input[name="id"], select[name="id"]') ||
        this.shopifySection?.querySelector(
          'input[name="id"], select[name="id"]',
        )
      );
    }

    get sellingPlanInput() {
      return this.container.querySelector('.retain-selected-selling-plan-id');
    }

    get sellingPlanInputs() {
      const section = this.shopifySection;
      const inSection = section
        ? section.querySelectorAll('.retain-selected-selling-plan-id')
        : [];
      return inSection.length > 0
        ? inSection
        : this.container.querySelectorAll('.retain-selected-selling-plan-id');
    }

    get visibleSellingPlanForm() {
      const variantId = this.variantIdInput?.value;
      if (!variantId) return null;
      return this.container.querySelector(
        `section[data-variant-id="${variantId}"]`,
      );
    }

    get selectedPurchaseOption() {
      return this.visibleSellingPlanForm?.querySelector(
        'input[type="radio"]:checked',
      );
    }

    get sellingPlanInputValue() {
      const selected = this.selectedPurchaseOption;
      if (!selected) return '';
      if (selected.dataset.radioType === 'one_time_purchase') return '';
      return selected.dataset.sellingPlanId || '';
    }

    get priceElement() {
      return this.shopifySection?.querySelector('.price');
    }

    get regularPriceElement() {
      return this.shopifySection?.querySelector('.price__regular');
    }

    get salePriceElement() {
      return this.shopifySection?.querySelector('.price__sale');
    }

    appendSellingPlanInputs() {
      const source = this.sellingPlanInput;
      if (!source) return;

      this.addToCartForms.forEach((form) => {
        form
          .querySelectorAll('.retain-selected-selling-plan-id')
          .forEach((input) => {
            if (input !== source) input.remove();
          });

        if (!form.contains(source)) {
          form.appendChild(source.cloneNode());
        }
      });
    }

    bindSubmitHandlers() {
      this.addToCartForms.forEach((form) => {
        form.addEventListener(
          'submit',
          () => {
            this.updateSellingPlanInputsValues();
          },
          true,
        );
      });
    }

    patchCartAddFetch() {
      if (window.__retainSellingPlanFetchPatched) return;
      window.__retainSellingPlanFetchPatched = true;

      const widgets = () =>
        Array.from(document.querySelectorAll('[data-retain-purchase-options]'))
          .map((el) => el.__retainWidget)
          .filter(Boolean);

      const originalFetch = window.fetch.bind(window);
      window.fetch = function retainCartAddFetch(input, init) {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof Request
              ? input.url
              : '';

        if (url.includes('/cart/add')) {
          widgets().forEach((widget) => widget.updateSellingPlanInputsValues());

          const planId =
            widgets()
              .map((w) => w.sellingPlanInputValue)
              .find((v) => v) ?? '';

          if (init?.body && typeof init.body === 'string') {
            try {
              const parsed = JSON.parse(init.body);
              if (parsed.items && Array.isArray(parsed.items)) {
                parsed.items = parsed.items.map((item) => {
                  if (!planId) {
                    const { selling_plan: _removed, ...rest } = item;
                    return rest;
                  }
                  return { ...item, selling_plan: planId };
                });
                init = { ...init, body: JSON.stringify(parsed) };
              } else if (!parsed.selling_plan && planId) {
                init = {
                  ...init,
                  body: JSON.stringify({ ...parsed, selling_plan: planId }),
                };
              }
            } catch {
              // Not JSON — FormData or urlencoded; form inputs should already carry selling_plan.
            }
          }
        }

        return originalFetch(input, init);
      };
    }

    updateSellingPlanInputsValues() {
      const value = this.sellingPlanInputValue;
      this.sellingPlanInputs.forEach((input) => {
        input.value = value;
      });
    }

    showSellingPlanForm(formForVariant) {
      formForVariant?.classList.remove(
        HIDDEN_CLASS,
        'retain-purchase-options--hidden',
      );
    }

    hideSellingPlanForms(forms) {
      forms.forEach((element) => {
        element.classList.add(HIDDEN_CLASS, 'retain-purchase-options--hidden');
      });
    }

    handleSellingPlanFormVisibility() {
      const variantId = this.variantIdInput?.value;
      if (!variantId) return;

      const selectedForm = this.container.querySelector(
        `section[data-variant-id="${variantId}"]`,
      );
      const otherForms = this.container.querySelectorAll(
        `section[data-variant-id]:not([data-variant-id="${variantId}"])`,
      );

      this.showSellingPlanForm(selectedForm);
      this.hideSellingPlanForms(Array.from(otherForms));
    }

    handleVariantChange() {
      this.handleSellingPlanFormVisibility();
      this.updateSellingPlanInputsValues();
      this.listenToSellingPlanFormRadioButtonChange();
      this.syncOptionLabels();
      this.updatePrice();
    }

    listenToVariantChange() {
      this.addToCartForms.forEach((form) => {
        form.addEventListener('change', (event) => {
          const target = event.target;
          if (
            target instanceof HTMLInputElement ||
            target instanceof HTMLSelectElement
          ) {
            if (target.name === 'id') this.handleVariantChange();
          }
        });
      });

      const variantInput = this.variantIdInput;
      if (variantInput instanceof HTMLInputElement) {
        const observer = new MutationObserver(() => this.handleVariantChange());
        observer.observe(variantInput, {
          attributes: true,
          attributeFilter: ['value'],
        });
      }

      document.addEventListener('variant:change', (event) => {
        const variant = event.detail?.variant;
        if (variant?.id) {
          if (this.variantIdInput)
            this.variantIdInput.value = String(variant.id);
          this.handleVariantChange();
        }
      });
    }

    handleRadioButtonChange() {
      this.updateSellingPlanInputsValues();
      this.updatePrice();
    }

    listenToSellingPlanFormRadioButtonChange() {
      this.visibleSellingPlanForm
        ?.querySelectorAll('input[type="radio"]')
        .forEach((radio) => {
          if (radio.dataset.retainBound === 'true') return;
          radio.dataset.retainBound = 'true';
          radio.addEventListener('change', () =>
            this.handleRadioButtonChange(),
          );
        });
    }

    updatePrice() {
      const priceElement = this.priceElement;
      const selected = this.selectedPurchaseOption;
      if (!priceElement || !selected) return;

      const price = selected.dataset.variantPrice;
      const compareAt = selected.dataset.variantCompareAtPrice;
      const regular = this.regularPriceElement;
      const sale = this.salePriceElement;

      if (!price) return;

      const onSale = compareAt && compareAt !== price;

      if (!onSale) {
        priceElement.classList.remove('price--on-sale');
        if (regular) {
          regular.style.display = '';
          const regularValue = regular.querySelector('.price-item--regular');
          if (regularValue) regularValue.innerHTML = price;
        }
        if (sale) sale.style.display = 'none';
      } else {
        priceElement.classList.add('price--on-sale');
        if (regular) regular.style.display = 'none';
        if (sale) {
          sale.style.display = '';
          const saleValue = sale.querySelector('.price-item--sale');
          const regularValue = sale.querySelector('.price-item--regular');
          if (saleValue) saleValue.innerHTML = price;
          if (regularValue) regularValue.innerHTML = compareAt;
        }
      }
    }
  }

  function init(container) {
    if (container.__retainWidget) return;
    container.__retainWidget = new RetainSellingPlansWidget(container);
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
