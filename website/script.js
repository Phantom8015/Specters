function openGitHub() {
  window.open(
    "https://github.com/Phantom8015/Specters",
    "_blank",
    "noopener,noreferrer",
  );
}

function scrollToSection(sectionId) {
  const element = document.getElementById(sectionId);
  if (element) {
    element.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }
}

function copyToClipboard(button) {
  const codeBlock = button.parentElement;
  const code = codeBlock.querySelector("code");
  const text = code.textContent;

  navigator.clipboard
    .writeText(text)
    .then(() => {
      const originalText = button.textContent;
      button.textContent = "✅";
      button.style.color = "#4ade80";

      setTimeout(() => {
        button.textContent = originalText;
        button.style.color = "";
      }, 2000);
    })
    .catch(() => {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);

      const originalText = button.textContent;
      button.textContent = "✅";
      button.style.color = "#4ade80";

      setTimeout(() => {
        button.textContent = originalText;
        button.style.color = "";
      }, 2000);
    });
}

const observerOptions = {
  threshold: 0.1,
  rootMargin: "0px 0px -50px 0px",
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = "1";
      entry.target.style.transform = "translateY(0)";
    }
  });
}, observerOptions);

document.addEventListener("DOMContentLoaded", () => {
  const animatedElements = document.querySelectorAll(
    ".feature-card, .download-info, .download-steps, .demo-content > *",
  );

  animatedElements.forEach((el) => {
    el.style.opacity = "0";
    el.style.transform = "translateY(30px)";
    el.style.transition = "opacity 0.6s ease, transform 0.6s ease";
    observer.observe(el);
  });

  const browserMockup = document.querySelector(".browser-mockup");
  if (browserMockup) {
    VanillaTilt.init(browserMockup, {
      max: 10,
      speed: 400,
      perspective: 1000,
      glare: true,
      "max-glare": 0.2,
    });

    const iframe = browserMockup.querySelector("iframe");
    const browserContent = browserMockup.querySelector(".browser-content");

    if (iframe && browserContent) {
      ["mousemove", "mouseenter", "mouseleave"].forEach((eventType) => {
        browserContent.addEventListener(eventType, (e) => {
          const newEvent = new MouseEvent(eventType, {
            clientX: e.clientX,
            clientY: e.clientY,
            bubbles: true,
          });
          browserMockup.dispatchEvent(newEvent);
        });
      });
    }
  }

  new FeaturesCarousel();

  document.querySelectorAll(".nav-links a").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const targetId = link.getAttribute("href").substring(1);
      scrollToSection(targetId);
    });
  });

  const downloadBtn = document.querySelector(".download-btn");
  if (downloadBtn) {
    downloadBtn.addEventListener("click", () => {
      scrollToSection("download");
    });
  }
});

window.addEventListener("scroll", () => {
  const scrolled = window.pageYOffset;
  const heroBackground = document.querySelector(".hero-bg");
  if (heroBackground) {
    const rate = scrolled * -0.5;
    heroBackground.style.transform = `translate3d(0, ${rate}px, 0)`;
  }
});

class FeaturesCarousel {
  constructor() {
    this.currentSlide = 0;
    this.totalSlides = document.querySelectorAll(".feature-card").length;
    this.track = document.getElementById("feature-track");
    this.prevBtn = document.getElementById("prev-btn");
    this.nextBtn = document.getElementById("next-btn");
    this.dots = document.querySelectorAll(".dot");

    this.init();
  }

  init() {
    this.updateCarousel();
    this.addEventListeners();
    this.startAutoPlay();
  }

  addEventListeners() {
    this.prevBtn.addEventListener("click", () => this.prevSlide());
    this.nextBtn.addEventListener("click", () => this.nextSlide());

    this.dots.forEach((dot, index) => {
      dot.addEventListener("click", () => this.goToSlide(index));
    });

    document
      .querySelector(".features-carousel")
      .addEventListener("mouseenter", () => {
        this.stopAutoPlay();
      });

    document
      .querySelector(".features-carousel")
      .addEventListener("mouseleave", () => {
        this.startAutoPlay();
      });
  }

  updateCarousel() {
    const offset = -this.currentSlide * 100;
    this.track.style.transform = `translateX(${offset}%)`;

    document.querySelectorAll(".feature-card").forEach((card, index) => {
      card.classList.toggle("active", index === this.currentSlide);
    });

    this.dots.forEach((dot, index) => {
      dot.classList.toggle("active", index === this.currentSlide);
    });

    this.prevBtn.disabled = this.currentSlide === 0;
    this.nextBtn.disabled = this.currentSlide === this.totalSlides - 1;
  }

  nextSlide() {
    if (this.currentSlide < this.totalSlides - 1) {
      this.currentSlide++;
      this.updateCarousel();
    }
  }

  prevSlide() {
    if (this.currentSlide > 0) {
      this.currentSlide--;
      this.updateCarousel();
    }
  }

  goToSlide(index) {
    this.currentSlide = index;
    this.updateCarousel();
  }

  startAutoPlay() {
    this.autoPlayInterval = setInterval(() => {
      if (this.currentSlide === this.totalSlides - 1) {
        this.currentSlide = 0;
      } else {
        this.currentSlide++;
      }
      this.updateCarousel();
    }, 5000);
  }

  stopAutoPlay() {
    if (this.autoPlayInterval) {
      clearInterval(this.autoPlayInterval);
    }
  }
}
