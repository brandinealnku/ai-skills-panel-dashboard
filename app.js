let dashboardData;

async function loadData() {
  const response = await fetch("./data.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to load data.json (${response.status})`);
  return response.json();
}

function setHero(data) {
  // Your JSON: data.takeaway.headline + data.takeaway.subhead
  document.getElementById("hero-title").textContent = "AI Skills for Job-Market Readiness";
  document.getElementById("hero-takeaway-1").textContent = data.takeaway?.headline ?? "";
  document.getElementById("hero-takeaway-2").textContent = data.takeaway?.subhead ?? "";

  const lastUpdatedEl = document.getElementById("last-updated");
  lastUpdatedEl.textContent = data.lastUpdated ?? "";
  lastUpdatedEl.dateTime = data.lastUpdated ?? "";
}

function renderCoreSkills(data) {
  const grid = document.getElementById("core-skills-grid");
  grid.innerHTML = "";

  (data.coreSkills ?? []).forEach((skill) => {
    const card = document.createElement("article");
    card.className = "skill-card";
    card.setAttribute("role", "listitem");

    const title = document.createElement("h3");
    title.textContent = skill.title ?? "";

    const description = document.createElement("p");
    // Your JSON uses "desc"
    description.textContent = skill.desc ?? "";

    card.append(title, description);
    grid.append(card);
  });
}

function createLineChart(data) {
  const trend = data.charts?.aiMentionsTrend;
  if (!trend) return;

  const labels = trend.labels ?? [];
  const values = trend.values ?? [];

  new Chart(document.getElementById("aiMentionsTrendChart"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Share of job postings mentioning AI (%)",
          data: values,
          fill: true,
          tension: 0.24,
          pointRadius: 3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: "Percent of postings (%)" }
        }
      }
    }
  });
}

function createBarChart(data) {
  const byFamily = data.charts?.aiMentionsByFamily;
  if (!byFamily) return;

  const labels = byFamily.labels ?? [];
  const values = byFamily.values ?? [];

  new Chart(document.getElementById("aiMentionsByFamilyChart"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Percent of postings (%)",
          data: values
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { title: { display: true, text: "Job family" } },
        y: {
          beginAtZero: true,
          title: { display: true, text: "Percent of postings (%)" }
        }
      }
    }
  });
}

function createDonutChart(data) {
  const share = data.charts?.aiOutsideITShare;
  if (!share) return;

  const labels = share.labels ?? [];
  const values = share.values ?? [];

  new Chart(document.getElementById("aiOutsideITShareChart"), {
    type: "doughnut",
    data: {
      labels,
      datasets: [{ data: values }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom" }
      }
    }
  });
}

function renderJobFamilyExplorer(data) {
  const buttonGroup = document.getElementById("job-family-buttons");
  const title = document.getElementById("selected-family-title");
  const list = document.getElementById("selected-family-skills");

  buttonGroup.innerHTML = "";
  title.textContent = "";
  list.innerHTML = "";

  const families = Object.keys(data.jobFamilies ?? {});
  if (families.length === 0) return;

  function showFamily(familyName) {
    title.textContent = familyName;

    const skillsArray = data.jobFamilies[familyName] ?? [];
    list.innerHTML = "";
    skillsArray.forEach((skill) => {
      const item = document.createElement("li");
      item.textContent = skill;
      list.append(item);
    });

    [...buttonGroup.querySelectorAll("button")].forEach((btn) => {
      const isSelected = btn.dataset.family === familyName;
      btn.setAttribute("aria-selected", String(isSelected));
      btn.tabIndex = isSelected ? 0 : -1;
    });
  }

  families.forEach((familyName, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "family-btn";
    button.dataset.family = familyName;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", "selected-family-skills");
    button.setAttribute("aria-selected", index === 0 ? "true" : "false");
    button.textContent = familyName;

    button.addEventListener("click", () => showFamily(familyName));
    buttonGroup.append(button);
  });

  showFamily(families[0]);
}

function renderSources(data) {
  const list = document.getElementById("sources-list");
  list.innerHTML = "";

  (data.sources ?? []).forEach((source) => {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = source.url ?? "#";
    // Your JSON uses "name"
    link.textContent = source.name ?? source.url ?? "Source";
    link.target = "_blank";
    link.rel = "noopener noreferrer";

    item.append(link);
    list.append(item);
  });
}

function init(data) {
  setHero(data);
  renderCoreSkills(data);
  createLineChart(data);
  createBarChart(data);
  createDonutChart(data);
  renderJobFamilyExplorer(data);
  renderSources(data);
}

loadData()
  .then((data) => {
    dashboardData = data;
    init(dashboardData);
  })
  .catch((error) => {
    console.error(error);
    const container = document.querySelector(".hero .container");
    const problem = document.createElement("p");
    problem.textContent = `Could not load dashboard data: ${error.message}`;
    problem.style.color = "#b91c1c";
    container.append(problem);
  });
