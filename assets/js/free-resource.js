/**
 * Kahani Korner — Shared Free Resource Form
 *
 * Used by all email-gated free-resource landing pages.
 *
 * Each HTML page supplies its own resource information through
 * hidden form fields and button text.
 *
 * This is a soft email gate, not secure file protection.
 */

(function () {
  var FORM_ENDPOINT = "https://formspree.io/f/mdaqoegj";
  var MAX_PARAM_LEN = 60;

  var form = document.getElementById("rdl-form");

  if (!form) return;

  var formView = document.getElementById("rdl-form-view");
  var successView = document.getElementById("rdl-success-view");
  var successHeading = document.getElementById("rdl-success-heading");

  var submitBtn = document.getElementById("rdl-submit-btn");
  var formMsg = document.getElementById("rdl-form-msg");

  var firstNameInput = document.getElementById("rdl-first-name");
  var firstNameError = document.getElementById("rdl-first-name-error");

  var emailInput = document.getElementById("rdl-email");
  var emailError = document.getElementById("rdl-email-error");

  var formNameField = document.getElementById("rdl-form-name");
  var resourceField = document.getElementById("rdl-resource");
  var resourceIdField = document.getElementById("rdl-resource-id");
  var sourceField = document.getElementById("rdl-source");
  var keywordField = document.getElementById("rdl-keyword");
  var campaignField = document.getElementById("rdl-campaign");

  var isSubmitting = false;

  var resourceId =
    resourceIdField && resourceIdField.value
      ? resourceIdField.value
      : window.location.pathname;

  var unlockKey = "kk_resource_unlocked_" + resourceId;

  var defaultButtonText =
    submitBtn && submitBtn.dataset.defaultText
      ? submitBtn.dataset.defaultText
      : submitBtn
        ? submitBtn.textContent.trim()
        : "Get Free Resource";

  function sanitizeParam(value, fallback) {
    if (!value) return fallback;

    var cleaned = String(value)
      .trim()
      .slice(0, MAX_PARAM_LEN)
      .replace(/[^a-zA-Z0-9 _-]/g, "");

    return cleaned || fallback;
  }

  function getAttribution() {
    var params = new URLSearchParams(window.location.search);

    return {
      source: sanitizeParam(
        params.get("source"),
        sourceField ? sourceField.value : "resource_landing_page"
      ),

      keyword: sanitizeParam(
        params.get("keyword"),
        keywordField ? keywordField.value : ""
      ),

      campaign: sanitizeParam(
        params.get("campaign"),
        campaignField ? campaignField.value : ""
      ),
    };
  }

  function clearFieldError(input, errorEl) {
    if (!input) return;

    input.removeAttribute("aria-invalid");

    if (errorEl) {
      errorEl.textContent = "";
      errorEl.classList.remove("visible");
    }
  }

  function setFieldError(input, errorEl, message) {
    if (!input) return;

    input.setAttribute("aria-invalid", "true");

    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.add("visible");
    }
  }

  function showFormMessage(message, type) {
    if (!formMsg) return;

    formMsg.textContent = message;

    formMsg.className =
      "rdl-form-msg visible" +
      (type ? " rdl-form-msg--" + type : "");
  }

  function clearFormMessage() {
    if (!formMsg) return;

    formMsg.textContent = "";
    formMsg.className = "rdl-form-msg";
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function validateForm() {
    var valid = true;
    var firstInvalid = null;

    clearFieldError(firstNameInput, firstNameError);
    clearFieldError(emailInput, emailError);

    if (!firstNameInput || !firstNameInput.value.trim()) {
      setFieldError(
        firstNameInput,
        firstNameError,
        "Please enter your first name."
      );

      valid = false;
      firstInvalid = firstInvalid || firstNameInput;
    }

    if (
      !emailInput ||
      !emailInput.value.trim() ||
      !isValidEmail(emailInput.value.trim())
    ) {
      setFieldError(
        emailInput,
        emailError,
        "Please enter a valid email address."
      );

      valid = false;
      firstInvalid = firstInvalid || emailInput;
    }

    if (!valid && firstInvalid) {
      firstInvalid.focus();
    }

    return valid;
  }

  function unlockDownload(moveFocus) {
    if (formView) {
      formView.style.display = "none";
    }

    if (successView) {
      successView.style.display = "block";
    }

    try {
      sessionStorage.setItem(unlockKey, "true");
    } catch (e) {
      // sessionStorage unavailable.
    }

    if (moveFocus && successHeading) {
      successHeading.setAttribute("tabindex", "-1");
      successHeading.focus();
    }
  }

  function restoreUnlockedState() {
    try {
      if (sessionStorage.getItem(unlockKey) === "true") {
        unlockDownload(false);
      }
    } catch (e) {
      // Ignore unavailable sessionStorage.
    }
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (isSubmitting) return;

    clearFormMessage();

    if (!validateForm()) return;

    var attribution = getAttribution();

    var payload = {
      first_name: firstNameInput.value.trim(),
      email: emailInput.value.trim(),

      form_name: formNameField
        ? formNameField.value
        : "Kahani Korner Free Resource Download",

      resource: resourceField
        ? resourceField.value
        : document.title,

      resource_id: resourceId,

      source: attribution.source,
      keyword: attribution.keyword,
      campaign: attribution.campaign,

      page_url: window.location.href,
    };

    isSubmitting = true;

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Sending...";
    }

    fetch(FORM_ENDPOINT, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },

      body: JSON.stringify(payload),
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error(
            "Formspree submission failed: " + response.status
          );
        }

        unlockDownload(true);
      })

      .catch(function () {
        showFormMessage(
          "Something went wrong. Please try again.",
          "error"
        );
      })

      .finally(function () {
        isSubmitting = false;

        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = defaultButtonText;
        }
      });
  }

  form.addEventListener("submit", handleSubmit);

  restoreUnlockedState();
})();