const header = document.querySelector("[data-header]");
const menuButton = document.querySelector(".menu-toggle");
const mobileNav = document.querySelector(".mobile-nav");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const updateHeader = () => {
  header?.classList.toggle("scrolled", window.scrollY > 24);
};

updateHeader();
window.addEventListener("scroll", updateHeader, { passive: true });

const closeMenu = () => {
  menuButton?.setAttribute("aria-expanded", "false");
  mobileNav?.classList.remove("open");
  header?.classList.remove("menu-visible");
  document.body.classList.remove("menu-open");
};

menuButton?.addEventListener("click", () => {
  const willOpen = menuButton.getAttribute("aria-expanded") !== "true";
  menuButton.setAttribute("aria-expanded", String(willOpen));
  mobileNav?.classList.toggle("open", willOpen);
  header?.classList.toggle("menu-visible", willOpen);
  document.body.classList.toggle("menu-open", willOpen);
});

mobileNav?.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeMenu();
});

const revealItems = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window && !reduceMotion) {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -50px" },
  );
  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}

const parallaxLayer = document.querySelector("[data-parallax]");
if (parallaxLayer && !reduceMotion) {
  let ticking = false;
  const updateParallax = () => {
    const offset = Math.min(window.scrollY * 0.11, 75);
    parallaxLayer.style.transform = `scale(1.04) translate3d(0, ${offset}px, 0)`;
    ticking = false;
  };

  window.addEventListener(
    "scroll",
    () => {
      if (!ticking && window.scrollY < window.innerHeight * 1.2) {
        window.requestAnimationFrame(updateParallax);
        ticking = true;
      }
    },
    { passive: true },
  );
}

const copyButton = document.querySelector("[data-copy]");
const commands = `cd backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev,yolo]'
cvfuzz run model.pt street.mp4 --config cvfuzz.yaml`;

copyButton?.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(commands);
    copyButton.classList.add("copied");
    copyButton.querySelector("span").textContent = "Copied";
    window.setTimeout(() => {
      copyButton.classList.remove("copied");
      copyButton.querySelector("span").textContent = "Copy";
    }, 1800);
  } catch {
    copyButton.querySelector("span").textContent = "Select text";
  }
});

const year = document.querySelector("[data-year]");
if (year) year.textContent = String(new Date().getFullYear());
