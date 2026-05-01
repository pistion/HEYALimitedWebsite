document.addEventListener("DOMContentLoaded", () => {
  const hamburger = document.getElementById("hamburger");
  const mobileMenu = document.getElementById("mobile-menu");

  const closeMenu = () => {
    if (!hamburger || !mobileMenu) return;
    mobileMenu.classList.remove("open");
    hamburger.classList.remove("is-open");
    hamburger.setAttribute("aria-expanded", "false");
  };

  if (hamburger && mobileMenu) {
    hamburger.addEventListener("click", () => {
      const open = mobileMenu.classList.toggle("open");
      hamburger.classList.toggle("is-open", open);
      hamburger.setAttribute("aria-expanded", String(open));
    });

    mobileMenu.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", closeMenu);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeMenu();
    });
  }

  const params = new URLSearchParams(window.location.search);
  const packageInterest = params.get("package");
  const packageInput = document.getElementById("packageInterest");
  if (packageInterest && packageInput) {
    packageInput.value = packageInterest;
  }

  const setStatus = (form, message, state) => {
    const status = form.querySelector(".form-status");
    if (!status) return;
    status.textContent = message;
    status.dataset.state = state;
  };

  const submitJson = async (form, endpoint, successMessage) => {
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const submit = form.querySelector('button[type="submit"]');
    const originalLabel = submit ? submit.textContent : "";
    const payload = Object.fromEntries(new FormData(form));

    if (submit) {
      submit.disabled = true;
      submit.textContent = "Submitting...";
    }
    setStatus(form, "Sending...", "loading");

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.error || "Something went wrong. Please try again.");
      }
      form.reset();
      setStatus(form, result.message || successMessage, "success");
    } catch (error) {
      setStatus(form, error.message || "Unable to send. Please try again.", "error");
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.textContent = originalLabel;
      }
    }
  };

  const contactForm = document.getElementById("contact-form") || document.getElementById("contactForm");
  if (contactForm) {
    contactForm.addEventListener("submit", (event) => {
      event.preventDefault();
      submitJson(contactForm, "/api/contact", "Thank you. Your enquiry has been received.");
    });
  }

  const advertiseForm = document.getElementById("advertise-form") || document.getElementById("advertiseForm");
  if (advertiseForm) {
    advertiseForm.addEventListener("submit", (event) => {
      event.preventDefault();
      submitJson(advertiseForm, "/api/advertise", "Your vacancy enquiry has been submitted.");
    });
  }
});

(() => {
  const initWireframeCanvas = (canvas) => {
    if (!canvas) return;

    const context = canvas.getContext("2d");
    const hero = canvas.closest(".hero, .page-hero");
    if (!context || !hero) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pointer = {
      active: false,
      x: 0,
      y: 0
    };

    let width = 0;
    let height = 0;
    let points = [];
    let frame = null;
    let resizeTimer = null;

    const settings = {
      density: 26000,
      minPoints: 34,
      maxPoints: 74,
      maxEdge: 178,
      pointerEdge: 210
    };

    const random = (min, max) => Math.random() * (max - min) + min;

    const applyLayer = () => {
      canvas.hidden = false;

      if (window.getComputedStyle(hero).position === "static") {
        hero.style.position = "relative";
      }
      hero.style.overflow = "hidden";
      hero.style.isolation = "isolate";

      Object.assign(canvas.style, {
        position: "absolute",
        inset: "0",
        width: "100%",
        height: "100%",
        zIndex: "0",
        pointerEvents: "none",
        opacity: "0.46"
      });

      Array.from(hero.children).forEach((child) => {
        if (child === canvas) return;
        if (window.getComputedStyle(child).position === "static") {
          child.style.position = "relative";
        }
        child.style.zIndex = "1";
      });
    };

    const createPoints = () => {
      const count = Math.round(Math.min(settings.maxPoints, Math.max(settings.minPoints, (width * height) / settings.density)));
      points = Array.from({ length: count }, () => ({
        x: random(-20, width + 20),
        y: random(-20, height + 20),
        vx: random(-0.14, 0.14),
        vy: random(-0.12, 0.12),
        radius: random(0.8, 1.8)
      }));
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      createPoints();
    };

    const nearest = (point, limit = 3) => points
      .filter((candidate) => candidate !== point)
      .map((candidate) => ({
        point: candidate,
        distance: Math.hypot(point.x - candidate.x, point.y - candidate.y)
      }))
      .filter((candidate) => candidate.distance < settings.maxEdge)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit);

    const move = (point) => {
      if (reduceMotion) return;

      point.x += point.vx;
      point.y += point.vy;

      if (point.x < -30 || point.x > width + 30) point.vx *= -1;
      if (point.y < -30 || point.y > height + 30) point.vy *= -1;
    };

    const drawTriangle = (a, b, c, alpha) => {
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.lineTo(c.x, c.y);
      context.closePath();
      context.fillStyle = `rgba(201, 162, 39, ${alpha})`;
      context.fill();
    };

    const drawLine = (a, b, distance, limit, color) => {
      const strength = Math.max(0, 1 - distance / limit);
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.strokeStyle = color(strength);
      context.lineWidth = 0.55 + strength * 0.65;
      context.stroke();
    };

    const draw = () => {
      const drawnEdges = new Set();
      const drawnTriangles = new Set();
      context.clearRect(0, 0, width, height);

      points.forEach(move);

      points.forEach((point, index) => {
        const close = nearest(point, 4);

        if (close.length >= 2) {
          const tri = [index, points.indexOf(close[0].point), points.indexOf(close[1].point)].sort((a, b) => a - b).join("-");
          const edgeDistance = Math.hypot(close[0].point.x - close[1].point.x, close[0].point.y - close[1].point.y);
          if (!drawnTriangles.has(tri) && edgeDistance < settings.maxEdge) {
            drawnTriangles.add(tri);
            drawTriangle(point, close[0].point, close[1].point, 0.018 + (1 - edgeDistance / settings.maxEdge) * 0.032);
          }
        }

        close.forEach(({ point: neighbor, distance }) => {
          const neighborIndex = points.indexOf(neighbor);
          const edge = [index, neighborIndex].sort((a, b) => a - b).join("-");
          if (drawnEdges.has(edge)) return;
          drawnEdges.add(edge);
          drawLine(point, neighbor, distance, settings.maxEdge, (alpha) => `rgba(240, 207, 106, ${alpha * 0.32})`);
        });

        if (pointer.active) {
          const pointerDistance = Math.hypot(point.x - pointer.x, point.y - pointer.y);
          if (pointerDistance < settings.pointerEdge) {
            drawLine(point, pointer, pointerDistance, settings.pointerEdge, (alpha) => `rgba(255, 255, 255, ${alpha * 0.28})`);
          }
        }

        context.beginPath();
        context.arc(point.x, point.y, point.radius, 0, Math.PI * 2);
        context.fillStyle = "rgba(255, 232, 154, 0.74)";
        context.fill();
      });

      if (!reduceMotion && !document.hidden) {
        frame = window.requestAnimationFrame(draw);
      }
    };

    const restart = () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
        frame = null;
      }
      draw();
    };

    applyLayer();
    resize();
    restart();

    hero.addEventListener("pointermove", (event) => {
      const rect = canvas.getBoundingClientRect();
      pointer.active = true;
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
    }, { passive: true });

    hero.addEventListener("pointerleave", () => {
      pointer.active = false;
    });

    window.addEventListener("resize", () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        resize();
        restart();
      }, 120);
    }, { passive: true });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden && frame) {
        window.cancelAnimationFrame(frame);
        frame = null;
        return;
      }

      if (!document.hidden) {
        restart();
      }
    });
  };

  const initHeroWireframe = () => {
    document.querySelectorAll(".wireframe-canvas, #heroWireframeCanvas").forEach(initWireframeCanvas);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHeroWireframe);
  } else {
    initHeroWireframe();
  }
})();
