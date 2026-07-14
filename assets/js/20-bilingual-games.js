/*
 * Kahani Korner — "20 Bilingual Games" free resource landing page.
 * Handles form validation, Formspree AJAX submission, the success/download
 * reveal, and the session-based soft unlock.
 *
 * This is a soft email gate for a free resource, not secure file protection —
 * the PDF path is a normal public URL once revealed in the DOM.
 */
(function () {
  var FORM_ENDPOINT = "https://formspree.io/f/mdaqoegj";
  var UNLOCK_KEY = "kk_20games_download_unlocked";
  var MAX_PARAM_LEN = 60;

  var form = document.getElementById("rdl-form");
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
  var sourceDefaultField = document.getElementById("rdl-source");
  var keywordDefaultField = document.getElementById("rdl-keyword");
  var campaignDefaultField = document.getElementById("rdl-campaign");

  if (!form) return;

  var isSubmitting = false;

  function sanitizeParam(value, fallback) {
    if (!value) return fallback;
    var cleaned = String(value).trim().slice(0, MAX_PARAM_LEN);
    cleaned = cleaned.replace(/[^a-zA-Z0-9 _-]/g, "");
    return cleaned || fallback;
  }

  function getAttribution() {
    var params = new URLSearchParams(window.location.search);
    return {
      source: sanitizeParam(
        params.get("source"),
        sourceDefaultField ? sourceDefaultField.value : "resource_landing_page"
      ),
      keyword: sanitizeParam(
        params.get("keyword"),
        keywordDefaultField ? keywordDefaultField.value : "20GAMES"
      ),
      campaign: sanitizeParam(
        params.get("campaign"),
        campaignDefaultField ? campaignDefaultField.value : ""
      ),
    };
  }

  function clearFieldError(input, errorEl) {
    input.removeAttribute("aria-invalid");
    if (errorEl) {
      errorEl.textContent = "";
      errorEl.classList.remove("visible");
    }
  }

  function setFieldError(input, errorEl, message) {
    input.setAttribute("aria-invalid", "true");
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.add("visible");
    }
  }

  function showFormMessage(message, type) {
    if (!formMsg) return;
    formMsg.textContent = message;
    formMsg.className = "rdl-form-msg visible" + (type ? " rdl-form-msg--" + type : "");
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

    if (!firstNameInput.value.trim()) {
      setFieldError(firstNameInput, firstNameError, "Please enter your first name.");
      valid = false;
      firstInvalid = firstInvalid || firstNameInput;
    }

    if (!emailInput.value.trim() || !isValidEmail(emailInput.value.trim())) {
      setFieldError(emailInput, emailError, "Please enter a valid email address.");
      valid = false;
      firstInvalid = firstInvalid || emailInput;
    }

    if (!valid && firstInvalid) firstInvalid.focus();
    return valid;
  }

  function unlockDownload(moveFocus) {
    if (formView) formView.style.display = "none";
    if (successView) successView.style.display = "block";
    try {
      sessionStorage.setItem(UNLOCK_KEY, "true");
    } catch (e) {
      /* sessionStorage unavailable — download area still shows for this view */
    }
    if (moveFocus && successHeading) {
      successHeading.setAttribute("tabindex", "-1");
      successHeading.focus();
    }
  }

  function restoreUnlockedStateFromSession() {
    var unlocked = false;
    try {
      unlocked = sessionStorage.getItem(UNLOCK_KEY) === "true";
    } catch (e) {
      unlocked = false;
    }
    if (unlocked) unlockDownload(false);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (isSubmitting) return;

    clearFormMessage();
    if (!validateForm()) return;

    var attribution = getAttribution();
    var payload = {
      first_name: firstNameInput.value.trim(),
      email: emailInput.value.trim(),
      form_name: formNameField ? formNameField.value : "Kahani Korner Free Resource Download",
      resource: resourceField ? resourceField.value : "20 Bilingual Games for Everyday Family Life",
      resource_id: resourceIdField ? resourceIdField.value : "20games",
      source: attribution.source,
      keyword: attribution.keyword,
      campaign: attribution.campaign,
    };

    isSubmitting = true;
    submitBtn.disabled = true;
    submitBtn.textContent = "Sending...";

    fetch(FORM_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    })
      .then(function (response) {
        if (response.ok === true) {
          unlockDownload(true);
        } else {
          throw new Error("Formspree submission failed: " + response.status);
        }
      })
      .catch(function () {
        showFormMessage(
          "Something went wrong while preparing your guide. Please try again.",
          "error"
        );
      })
      .finally(function () {
        isSubmitting = false;
        submitBtn.disabled = false;
        submitBtn.textContent = "Send Me the 20 Games";
      });
  }

  form.addEventListener("submit", handleSubmit);
  restoreUnlockedStateFromSession();
})();
