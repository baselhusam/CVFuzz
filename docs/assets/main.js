const header = document.querySelector("[data-header]");
const menuButton = document.querySelector(".menu-toggle");
const mobileNav = document.querySelector(".mobile-nav");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const updateHeader = () => header?.classList.toggle("scrolled", window.scrollY > 24);
updateHeader(); window.addEventListener("scroll", updateHeader, { passive: true });
const closeMenu = () => { menuButton?.setAttribute("aria-expanded", "false"); mobileNav?.classList.remove("open"); document.body.classList.remove("menu-open"); };
menuButton?.addEventListener("click", () => { const open = menuButton.getAttribute("aria-expanded") !== "true"; menuButton.setAttribute("aria-expanded", String(open)); mobileNav?.classList.toggle("open", open); document.body.classList.toggle("menu-open", open); });
mobileNav?.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
window.addEventListener("keydown", (event) => event.key === "Escape" && closeMenu());
const revealItems = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window && !reduceMotion) { const observer = new IntersectionObserver((entries, activeObserver) => entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add("is-visible"); activeObserver.unobserve(entry.target); } }), { threshold: 0.12, rootMargin: "0px 0px -48px" }); revealItems.forEach((item) => observer.observe(item)); } else revealItems.forEach((item) => item.classList.add("is-visible"));
const parallax = document.querySelector("[data-parallax]");
if (parallax && !reduceMotion) { let ticking = false; window.addEventListener("scroll", () => { if (ticking || window.scrollY > window.innerHeight * 1.15) return; window.requestAnimationFrame(() => { parallax.style.transform = `scale(1.05) translate3d(0, ${Math.min(window.scrollY * 0.085, 64)}px, 0)`; ticking = false; }); ticking = true; }, { passive: true }); }
const copyButton = document.querySelector("[data-copy]");
copyButton?.addEventListener("click", async () => { try { await navigator.clipboard.writeText("cvfuzz run model.pt street.mp4 --config cvfuzz.yaml"); copyButton.querySelector("span").textContent = "Copied"; window.setTimeout(() => { copyButton.querySelector("span").textContent = "Copy"; }, 1500); } catch { copyButton.querySelector("span").textContent = "Select"; } });
const year = document.querySelector("[data-year]"); if (year) year.textContent = String(new Date().getFullYear());
