function setupNavUserMenu(options) {
  const { getIsLoggedIn, onGuestClick, onLogout } = options;
  const root = document.getElementById("nav-user-root");
  const trigger = document.getElementById("auth-btn");
  const dropdown = document.getElementById("user-dropdown");
  const logoutItem = document.getElementById("logout-dropdown-btn");

  if (!trigger || !dropdown) {
    return;
  }

  function closeDropdown() {
    dropdown.classList.add("hidden");
    trigger.setAttribute("aria-expanded", "false");
    dropdown.setAttribute("aria-hidden", "true");
  }

  function openDropdown() {
    dropdown.classList.remove("hidden");
    trigger.setAttribute("aria-expanded", "true");
    dropdown.setAttribute("aria-hidden", "false");
  }

  function toggleDropdown() {
    if (dropdown.classList.contains("hidden")) {
      openDropdown();
    } else {
      closeDropdown();
    }
  }

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    if (getIsLoggedIn()) {
      toggleDropdown();
    } else {
      closeDropdown();
      onGuestClick();
    }
  });

  logoutItem?.addEventListener("click", () => {
    closeDropdown();
    onLogout();
  });

  dropdown.querySelectorAll('a[href="/profile.html"]').forEach((link) => {
    link.addEventListener("click", () => closeDropdown());
  });

  document.addEventListener("click", (event) => {
    const wrap = root || trigger.closest(".nav-user");
    if (wrap && !wrap.contains(event.target)) {
      closeDropdown();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeDropdown();
    }
  });

  return { closeDropdown };
}
