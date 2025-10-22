let currentUser = null;

async function checkAuth() {
  try {
    const r = await fetch("/api/user");
    const d = await r.json();
    if (d.logged_in) currentUser = true;
    else window.location.href = "/";
  } catch (e) {
    console.error(e);
  }
}

checkAuth();

const urlParams = new URLSearchParams(window.location.search);
const prompt = urlParams.get("prompt");
const courseId = urlParams.get("id");

async function fetchCourse(promptText) {
  const r = await fetch("/gc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: promptText }),
  });
  if (!r.ok) throw new Error(r.status);
  const d = await r.json();
  return JSON.parse(d.response);
}

async function fetchCourseById(id) {
  const r = await fetch(`/api/course/${id}`);
  if (!r.ok) throw new Error(r.status);
  const d = await r.json();
  return JSON.parse(d.course_data);
}

async function fetchQuestionsForPart(partObj) {
  const r = await fetch("/gquestions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: JSON.stringify(partObj) }),
  });
  if (!r.ok) throw new Error(r.status);
  const d = await r.json();
  const raw = d.response || d || "";
  try {
    return JSON.parse(raw);
  } catch (e) {
    try {
      const between = ("" + raw).split("```json")[1]?.split("```")[0];
      if (between) return JSON.parse(between);
    } catch (e2) {}
    try {
      return JSON.parse(d);
    } catch (e3) {}
  }
  return [];
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function formatContent(text) {
  const codeBlockRegex = /```(\w+)?\n?([\s\S]*?)```/g;
  let lastIndex = 0,
    html = "",
    match;
  while ((match = codeBlockRegex.exec(text || "")) !== null) {
    if (match.index > lastIndex) {
      let txt = (text || "")
        .substring(lastIndex, match.index)
        .replace(/`([^`]+)`/g, (_, code) => `<code>${escapeHtml(code)}</code>`)
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\n/g, "<br>");
      html += txt;
    }
    const lang = match[1] || "javascript";
    const code = match[2].trim();
    if (code) {
      html += `<div class="code-block-wrapper"><pre><code class="language-${lang}">${escapeHtml(
        code,
      )}</code></pre></div>`;
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < (text || "").length) {
    let txt = (text || "")
      .substring(lastIndex)
      .replace(/`([^`]+)`/g, (_, code) => `<code>${escapeHtml(code)}</code>`)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br>");
    html += txt;
  }
  setTimeout(() => Prism.highlightAll(), 0);
  return html;
}

function showCourseSkeleton() {
  const partsContainer = document.getElementById("parts");
  const courseTitle = document.getElementById("courseTitle");
  const partTitle = document.getElementById("partTitle");
  const courseContent = document.getElementById("courseContent");
  courseTitle.innerHTML =
    '<div class="skeleton" style="width:120px;height:16px;border-radius:6px"></div>';
  partTitle.innerHTML =
    '<div class="skeleton" style="width:160px;height:16px;border-radius:6px"></div>';
  partsContainer.innerHTML = "";
  for (let i = 0; i < 5; i++) {
    const s = document.createElement("div");
    s.className = "skeleton";
    s.style.height = "40px";
    s.style.marginBottom = "8px";
    partsContainer.appendChild(s);
  }
  courseContent.innerHTML =
    '<div class="skeleton-text" style="width:100%"></div><div class="skeleton-text" style="width:80%"></div><div class="skeleton-text" style="width:100%"></div><div style="margin-top:12px"><div class="skeleton" style="height:100px;margin-bottom:8px"></div><div class="skeleton" style="height:100px"></div></div>';
}

function showQuestionSkeleton(targetEl, count = 3) {
  targetEl.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const q = document.createElement("div");
    q.className = "question-wrapper skeleton";
    q.style.padding = "12px";
    q.innerHTML = `<div class="skeleton-text" style="width:60%;height:16px;border-radius:6px"></div><div style="height:8px"></div>${[
      1, 2, 3, 4,
    ]
      .map(
        () =>
          `<div class="skeleton-text" style="height:34px;margin-bottom:8px;border-radius:6px"></div>`,
      )
      .join("")}`;
    targetEl.appendChild(q);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const partsContainer = document.getElementById("parts");
  const courseTitle = document.getElementById("courseTitle");
  const partTitle = document.getElementById("partTitle");
  const courseContent = document.getElementById("courseContent");
  const backBtn = document.getElementById("backBtn");
  const nextBtn = document.getElementById("nextBtn");
  const homeBtn = document.getElementById("homeBtn");
  const sidebar = document.getElementById("sidebar");
  const sidebarToggle = document.getElementById("sidebarToggle");
  const sidebarOverlay = document.getElementById("sidebarOverlay");

  const isMobile = () => window.innerWidth <= 768;

  if (isMobile()) {
    sidebar.classList.add("collapsed");
  }

  sidebarToggle.addEventListener("click", () => {
    const isCollapsed = sidebar.classList.toggle("collapsed");
    if (!isCollapsed && isMobile()) {
      sidebarOverlay.classList.add("active");
    } else {
      sidebarOverlay.classList.remove("active");
    }
  });

  sidebarOverlay.addEventListener("click", () => {
    sidebar.classList.add("collapsed");
    sidebarOverlay.classList.remove("active");
  });

  const closeSidebarOnMobile = () => {
    if (isMobile()) {
      sidebar.classList.add("collapsed");
      sidebarOverlay.classList.remove("active");
    }
  };

  homeBtn.addEventListener("click", () => (window.location.href = "/"));

  if (!prompt && !courseId) {
    courseContent.innerHTML =
      '<p style="color:#f87171">No course specified</p>';
    return;
  }
  showCourseSkeleton();

  let course;
  try {
    course = courseId
      ? await fetchCourseById(courseId)
      : await fetchCourse(prompt);
  } catch (err) {
    console.error(err);
    courseContent.innerHTML =
      '<p style="color:#f87171">Failed to load course.</p>';
    return;
  }
  courseTitle.textContent = course.t || "Untitled Course";
  let currentPart = 0;
  partsContainer.innerHTML = "";
  const questionsCache = {};
  let inQuiz = false;
  let quizPassed = false;
  let quizFailed = false;

  backBtn.addEventListener("click", () => {
    if (inQuiz) return;
    if (currentPart > 0) {
      currentPart--;
      renderPart();
    }
  });

  course.c = Array.isArray(course.c) ? course.c : [];
  course.c.forEach((part, i) => {
    const btn = document.createElement("button");
    btn.textContent = part.n || `Part ${i + 1}`;
    btn.className = "parts-btn";
    btn.style.pointerEvents = "none";
    btn.style.cursor = "not-allowed";

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (!btn.classList.contains("active")) {
        nextBtn.classList.remove("shake-next");
        void nextBtn.offsetWidth;
        nextBtn.classList.add("shake-next");

        setTimeout(() => {
          nextBtn.classList.remove("shake-next");
        }, 500);
      }
    });

    partsContainer.appendChild(btn);
  });

  function updateNextButton() {
    if (quizFailed) {
      nextBtn.innerHTML = '<i class="fa fa-rotate-left"></i>';
      nextBtn.style.color = "rgba(239,68,68,0.9)";
      nextBtn.onclick = () => {
        startQuizForCurrentPart();
      };
    } else if (currentPart === course.c.length - 1 && quizPassed) {
      nextBtn.innerHTML = '<i class="fa fa-check"></i>';
      nextBtn.style.color = "rgba(34,197,94,0.9)";
      nextBtn.onclick = () => {
        window.location.href = "/";
      };
    } else if (quizPassed) {
      nextBtn.innerHTML = '<i class="fa fa-chevron-right"></i>';
      nextBtn.style.color = "rgba(255,255,255,0.75)";
      nextBtn.onclick = () => {
        currentPart++;
        quizPassed = false;
        quizFailed = false;
        renderPart();
      };
    } else {
      nextBtn.innerHTML = '<i class="fa fa-chevron-right"></i>';
      nextBtn.style.color = "rgba(255,255,255,0.75)";
      nextBtn.onclick = () => {
        startQuizForCurrentPart();
      };
    }
  }

  function renderPart() {
    const part = course.c[currentPart] || { d: "", s: [] };
    partTitle.textContent = part.n || `Part ${currentPart + 1}`;
    Array.from(partsContainer.children).forEach((b, i) => {
      b.classList.toggle("active", i === currentPart);
    });
    courseContent.style.opacity = "0";
    setTimeout(() => {
      const sectionsHtml = (part.s || [])
        .map((s) => {
          const hasSnippet = s.s && s.s.trim();
          const codeHtml = hasSnippet
            ? `<div class="code-block-wrapper"><pre><code class="language-javascript">${escapeHtml(
                s.s,
              )}</code></pre></div>`
            : "";
          return `<div style="margin-bottom:12px;border-radius:8px;padding:12px;background:rgba(0,0,0,0.06);border:1px solid rgba(255,255,255,0.03)"><h3 style="font-weight:600;margin-bottom:6px">${escapeHtml(
            s.t || "",
          )}</h3><div class="text-white/[0.7]">${formatContent(
            s.c || "",
          )}</div>${codeHtml}</div>`;
        })
        .join("");
      courseContent.innerHTML = `<div class="content-section">${formatContent(
        part.d || "",
      )}</div><div style="margin-top:18px">${sectionsHtml}</div><div id="quizArea" style="margin-top:18px"></div>`;
      courseContent.style.transition = "opacity .22s";
      courseContent.style.opacity = "1";
      quizPassed = false;
      quizFailed = false;
      inQuiz = false;
      updateNextButton();
    }, 120);
  }

  async function startQuizForCurrentPart() {
    inQuiz = true;
    quizPassed = false;
    quizFailed = false;
    nextBtn.disabled = true;
    backBtn.disabled = true;
    const quizArea = document.getElementById("quizArea");
    showQuestionSkeleton(quizArea, 3);
    try {
      const partObj = course.c[currentPart] || {};
      const qs = await fetchQuestionsForPart(partObj);
      await new Promise((r) => setTimeout(r, 300));
      renderQuiz(qs || []);
    } catch (e) {
      renderQuiz([]);
    }
  }

  function renderQuiz(qs) {
    const quizArea = document.getElementById("quizArea");
    quizArea.innerHTML = "";
    if (!qs || qs.length === 0) {
      const info = document.createElement("div");
      info.style.color = "#fbbf24";
      info.style.padding = "12px";
      info.style.borderRadius = "8px";
      info.style.border = "1px solid rgba(255,255,255,0.04)";
      info.innerHTML = "No questions available for this part.";
      quizArea.appendChild(info);
      inQuiz = false;
      nextBtn.disabled = false;
      backBtn.disabled = false;
      quizPassed = true;
      quizFailed = false;
      updateNextButton();
      return;
    }
    let score = 0;
    let answeredCount = 0;
    const questionEls = [];
    qs.forEach((q, idx) => {
      const wrap = document.createElement("div");
      wrap.className = "question-wrapper q-enter";
      wrap.dataset.qindex = idx;
      wrap.style.transition = "all 0.3s ease";

      const qHead = document.createElement("div");
      qHead.style.fontWeight = "600";
      qHead.style.marginBottom = "8px";
      qHead.innerHTML = escapeHtml(q.q || "");
      wrap.appendChild(qHead);
      const opts = document.createElement("div");
      opts.style.marginBottom = "6px";
      ["a1", "a2", "a3", "a4"].forEach((key) => {
        const btn = document.createElement("button");
        btn.className = "opt-btn";
        btn.type = "button";
        btn.dataset.opt = key;
        btn.innerHTML = escapeHtml(q[key] || "");
        btn.style.transition = "all 0.3s ease";

        btn.addEventListener("click", () => {
          if (wrap.dataset.locked) return;
          wrap.dataset.locked = "1";
          answeredCount++;
          const correctKey = q.correct;

          setTimeout(() => {
            if (btn.dataset.opt === correctKey) {
              score++;
              wrap.classList.add("q-correct");
              btn.classList.add("opt-correct");
            } else {
              wrap.classList.add("q-wrong");
              btn.classList.add("opt-wrong");
              const correctBtns = Array.from(
                opts.querySelectorAll("button"),
              ).filter((b) => b.dataset.opt === correctKey);
              correctBtns.forEach((cb) => {
                cb.classList.add("opt-correct");
              });
            }
          }, 50);

          Array.from(opts.querySelectorAll("button")).forEach((b) => {
            b.classList.add("disabled-opt");
            b.disabled = true;
          });

          const explain = document.createElement("div");
          explain.className = "explain";
          explain.innerHTML = `<i class="fa fa-lightbulb" style="color:#fbbf24;margin-top:3px"></i><div><div style="font-weight:600;margin-bottom:4px">${
            btn.dataset.opt === q.correct ? "Correct" : "Incorrect"
          }</div><div style="font-size:13px;color:rgba(255,255,255,0.9)">${escapeHtml(
            q.correct_explain || "",
          )}</div></div>`;
          wrap.appendChild(explain);

          setTimeout(() => {
            explain.classList.add("show");
          }, 100);

          if (answeredCount === qs.length) {
            const percent = Math.round((score / qs.length) * 100);
            if (percent >= 50) {
              quizPassed = true;
              quizFailed = false;
              inQuiz = false;
              nextBtn.disabled = false;
              backBtn.disabled = false;
              updateNextButton();
            } else {
              quizPassed = false;
              quizFailed = true;
              inQuiz = false;
              nextBtn.disabled = false;
              backBtn.disabled = false;
              updateNextButton();
            }
          }
        });
        opts.appendChild(btn);
      });
      wrap.appendChild(opts);
      quizArea.appendChild(wrap);
      questionEls.push(wrap);
    });
    setTimeout(() => {
      questionEls.forEach((el, i) => {
        setTimeout(() => {
          el.classList.remove("skeleton");
          el.classList.remove("q-enter");
          el.classList.add("q-enter-active");

          if (i === 0) {
            setTimeout(() => {
              el.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 100);
          }
        }, i * 80);
      });
      nextBtn.disabled = false;
      backBtn.disabled = false;
    }, 60);
  }

  renderPart();
});
