// Shared submission-form handling for Voices and Perspectives.
// The form element must have data-submission-type="voices" or "perspectives".

document.addEventListener("DOMContentLoaded", () => {
  const countrySelect = document.getElementById("country_slug");
  if (countrySelect && window.VALORE_COUNTRIES) {
    Object.entries(window.VALORE_COUNTRIES)
      .sort((a, b) => a[1].name.localeCompare(b[1].name))
      .forEach(([slug, c]) => {
        const opt = document.createElement("option");
        opt.value = slug;
        opt.textContent = c.name;
        countrySelect.appendChild(opt);
      });
  }

  const form = document.getElementById("submitForm");
  if (!form) return;

  const subType = form.dataset.submissionType;
  const statusEl = document.getElementById("formStatus");
  const submitBtn = form.querySelector('button[type="submit"]');

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function showStatus(kind, message) {
    statusEl.className = `form-status visible ${kind}`;
    statusEl.textContent = message;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting…";
    statusEl.className = "form-status";

    try {
      const fd = new FormData(form);
      let imageDataUrl = null;
      const fileInput = form.querySelector('input[type="file"]');
      if (fileInput && fileInput.files && fileInput.files[0]) {
        const file = fileInput.files[0];
        if (file.size > 5 * 1024 * 1024) {
          showStatus("err", "Image is too large. 5MB max.");
          submitBtn.disabled = false;
          submitBtn.textContent = "Submit";
          return;
        }
        imageDataUrl = await fileToDataUrl(file);
      }

      const payload = {
        type: subType,
        country_slug: fd.get("country_slug") || "",
        display_name: fd.get("display_name") || "",
        contact_email: fd.get("contact_email") || "",
        language: fd.get("language") || "",
        title: fd.get("title") || "",
        original_text: fd.get("original_text") || "",
        english_text: fd.get("english_text") || "",
        image_data_url: imageDataUrl,
        consent: form.querySelector('input[name="consent"]').checked,
        website: fd.get("website") || "", // honeypot — must stay empty
      };

      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        showStatus("err", data.error || "Something went wrong. Please try again.");
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit";
        return;
      }

      if (data.status === "approved") {
        showStatus("ok", "Thank you. Your submission is live now.");
      } else if (data.status === "rejected") {
        showStatus("err", "This submission couldn't be published. If you think that's a mistake, contact us.");
      } else {
        showStatus("ok", "Thank you. Your submission is in for review and will be published once approved.");
      }
      form.reset();
      submitBtn.textContent = "Submit";
    } catch (error) {
      showStatus("err", "Couldn't reach the server. Please try again.");
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit";
    }
  });
});
